import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import { sendMeetingReadyEmail } from "@/lib/email";
import { normalizeDueDate } from "@/lib/normalize-date";
import { generateStructuredWithFallback } from "@/agent/models";
import { extractionResultSchema } from "@/agent/types";

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { meetingId, emailNotifications } = body as {
      meetingId?: string;
      emailNotifications?: boolean;
    };

    if (!meetingId) {
      return NextResponse.json(
        { error: "Meeting ID is required" },
        { status: 400 },
      );
    }

    const supabase = supabaseServer();

    // Ownership check: only the meeting's owner may run extraction on it.
    const { data: owned, error: ownErr } = await supabase
      .from("meetings")
      .select("id")
      .eq("id", meetingId)
      .eq("user_id", userId)
      .maybeSingle();

    if (ownErr || !owned) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

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

    // Run AI extraction via Gemini (with Groq fallback).
    // Groq cannot use response_format json_schema, so the fallback path inside
    // generateStructuredWithFallback forces loose JSON mode — see models.ts.
    const { object: result } = await generateStructuredWithFallback({
      schema: extractionResultSchema,
      prompt: `Analyze the following meeting transcript and extract structured insights.

Transcript:
${transcript.raw_text}

Respond with a SINGLE JSON object only (no markdown, no prose), with exactly this structure:
{
  "insights": {
    "summary": "A comprehensive summary of the meeting",
    "keyPoints": ["Key point discussed", "Another key point"],
    "decisions": ["Decision that was made"],
    "category": "Product | Engineering | Sales | Design | Operations | General",
    "detectedTopics": ["Specific topic", "Another topic"]
  },
  "actionItems": [
    { "title": "A clear, actionable task", "assignee": "Person responsible or null", "dueDate": "ISO date YYYY-MM-DD or null" }
  ]
}
Extract: a comprehensive summary, key points, decisions made, the meeting category, specific topics detected, and action items with assignee and due date if mentioned.`,
    });

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
      const {
        data: insertedItems,
        error: actionItemsError,
      } = await supabase
        .from("action_items")
        .insert(
          result.actionItems.map((item) => ({
            meeting_id: meetingId,
            title: item.title,
            assignee: item.assignee ?? null,
            due_date: normalizeDueDate(item.dueDate),
          })),
        )
        .select("id, meeting_id");

      if (actionItemsError) {
        console.error("Failed to write action items:", actionItemsError);
        // Non-fatal — insights are saved, action items can be retried
      } else if (insertedItems && insertedItems.length > 0) {
        // Auto-generate a follow-up per action item (Step 7)
        const { error: followUpError } = await supabase
          .from("follow_ups")
          .insert(
            insertedItems.map((ai) => ({
              action_item_id: ai.id,
              meeting_id: ai.meeting_id,
              status: "pending",
              priority: "medium",
              notes: null,
              updated_at: new Date().toISOString(),
            })),
          );

        if (followUpError) {
          console.error(
            "Failed to auto-generate follow-ups:",
            followUpError,
          );
          // Non-fatal — insights + action items are already saved
        }
      }
    }

    // Notify the owner by email when the "Email notifications" preference is ON.
    // Non-fatal: any failure is logged and must not block the processing result.
    let emailSent = false;
    if (emailNotifications) {
      try {
        const user = await currentUser();
        const to = user?.primaryEmailAddress?.emailAddress;
        if (to) {
          const { data: meeting } = await supabase
            .from("meetings")
            .select("title")
            .eq("id", meetingId)
            .single();
          emailSent = await sendMeetingReadyEmail({
            to,
            meetingTitle: meeting?.title ?? "Your meeting",
            meetingId,
          });
        } else {
          console.warn(
            "[process] No recipient email found; skipping notification.",
          );
        }
      } catch (emailErr) {
        console.error("[process] Meeting-ready email failed:", emailErr);
      }
    }

    return NextResponse.json({
      success: true,
      insights: result.insights,
      actionItemCount: result.actionItems.length,
      emailSent,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Processing failed";
    console.error("AI processing error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
