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

    // Scope check: confirm the meeting belongs to this user before embedding.
    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select("id")
      .eq("id", meetingId)
      .eq("user_id", userId)
      .single();

    if (meetingError || !meeting) {
      console.error("Meeting not found or not owned by user:", meetingError);
      return NextResponse.json(
        { error: "Meeting not found" },
        { status: 404 },
      );
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
