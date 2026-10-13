/* eslint-disable prettier/prettier */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import { embedAndStore } from "@/agent/embed";

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
      .select("id, user_id")
      .eq("id", meetingId)
      .single();

    if (meetingError || !meeting) {
      console.error("Meeting not found:", meetingError);
      return NextResponse.json(
        { error: "Meeting not found" },
        { status: 404 },
      );
    }

    if (meeting.user_id !== userId) {
      const { data: part } = await supabase
        .from("attendance_events")
        .select("user_id")
        .eq("meeting_id", meeting.id)
        .eq("user_id", userId)
        .limit(1);
      if (!part || part.length === 0) {
        // Guests may have a NULL user_id in attendance_events;
        // match on stream_user_id (the guest's Stream identity).
        const { data: guestPart } = await supabase
          .from("attendance_events")
          .select("user_id")
          .eq("meeting_id", meeting.id)
          .eq("stream_user_id", userId)
          .limit(1);
        if (!guestPart || guestPart.length === 0) {
          console.error("Meeting not authorized for user:", userId);
          return NextResponse.json(
            { error: "Meeting not found" },
            { status: 404 },
          );
        }
      }
    }

    // Fetch the transcript for this meeting
    const { data: transcript, error: transcriptError } = await supabase
      .from("transcripts")
      .select("raw_text")
      .eq("meeting_id", meetingId)
      .single();

    if (transcriptError || !transcript || !transcript.raw_text.trim()) {
      console.error("Transcript not found:", transcriptError);
      return NextResponse.json(
        { error: "Transcript not found" },
        { status: 404 },
      );
    }

    const { chunkCount } = await embedAndStore(
      meetingId,
      transcript.raw_text,
    );

    return NextResponse.json({ success: true, chunkCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Embedding failed";
    console.error("Embedding error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
