/* eslint-disable prettier/prettier */
import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import {
  streamText,
  convertToModelMessages,
  UIMessage,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveChatModel } from "@/agent/models";
import { retrieveContext, buildSystemPrompt } from "@/agent/rag";
import { getUserRecordings } from "@/lib/recordings";

// Extract the text of the most recent user message (for RAG retrieval).
function lastUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role === "user") {
      return message.parts
        .filter(
          (part): part is { type: "text"; text: string } =>
            part.type === "text",
        )
        .map((part) => part.text)
        .join(" ");
    }
  }
  return "";
}

// Build the general assistant prompt with the signed-in user's real context so
// it can answer "who am I" and "what's my next meeting" instead of claiming it
// has no access. `meetingLines` is a plain-text list of the user's meetings.
// `recordingSummary` is only present when the user asked about recordings; it
// carries the real recording count so the model does not invent steps.
function buildGeneralSystemPrompt(
  displayName: string,
  userEmail: string | undefined,
  meetingLines: string[],
  meetingSummary: string,
  recordingSummary?: string,
): string {
  const meetingsBlock =
    meetingLines.length > 0
      ? `${meetingSummary}\n\nThe user's meetings in NeuraMeet (most recent first):\n${meetingLines.join("\n")}`
      : meetingSummary;

  const recordingBlock = recordingSummary
    ? "FACT: " +
      recordingSummary +
      " When the user asks how many recordings they have, answer with this exact " +
      "number and nothing else about where to look. Never say you lack access, never " +
      "point them to per-meeting Recording tabs, and never claim the count is " +
      "unavailable. The line above is the source of truth.\n\n"
    : "";

  const identityLine =
    userEmail
      ? `You are NeuraMeet's AI assistant. The signed-in user's name is ${displayName} and their email is ${userEmail}. `
      : `You are NeuraMeet's AI assistant. The signed-in user's name is ${displayName}. `;

  return (
    identityLine +
    "When the user asks who they are, or about their account or identity, state their " +
    "name and email directly instead of saying you lack information about them. " +
    "You help with meeting productivity, running effective meetings, and using the " +
    "NeuraMeet app. You DO have access to the user's basic meeting information " +
    "(titles, dates, and status) listed below, so answer questions about their " +
    "meetings directly from it instead of saying you lack access. " +
    "The summary line at the top of that block gives the exact total and the " +
    "count per status; use those numbers verbatim when the user asks how many " +
    "(for example, scheduled meetings), and do not try to re-count the list " +
    "yourself because it is truncated to the 12 most recent.\n\n" +
    `${meetingsBlock}\n\n` +
    "NeuraMeet app facts (be accurate, never invent UI):\n" +
    "- Create a meeting from the Dashboard 'New Meeting' card, or schedule one with " +
    "'Schedule Meeting'. Join with a code via 'Join Meeting'.\n" +
    "- Upload a transcript from the Dashboard 'Upload Transcript' button (or the " +
    "Upload button shown in an empty Meeting Intelligence panel). That opens a dialog " +
    "where the user pastes text or attaches a file; NeuraMeet then runs the AI pipeline " +
    "(summary, action items, category, and a searchable chat). There is NO in-chat " +
    "upload or attach button inside the AI Chat tab.\n" +
    "- Each meeting has a detail page with tabs: Overview, Summary, Action Items, " +
    "Recording, Category, AI Chat, and Engagement. The per-meeting 'AI Chat' tab " +
    "searches that meeting's transcript, so point users there for questions about a " +
    "specific meeting's content.\n" +
    "- Meeting Intelligence lists meetings; Follow-ups lists action-item follow-ups.\n\n" +
    "If a question is about the detailed transcript content of one specific past " +
    "meeting, tell the user to open that meeting and use its AI Chat tab, but you may " +
    "still answer from the meeting list above when the question is only about titles, " +
    "dates, or status.\n\n" +
    recordingBlock
  );
}

