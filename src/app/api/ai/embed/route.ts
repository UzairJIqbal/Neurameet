/* eslint-disable prettier/prettier */
import { after, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import { embedMeeting, maybeRunLedgerMatch } from "@/agent/meeting-pipeline";
import { accessErrorResponse, checkMeetingAccess } from "@/lib/project-auth";

// True when the caller has an attendance row for the meeting. Guests may have
// a NULL user_id in attendance_events, so the Stream identity is checked too.
async function isRecordedParticipant(
  meetingId: string,
  userId: string,
): Promise<boolean> {
  const supabase = supabaseServer();
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
    const { meetingId } = body as { meetingId?: string };

    if (!meetingId) {
      return NextResponse.json(
        { error: "Meeting ID is required" },
        { status: 400 },
      );
    }

    const supabase = supabaseServer();

    // Scope check: the meeting must exist and the caller must be the owner OR a
    // recorded participant. This mirrors the lenient ownership rule in
    // /api/transcript/upload — a participant may upload a transcript under a
    // different Clerk account than the creator, so a strict owner-only check
    // here would wrongly reject the embed that follows their own upload and
    // surface "Meeting not found" (404) to the client.
    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select("id, user_id, project_id")
      .eq("id", meetingId)
      .single();

    if (meetingError || !meeting) {
      console.error("Meeting not found:", meetingError);
      return NextResponse.json(
        { error: "Meeting not found" },
        { status: 404 },
      );
    }

    // Personal meeting: owner or recorded participant (the fallback below).
    // Project meeting: owner or admin ("manage" need).
    try {
      await checkMeetingAccess(supabase, userId, meeting, "manage", {
        personalFallback: () => isRecordedParticipant(meeting.id, userId),
      });
    } catch (accessErr) {
      const denied = accessErrorResponse(accessErr);
      if (!denied) throw accessErr;
      console.error("Meeting not authorized for user:", userId);
      return denied;
    }

    const outcome = await embedMeeting(supabase, { meetingId, source: "page" });
    if (outcome.status === "no_transcript") {
      return NextResponse.json(
        { error: "Transcript not found" },
        { status: 404 },
      );
    }
    if (outcome.status === "busy") {
      return NextResponse.json(
        { error: "Chat indexing is already running" },
        { status: 409 },
      );
    }

    after(() => maybeRunLedgerMatch(supabase, meetingId, "page"));

    return NextResponse.json({ success: true, chunkCount: outcome.chunkCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Embedding failed";
    console.error("Embedding error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
