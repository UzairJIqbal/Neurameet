import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { title, rawText, meetingId } = body as {
      title?: string;
      rawText?: string;
      meetingId?: string;
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
    if (meetingId) {
      const { data: existing, error: existingErr } = await supabase
        .from("meetings")
        .select("id, user_id")
        .eq("id", meetingId)
        .single();
      if (existingErr || !existing) {
        return NextResponse.json(
          { error: "Meeting not found or not authorized" },
          { status: 403 },
        );
      }
      // Allow the owner, or any recorded participant of the meeting. A person can
      // be in the same call under a different Clerk account than the one that
      // created it (e.g. two Gmail sign-ins), so a strict owner check would block
      // a legitimate upload with "Meeting not found or not authorized". Everyone
      // else is still rejected.
      if (existing.user_id !== userId) {
        const { data: part } = await supabase
          .from("attendance_events")
          .select("user_id")
          .eq("meeting_id", existing.id)
          .eq("user_id", userId)
          .limit(1);
        if (!part || part.length === 0) {
          // Guests may have a NULL user_id in attendance_events;
          // match on stream_user_id (the guest's Stream identity).
          const { data: guestPart } = await supabase
            .from("attendance_events")
            .select("user_id")
            .eq("meeting_id", existing.id)
            .eq("stream_user_id", userId)
            .limit(1);
          if (!guestPart || guestPart.length === 0) {
            return NextResponse.json(
              { error: "Meeting not found or not authorized" },
              { status: 403 },
            );
          }
        }
      }
      meetingIdResolved = existing.id;
      // Replace any prior transcript for this meeting so a re-upload is
      // idempotent (the process route then clears prior insights/items).
      const { error: delErr } = await supabase
        .from("transcripts")
        .delete()
        .eq("meeting_id", meetingIdResolved);
      if (delErr) {
        console.error("Failed to clear prior transcript:", delErr);
      }
    } else {
      // No meetingId supplied, so this is an external transcript (a meeting from
      // another platform with no NeuraMeet call): create a fresh meetings row to
      // anchor the transcript + insights. A transcript generated from a real call
      // always carries its meeting id in the filename (meeting-<id>-transcript.txt)
      // and the upload modal parses that back into a meetingId, so it takes the
      // branch above and attaches to the existing call — same flow, same outcome,
      // whether the user uploads from the recap page or the Dashboard.
      const { data: meeting, error: meetingError } = await supabase
        .from("meetings")
        .insert({
          user_id: userId,
          stream_call_id: `upload_${crypto.randomUUID()}`,
          title: title.trim(),
          status: "ended",
          started_at: new Date().toISOString(),
          ended_at: new Date().toISOString(),
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

    // Store the transcript
    const { error: transcriptError } = await supabase
      .from("transcripts")
      .insert({
        meeting_id: meetingIdResolved,
        source: "upload",
        raw_text: rawText.trim(),
        processing_state: "ready",
      });

    if (transcriptError) {
      console.error("Failed to store transcript:", transcriptError);
      return NextResponse.json(
        { error: "Failed to store transcript" },
        { status: 500 },
      );
    }

    return NextResponse.json({ meetingId: meetingIdResolved });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    console.error("Transcript upload error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
