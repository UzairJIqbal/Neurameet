import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import { assertMinutesUnlocked } from "@/lib/minutes-lock";
import { parseMeetingDate } from "@/lib/meeting-date";
import {
  accessErrorResponse,
  checkMeetingAccess,
  type MeetingAccess,
} from "@/lib/project-auth";

type Supabase = ReturnType<typeof supabaseServer>;

// A recorded attendee of the meeting. Guests may have a NULL user_id in
// attendance_events, so match on stream_user_id (the guest's Stream identity) too.
async function hasAttended(
  supabase: Supabase,
  meetingId: string,
  userId: string,
): Promise<boolean> {
  const { data: part } = await supabase
    .from("attendance_events")
    .select("user_id")
    .eq("meeting_id", meetingId)
    .eq("user_id", userId)
    .limit(1);
  if (part && part.length > 0) return true;
  const { data: guestPart } = await supabase
    .from("attendance_events")
    .select("user_id")
    .eq("meeting_id", meetingId)
    .eq("stream_user_id", userId)
    .limit(1);
  return !!guestPart && guestPart.length > 0;
}

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { title, rawText, meetingId, meetingDate } = body as {
      title?: string;
      rawText?: string;
      meetingId?: string;
      meetingDate?: unknown;
    };

    if (!title || title.trim().length === 0) {
      return NextResponse.json(
        { error: "Meeting title is required" },
        { status: 400 },
      );
    }

    if (!rawText || rawText.trim().length === 0) {
      return NextResponse.json(
        { error: "Transcript content is required" },
        { status: 400 },
      );
    }

    const supabase = supabaseServer();

    // When a meetingId is supplied (e.g. the recap "Upload Transcript" for a
    // real call), attach the transcript to that EXISTING meeting instead of
    // creating a duplicate. This keeps the transcript linked to the call's
    // attendance + recording, fixing P11 (a) Attendance Report + (d) Recording
    // tab. The caller must own the meeting.
    let meetingIdResolved: string;
    // AI processing (/api/ai/process) is owner-only, so tell the client whether
    // to run it instead of letting a participant hit a failure after upload.
    let canProcess = true;
    if (meetingId) {
      const { data: existing, error: existingErr } = await supabase
        .from("meetings")
        .select("id, user_id, project_id")
        .eq("id", meetingId)
        .single();
      if (existingErr || !existing) {
        return NextResponse.json(
          { error: "Meeting not found or not authorized" },
          { status: 403 },
        );
      }
      // Personal meeting: allow the owner, or any recorded participant. A person
      // can be in the same call under a different Clerk account than the one
      // that created it (e.g. two Gmail sign-ins), so a strict owner check would
      // block a legitimate upload. Everyone else is still rejected. Project
      // meeting: Owner or Admin (spec 0004, manage).
      let access: MeetingAccess;
      try {
        access = await checkMeetingAccess(
          supabase,
          userId,
          existing,
          "manage",
          {
            personalFallback: () => hasAttended(supabase, existing.id, userId),
            personalDenied: {
              status: 403,
              message: "Meeting not found or not authorized",
            },
          },
        );
      } catch (err) {
        const denied = accessErrorResponse(err);
        if (denied) return denied;
        throw err;
      }
      // Tasdeeq AC-7: never rewrite a transcript under a minutes review.
      const locked = await assertMinutesUnlocked(supabase, existing.id);
      if (locked) return locked;
      meetingIdResolved = existing.id;
      // A project caller passed the manage check, so they may run processing.
      canProcess = access.projectId !== null || existing.user_id === userId;
    } else {
      // No meetingId supplied, so this is an external transcript (a meeting from
      // another platform with no NeuraMeet call): create a fresh meetings row to
      // anchor the transcript + insights. A transcript generated from a real call
      // always carries its meeting id in the filename (meeting-<id>-transcript.txt)
      // and the upload modal parses that back into a meetingId, so it takes the
      // branch above and attaches to the existing call — same flow, same outcome,
      // whether the user uploads from the recap page or the Dashboard.
      // Optional meeting date (Promise Ledger AC-5): anchors relative due
      // dates. Only a new meeting takes it; an attach ignores it entirely.
      const date = parseMeetingDate(meetingDate, new Date());
      if (!date.ok) {
        return NextResponse.json({ error: date.error }, { status: 400 });
      }
      const startedAt = date.startedAt ?? new Date().toISOString();

      const { data: meeting, error: meetingError } = await supabase
        .from("meetings")
        .insert({
          user_id: userId,
          stream_call_id: `upload_${crypto.randomUUID()}`,
          title: title.trim(),
          status: "ended",
          started_at: startedAt,
          ended_at: startedAt,
        })
        .select("id")
        .single();

      if (meetingError) {
        console.error("Failed to create meeting:", meetingError);
        return NextResponse.json(
          { error: "Failed to create meeting" },
          { status: 500 },
        );
      }
      meetingIdResolved = meeting.id;
    }

    // Store the transcript. Upsert on the unique meeting_id so a re-upload
    // replaces the prior transcript in one write: if it fails, the old one stays.
    const { error: transcriptError } = await supabase
      .from("transcripts")
      .upsert(
        {
          meeting_id: meetingIdResolved,
          source: "upload",
          raw_text: rawText.trim(),
          processing_state: "ready",
        },
        { onConflict: "meeting_id" },
      );

    if (transcriptError) {
      console.error("Failed to store transcript:", transcriptError);
      return NextResponse.json(
        { error: "Failed to store transcript" },
        { status: 500 },
      );
    }

    return NextResponse.json({ meetingId: meetingIdResolved, canProcess });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    console.error("Transcript upload error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