// A recording question has a single correct, deterministic answer: the count.
// The chat model has proven unreliable at surfacing the injected count (it
// often claims "no access"), so when we actually have the number we answer
// directly instead of betting on the model obeying the prompt.
function buildRecordingAnswer(count: number): string {
  const noun = count === 1 ? "recording" : "recordings";
  return `You have ${count} ${noun} across your calls in NeuraMeet. You can watch each one from that meeting's Recording tab on its detail page.`;
}

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Start model resolution now. A cold Gemini probe can take ~4s; running it in
  // parallel with the body parse and the context lookups below means the probe
  // no longer stacks on top of them.
  const modelPromise = resolveChatModel();

  try {
    const { messages, meetingId } = (await request.json()) as {
      messages?: UIMessage[];
      meetingId?: string;
    };

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: "Messages are required" },
        { status: 400 },
      );
    }

    const supabase = supabaseServer();

    let systemPrompt: string;

    if (meetingId) {
      // Scope check: the meeting must exist and the caller must be the owner OR
      // a recorded participant. This mirrors the lenient ownership rule in
      // /api/transcript/upload, /api/ai/embed, and /api/meetings/[id] — a
      // participant may chat about a meeting they attended under a different
      // Clerk account than the creator, so a strict owner-only check wrongly
      // 404s with "Meeting not found" (e.g. the AI Chat tab for a participant).
      const { data: meeting, error: meetingError } = await supabase
        .from("meetings")
        .select("id, user_id")
        .eq("id", meetingId)
        .single();

      if (meetingError || !meeting) {
        console.error(
          "Meeting not found or not owned by user:",
          meetingError,
        );
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
            console.error(
              "Meeting chat not authorized for user:",
              userId,
            );
            return NextResponse.json(
              { error: "Meeting not found" },
              { status: 404 },
            );
          }
        }
      }

      const question = lastUserText(messages);
      const context = await retrieveContext(meetingId, question);
      systemPrompt = buildSystemPrompt(context);
    } else {
      // General assistant: enrich with the signed-in user's identity and their
      // real meetings so it can answer "who am I" and "what's my next meeting"
      // instead of claiming it has no access. Each lookup is isolated so a Clerk
      // or DB failure degrades to "less personalized" rather than crashing the
      // whole chat or silently producing a "no info about you" reply.
      let displayName = "there";
      let userEmail: string | undefined;
      try {
        const user = await currentUser();
        const nameParts = [user?.firstName, user?.lastName].filter(
          (part): part is string => typeof part === "string" && part.length > 0,
        );
        displayName = nameParts.join(" ") || user?.username || "there";
        userEmail =
          user?.primaryEmailAddress?.emailAddress ??
          user?.emailAddresses?.[0]?.emailAddress ??
          undefined;
      } catch (userErr) {
        console.error("Chat: failed to load Clerk user for context:", userErr);
      }

      let meetingLines: string[] = [];
      let meetingSummary = "The user has no meetings in NeuraMeet yet.";
      try {
        const { data: meetingRows } = await supabase
          .from("meetings")
          .select("id, title, status, started_at, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(12);

        const rows = meetingRows ?? [];
        meetingLines = rows.map((m) => {
          const when = m.started_at ?? m.created_at;
          return `- ${m.title} (status: ${m.status}${
            when ? `, ${new Date(when).toLocaleDateString()}` : ""
          })`;
        });

        if (rows.length > 0) {
          const countsByStatus: Record<string, number> = {};
          for (const m of rows) {
            countsByStatus[m.status] = (countsByStatus[m.status] ?? 0) + 1;
          }
          const countParts = Object.entries(countsByStatus)
            .map(([status, count]) => `${status}: ${count}`)
            .join(", ");
          meetingSummary = `Total meetings: ${rows.length}. By status: ${countParts}.`;
        }
      } catch (meetErr) {
        console.error("Chat: failed to load meetings for context:", meetErr);
      }

      // Recordings live in Stream (not Supabase), so fetching them is a real API
      // round trip. Only do it when the user's message is actually about
      // recordings, so normal chat stays fast.
      let recordingSummary: string | undefined;
      let recordingCount: number | undefined;
      const wantsRecordings = /record/i.test(lastUserText(messages));
      if (wantsRecordings) {
        try {
          const recordings = await getUserRecordings(userId);
          recordingCount = recordings.length;
          recordingSummary = `The user has ${recordings.length} recording(s) across their calls in NeuraMeet.`;
        } catch (recErr) {
          console.error("Chat: failed to load recordings for context:", recErr);
        }
      }

      // Deterministic answer for recording questions: the LLM has proven
      // unreliable at surfacing the injected count, so when we actually have
      // the number we answer directly. This is instant once the count is
      // fetched (no model probe, no generation wait) and always correct.
      if (wantsRecordings && recordingCount !== undefined) {
        const answer = buildRecordingAnswer(recordingCount);
        console.log("[chat] recording question answered directly:", {
          recordingCount,
        });
        const stream = createUIMessageStream({
          execute: ({ writer }) => {
            const id = `rec-${recordingCount}`;
            writer.write({ type: "text-start", id });
            writer.write({ type: "text-delta", id, delta: answer });
            writer.write({ type: "text-end", id });
          },
        });
        return createUIMessageStreamResponse({ stream });
      }

      console.log("[chat] general context resolved:", {
        displayName,
        meetingSummary,
        recordingCount: recordingSummary ? recordingSummary : "not requested",
      });

      systemPrompt = buildGeneralSystemPrompt(
        displayName,
        userEmail,
        meetingLines,
        meetingSummary,
        recordingSummary,
      );
    }

    const model = await modelPromise;

    const result = streamText({
      model,
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Chat failed";
    console.error("AI chat error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
