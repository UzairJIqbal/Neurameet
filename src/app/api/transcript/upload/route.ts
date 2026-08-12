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
    const { title, rawText } = body as { title?: string; rawText?: string };

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

    // Create a meeting row to anchor the transcript and insights
    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .insert({
        user_id: userId,
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

    // Store the transcript
    const { error: transcriptError } = await supabase
      .from("transcripts")
      .insert({
        meeting_id: meeting.id,
        source: "upload",
        raw_text: rawText.trim(),
      });

    if (transcriptError) {
      console.error("Failed to store transcript:", transcriptError);
      return NextResponse.json(
        { error: "Failed to store transcript" },
        { status: 500 },
      );
    }

    return NextResponse.json({ meetingId: meeting.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    console.error("Transcript upload error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
