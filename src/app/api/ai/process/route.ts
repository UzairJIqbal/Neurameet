import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import { sendMeetingReadyEmail } from "@/lib/email";
import { normalizeDueDate } from "@/lib/normalize-date";
import { MEETING_CATEGORIES } from "@/lib/meeting-types";
import { generateStructuredWithFallback } from "@/agent/models";
import { extractionResultSchema } from "@/agent/types";
import { setTranscriptState } from "@/lib/transcript-state";

// Normalize the model's free-text category to a valid MEETING_CATEGORIES
// member. The AI SDK returns an unconstrained string; mapping it (case-
// insensitive) to the enum guarantees the Category tab badge + select never
// show an invalid value (P11 (b)). Unrecognized input falls back to "General".
function normalizeCategory(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "General";
  const match = MEETING_CATEGORIES.find(
    (c) => c.toLowerCase() === trimmed.toLowerCase(),
  );
  return match ?? "General";
}

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { meetingId, emailNotifications, email } = body as {
      meetingId?: string;
      emailNotifications?: boolean;
      email?: string | null;
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

    // Idempotent retry: clear any prior insights, action items, and their
    // follow-ups for this meeting before regenerating. A retry (or any re-run
    // of this route) must not create duplicate rows, since the detail API does
    // a single-row fetch on meeting_insights. Safe no-op on first run.
    {
      const { error: delInsightsErr } = await supabase
        .from("meeting_insights")
        .delete()
        .eq("meeting_id", meetingId);
      if (delInsightsErr)
        console.error("Failed to clear prior insights:", delInsightsErr);

      const { data: priorItems } = await supabase
        .from("action_items")
        .select("id")
        .eq("meeting_id", meetingId);
      if (priorItems && priorItems.length > 0) {
        const priorIds = priorItems.map((i) => i.id);
        await supabase.from("follow_ups").delete().in("action_item_id", priorIds);
        await supabase.from("action_items").delete().in("id", priorIds);
      }
    }

    // Bound the input size before extraction. Long recordings (multiple 10-min
    // chunks concatenated) can push the model's structured-output response past
    // what it can complete, which makes the AI SDK throw
    // "Provider stream ended without finish_reason" (truncated JSON). Capping
    // the transcript keeps the summary/action-item extraction reliable.
    const MAX_TRANSCRIPT_CHARS = 16000;
    const rawText = transcript.raw_text ?? "";
    const truncatedText =
      rawText.length > MAX_TRANSCRIPT_CHARS
        ? rawText.slice(0, MAX_TRANSCRIPT_CHARS) +
        "\n[transcript truncated for processing]"
        : rawText;

    // Run AI extraction via Gemini (with Groq fallback). Both paths use the
    // default json_schema structured-outputs mode, so the schema must avoid
    // `.optional()` fields (use `.nullable()`) — see generateStructuredWithFallback.
    const { object: result } = await generateStructuredWithFallback({
      schema: extractionResultSchema,
      prompt: `Analyze the following meeting transcript and extract structured insights.

Transcript:
${truncatedText}

Respond with a SINGLE JSON object only (no markdown, no prose), with exactly this structure:
{
  "insights": {
    "summary": "A comprehensive summary of the meeting",
    "keyPoints": ["Key point discussed", "Another key point"],
    "decisions": ["Decision that was made"],
    "category": "Product | Sales | Design | Operations | Engineering | General",
    "detectedTopics": ["Specific topic", "Another topic"]
  },
  "actionItems": [
    { "title": "A clear, actionable task", "assignee": "Person responsible or null", "dueDate": "ISO date YYYY-MM-DD or null" }
  ]
}
Extraction rules:
- Summary: a comprehensive summary of the meeting.
- Key points: the main points discussed.
- Decisions: explicit decisions that were made.
- Category: choose the SINGLE most representative category from the list. Do NOT default to any one; pick the category that best matches what the meeting was actually about.
- Detected topics: specific topics discussed.
- Action items: commitments or tasks arising from the meeting. Extract them even when phrased informally (e.g. "we should…", "let's…", "I'll take care of…", "can you…"). Return an empty array ONLY if the meeting contains no commitments or tasks at all. For each, capture a clear task title, the responsible person if named, and a due date (ISO YYYY-MM-DD) if stated.`,
    });

    // Write meeting insights
    const { error: insightsError } = await supabase
      .from("meeting_insights")
      .insert({
        meeting_id: meetingId,
        summary: result.insights.summary,
        key_points: result.insights.keyPoints,
        decisions: result.insights.decisions,
        category: normalizeCategory(result.insights.category),
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
        const clerkUser = await currentUser();
        const clerkEmail = clerkUser?.primaryEmailAddress?.emailAddress;
        // Determine recipient email securely.
        // Prefer Clerk owner email. If not available, look up the participant's email from attendance_events.
        let participantEmail: string | null = null;
        if (!clerkEmail) {
          // Fetch participant email from attendance_events for this meeting and caller.
          const { data: att } = await supabase
            .from('attendance_events')
            .select('participant_email')
            .eq('meeting_id', meetingId)
            .or(`user_id.eq.${userId},stream_user_id.eq.${userId}`)
            .limit(1);
          participantEmail = att && att[0] ? att[0].participant_email : null;
        }
        const to = clerkEmail ?? participantEmail ?? null;
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

    // Mark the transcript fully ready now that AI insights + embeddings exist.
    try {
      await setTranscriptState(supabase, meetingId, "ready");
    } catch {
      // best-effort; AI work already succeeded.
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
