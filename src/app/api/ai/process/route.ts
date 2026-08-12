import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { generateObject } from "ai";
import { supabaseServer } from "@/lib/supabase-server";
import { withFallback } from "@/agent/models";
import { extractionResultSchema } from "@/agent/types";

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

    // Fetch the transcript for this meeting
    const { data: transcript, error: transcriptError } = await supabase
      .from("transcripts")
      .select("raw_text")
      .eq("meeting_id", meetingId)
      .single();

    if (transcriptError || !transcript) {
      console.error("Transcript not found:", transcriptError);
      return NextResponse.json(
        { error: "Transcript not found" },
        { status: 404 },
      );
    }

    // Run AI extraction via Gemini (with Groq fallback)
    const { object: result } = await withFallback((model) =>
      generateObject({
        model,
        schema: extractionResultSchema,
        prompt: `Analyze the following meeting transcript and extract structured insights.

Transcript:
${transcript.raw_text}

Extract:
1. A comprehensive summary of the meeting
2. Key points discussed
3. Decisions that were made
4. The meeting category (Product, Engineering, Sales, Design, Operations, or General)
5. Specific topics detected
6. Action items with assignee and due date if mentioned`,
      }),
    );

    // Write meeting insights
    const { error: insightsError } = await supabase
      .from("meeting_insights")
      .insert({
        meeting_id: meetingId,
        summary: result.insights.summary,
        key_points: result.insights.keyPoints,
        decisions: result.insights.decisions,
        category: result.insights.category,
        detected_topics: result.insights.detectedTopics,
        processed_at: new Date().toISOString(),
      });

    if (insightsError) {
      console.error("Failed to write insights:", insightsError);
      return NextResponse.json(
        { error: "Failed to save insights" },
        { status: 500 },
      );
    }

    // Write action items
    if (result.actionItems.length > 0) {
      const { error: actionItemsError } = await supabase
        .from("action_items")
        .insert(
          result.actionItems.map((item) => ({
            meeting_id: meetingId,
            title: item.title,
            assignee: item.assignee ?? null,
            due_date: item.dueDate ?? null,
          })),
        );

      if (actionItemsError) {
        console.error("Failed to write action items:", actionItemsError);
        // Non-fatal — insights are saved, action items can be retried
      }
    }

    return NextResponse.json({
      success: true,
      insights: result.insights,
      actionItemCount: result.actionItems.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Processing failed";
    console.error("AI processing error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
