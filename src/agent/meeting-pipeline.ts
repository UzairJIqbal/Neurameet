import "server-only";
import { randomUUID } from "node:crypto";
import { clerkClient } from "@clerk/nextjs/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendMeetingReadyEmail } from "@/lib/email";
import { normalizeDueDate } from "@/lib/normalize-date";
import { MEETING_CATEGORIES } from "@/lib/meeting-types";
import { generateStructuredWithFallback } from "@/agent/models";
import { extractionResultSchema } from "@/agent/types";
import { LEDGER_MAX_ITEMS, writeLedgerItems } from "@/agent/ledger";
import { embedAndStore } from "@/agent/embed";
import { runLedgerMatch } from "@/agent/ledger-match";
import { StreamClient } from "@stream-io/node-sdk";
import { generateTranscriptForMeeting } from "@/agent/transcript-generation";
import { callTypeOfRow } from "@/lib/stream-call-type-server";
import {
  claimTranscriptGeneration,
  getTranscriptState,
  isMissingColumn,
  isPendingStale,
  setTranscriptState,
} from "@/lib/transcript-state";
import { minutesLockError } from "@/lib/minutes-lock";
import { buildMinutesDraft, cutMinutes } from "@/agent/minutes";
import { buildProposalRows, hasReviewedProposals } from "@/agent/proposals";
import { notifyProposalsReady } from "@/lib/notification-events";
import { rpcErrorCode } from "@/lib/projects";
import { MAX_PROPOSALS_PER_MEETING } from "@/lib/tasks";
import {
  claimPipelineStep,
  isStepStale,
  markPipelineStep,
  stepStart,
  type PipelineSource,
  type PipelineState,
} from "@/lib/pipeline-steps";
import {
  DISSENT_SUGGESTIONS_MAX,
  MINUTES_MAX_DECISIONS,
  MINUTES_MAX_KEY_POINTS,
  MINUTES_MAX_QUOTES,
  MINUTES_MAX_SUMMARY_POINTS,
  type MinutesDraft,
} from "@/lib/minutes-types";
import type { ExtractionResult } from "@/agent/types";

// The after meeting AI steps (spec 0005), shared by the API routes, the Stream
// webhook, and the daily cron. Callers check access first; these functions only
// claim the step, do the work, and record its timing.

// Bound the input size before extraction. Long recordings (multiple 10-min
// chunks concatenated) can push the model's structured-output response past
// what it can complete, which makes the AI SDK throw
// "Provider stream ended without finish_reason" (truncated JSON). Capping
// the transcript keeps the summary/action-item extraction reliable.
const MAX_TRANSCRIPT_CHARS = 16000;
// Smallest model timeout a deadline may leave the extraction call.
const MIN_AI_TIMEOUT_MS = 5_000;

const PROPOSALS_REVIEWED = "Proposals were already reviewed";
export const PROCESS_BUSY = "Summary is already being created";

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

// The meeting date (YYYY-MM-DD) the model resolves relative due dates against
// ("Friday tak", "next week"). Spec 0001 AC-4: meetings.started_at, never today.
function meetingDateFor(row: {
  started_at: string | null;
  created_at: string | null;
}): string {
  const raw = row.started_at ?? row.created_at;
  const parsed = raw ? new Date(raw) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  console.warn("[ledger] meeting has no usable date, using today");
  return new Date().toISOString().slice(0, 10);
}

function timeoutFor(deadline: number | undefined): number | undefined {
  if (deadline === undefined) return undefined;
  return Math.max(MIN_AI_TIMEOUT_MS, deadline - Date.now());
}

function extractionPrompt(meetingDate: string, transcript: string): string {
  return `Analyze the following meeting transcript and extract structured insights.

Meeting date: ${meetingDate}

Transcript:
${transcript}

Respond with a SINGLE JSON object only (no markdown, no prose), with exactly this structure:
{
  "insights": {
    "summary": "A comprehensive summary of the meeting",
    "category": "Product | Sales | Design | Operations | Engineering | General",
    "detectedTopics": ["Specific topic", "Another topic"]
  },
  "minutes": {
    "summaryPoints": [{ "text": "One summary point", "speakers": ["Who said it"], "quotes": ["Exact words from one transcript line"] }],
    "keyPoints": [{ "text": "Key point discussed", "speakers": ["Who said it"], "quotes": ["Exact words from one transcript line"] }],
    "decisions": [{ "text": "Decision that was made", "speakers": ["Who said it"], "quotes": ["Exact words from one transcript line"] }]
  },
  "actionItems": [
    { "title": "A clear, actionable task", "assignee": "Person responsible or null", "dueDate": "ISO date YYYY-MM-DD or null", "quotes": ["Exact words from one transcript line"] }
  ],
  "ledgerItems": [
    { "kind": "decision | promise", "statement": "Plain English restatement", "quote": "Exact words from one transcript line", "quoteLanguage": "en | ur | mixed", "speaker": "Who said it or null", "assignee": "Who promised (promises only) or null", "dueDate": "ISO date YYYY-MM-DD or null", "actionItemIndex": 0 }
  ],
  "dissentSuggestions": [
    { "speakerLabel": "Speaker name exactly as in the transcript", "topic": "What they objected to", "position": "Their view in one sentence", "quote": "Exact words from one transcript line", "relatedDecisionIndex": 0 }
  ]
}
Extraction rules:
- Summary: a comprehensive summary of the meeting, as one paragraph.
- Minutes: summaryPoints (at most ${MINUTES_MAX_SUMMARY_POINTS}) restate the summary as short points; keyPoints (at most ${MINUTES_MAX_KEY_POINTS}) are the main points discussed; decisions (at most ${MINUTES_MAX_DECISIONS}) are explicit decisions that were made.
  - speakers: who said the point, using the speaker names exactly as they appear in the transcript, or null.
  - quotes: at most ${MINUTES_MAX_QUOTES} per point, each copied WORD FOR WORD from ONE transcript line, without the "Speaker:" label. Return no quote (null or an empty array) rather than invent or paraphrase one.
- Category: choose the SINGLE most representative category from the list. Do NOT default to any one; pick the category that best matches what the meeting was actually about.
- Detected topics: specific topics discussed.
- Action items: commitments or tasks arising from the meeting. Extract them even when phrased informally (e.g. "we should…", "let's…", "I'll take care of…", "can you…"). Return an empty array ONLY if the meeting contains no commitments or tasks at all. For each, capture a clear task title, the responsible person if named, a due date (ISO YYYY-MM-DD) if stated, and at most ${MINUTES_MAX_QUOTES} quotes copied word for word from one transcript line each (no "Speaker:" label; null when there is none).
- Dates: resolve every relative date ("Friday", "Friday tak", "next week", "kal") against the meeting date above, never against today.
- Ledger items: every decision that was made and every promise someone made (who will do what, by when). The transcript may be English, Urdu, or mixed Urdu English.
  - quote: copy the words EXACTLY as they appear in the transcript, in the original language and script, from ONE transcript line at most. Do not translate, paraphrase, or include the "Speaker:" label.
  - statement: a short plain English restatement.
  - quoteLanguage: "en" for English, "ur" for Urdu (any script), "mixed" for code mixed Urdu English.
  - assignee and dueDate apply to promises only; use null for decisions.
  - actionItemIndex: the zero based index into the actionItems array you return when this promise is the same commitment, otherwise null.
  - At most ${LEDGER_MAX_ITEMS} items, the most important first. Return an empty array when there are none.
- Dissent suggestions: at most ${DISSENT_SUGGESTIONS_MAX}, only where a person clearly objected to or disagreed with something. speakerLabel is their name exactly as in the transcript, quote is their own words copied word for word from one line they said (no "Speaker:" label), relatedDecisionIndex is the zero based index into minutes.decisions the objection is about, or null. Return null or an empty array when nobody objected.`;
}

export type ProcessMeetingRow = {
  id: string;
  user_id: string;
  project_id: string | null;
  title: string | null;
  started_at: string | null;
  created_at: string | null;
};

export type ProcessOutcome =
  | {
      status: "done";
      insights: ExtractionResult["insights"];
      actionItemCount: number;
      emailSent: boolean;
      proposalCount?: number;
      notify?: () => Promise<void>;
    }
  | { status: "busy" }
  | { status: "error"; httpStatus: number; error: string };

const fail = (httpStatus: number, error: string): ProcessOutcome => ({
  status: "error",
  httpStatus,
  error,
});

// The owner's address for the "meeting ready" email: the Clerk primary email,
// else the address this user joined the call with. Works without a request, so
// the webhook and cron can send it too.
async function recipientEmail(
  supabase: SupabaseClient,
  meetingId: string,
  userId: string,
): Promise<string | null> {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const primary = user.emailAddresses.find(
      (e) => e.id === user.primaryEmailAddressId,
    );
    if (primary?.emailAddress) return primary.emailAddress;
  } catch (err) {
    console.warn("[process] Clerk user lookup failed:", err);
  }
  const { data: att } = await supabase
    .from("attendance_events")
    .select("participant_email")
    .eq("meeting_id", meetingId)
    .or(`user_id.eq.${userId},stream_user_id.eq.${userId}`)
    .limit(1);
  return att && att[0] ? (att[0].participant_email as string | null) : null;
}

async function sendReadyEmail(
  supabase: SupabaseClient,
  meeting: ProcessMeetingRow,
  userId: string,
): Promise<boolean> {
  try {
    const to = await recipientEmail(supabase, meeting.id, userId);
    if (!to) {
      console.warn(
        "[process] No recipient email found; skipping notification.",
      );
      return false;
    }
    return await sendMeetingReadyEmail({
      to,
      meetingTitle: meeting.title ?? "Your meeting",
      meetingId: meeting.id,
    });
  } catch (emailErr) {
    console.error("[process] Meeting-ready email failed:", emailErr);
    return false;
  }
}

/**
 * Summary, action items (or proposals on a project meeting), minutes draft,
 * and ledger items for one meeting. The caller has checked access. Returns
 * "busy" when another run holds the process step.
 */
export async function processMeeting(
  supabase: SupabaseClient,
  {
    meeting,
    actorUserId,
    emailNotifications,
    deadline,
    source,
  }: {
    meeting: ProcessMeetingRow;
    actorUserId: string;
    emailNotifications: boolean;
    deadline?: number;
    source?: PipelineSource;
  },
): Promise<ProcessOutcome> {
  const meetingId = meeting.id;

  // W4: a project meeting's action items are proposals. Once any was
  // reviewed, a reprocess changes nothing (AC-34); fail before the AI call.
  const projectId = meeting.project_id ?? null;
  if (projectId && (await hasReviewedProposals(supabase, meetingId))) {
    return fail(409, PROPOSALS_REVIEWED);
  }

  // Tasdeeq AC-7: a meeting with a minutes review keeps its insights frozen.
  const locked = await minutesLockError(supabase, meetingId);
  if (locked) return fail(locked.status, locked.error);

  const { data: transcript, error: transcriptError } = await supabase
    .from("transcripts")
    .select("raw_text")
    .eq("meeting_id", meetingId)
    .single();
  if (transcriptError || !transcript) {
    console.error("Transcript not found:", transcriptError);
    return fail(404, "Transcript not found");
  }

  if (!(await claimPipelineStep(supabase, meetingId, "process"))) {
    return { status: "busy" };
  }
  const startedAt = stepStart();
  const markFailed = (reason: string) =>
    markPipelineStep(
      supabase,
      meetingId,
      "process",
      { status: "failed", startedAt, reason },
      source,
    );

  try {
    const rawText = (transcript.raw_text as string | null) ?? "";
    const truncatedText =
      rawText.length > MAX_TRANSCRIPT_CHARS
        ? rawText.slice(0, MAX_TRANSCRIPT_CHARS) +
          "\n[transcript truncated for processing]"
        : rawText;

    // Run AI extraction via Gemini (with Groq fallback). Both paths use the
    // default json_schema structured-outputs mode, so the schema must avoid
    // `.optional()` fields (use `.nullable()`) — see generateStructuredWithFallback.
    const { object: extracted, model } = await generateStructuredWithFallback({
      schema: extractionResultSchema,
      prompt: extractionPrompt(meetingDateFor(meeting), truncatedText),
      timeoutMs: timeoutFor(deadline),
    });

    // W4 AC-30: at most 50 proposals per run, the first in model order. The
    // minutes draft uses the same capped list so its rows exist.
    const result = projectId
      ? {
          ...extracted,
          actionItems: extracted.actionItems.slice(
            0,
            MAX_PROPOSALS_PER_MEETING,
          ),
        }
      : extracted;

    // Tasdeeq (spec 0003): action item ids are generated up front so the
    // minutes draft, written with the insights, can name each action line's row.
    const actionItemIds = result.actionItems.map(() => randomUUID());
    const minutes = cutMinutes(result.minutes);
    let minutesDraft: MinutesDraft | null = null;
    try {
      const built = buildMinutesDraft({
        result,
        rawText,
        actionItemIds,
        maxChars: MAX_TRANSCRIPT_CHARS,
      });
      minutesDraft = built.draft;
      if (built.droppedSuggestions > 0) {
        console.warn(
          `[tasdeeq] dropped ${built.droppedSuggestions} dissent suggestions`,
        );
      }
    } catch (draftErr) {
      console.error("[tasdeeq] minutes draft failed:", draftErr);
    }

    // The AI call above is long, so a review may have opened meanwhile. Check
    // again before anything is deleted (AC-7).
    const lockedNow = await minutesLockError(supabase, meetingId);
    if (lockedNow) {
      await markFailed("locked");
      return fail(lockedNow.status, lockedNow.error);
    }

    // W4: proposals are swapped first, inside one locked SQL call, so a review
    // that landed during the AI call wins and nothing below runs (AC-34).
    let proposalsWritten = 0;
    if (projectId) {
      const rows = await buildProposalRows(supabase, {
        meetingId,
        projectId,
        rawText,
        items: result.actionItems,
        ids: actionItemIds,
      });
      const { error: replaceErr } = await supabase.rpc(
        "replace_meeting_proposals",
        { p_meeting: meetingId, p_items: rows, p_actor: actorUserId },
      );
      if (replaceErr) {
        if (rpcErrorCode(replaceErr) === "proposals_reviewed") {
          await markFailed("proposals_reviewed");
          return fail(409, PROPOSALS_REVIEWED);
        }
        throw replaceErr;
      }
      proposalsWritten = rows.length;
    }

    // Idempotent retry: clear any prior insights, action items, and their
    // follow-ups for this meeting before writing the new ones. This runs only
    // after extraction succeeded, so a failed AI call keeps the old results. A retry (or any re-run
    // of this route) must not create duplicate rows, since the detail API does
    // a single-row fetch on meeting_insights. Safe no-op on first run.
    {
      const { error: delInsightsErr } = await supabase
        .from("meeting_insights")
        .delete()
        .eq("meeting_id", meetingId);
      if (delInsightsErr)
        console.error("Failed to clear prior insights:", delInsightsErr);

      // A project meeting's items were already swapped by the RPC above.
      if (!projectId) {
        const { data: priorItems } = await supabase
          .from("action_items")
          .select("id")
          .eq("meeting_id", meetingId);
        if (priorItems && priorItems.length > 0) {
          const priorIds = priorItems.map((i) => i.id);
          await supabase
            .from("follow_ups")
            .delete()
            .in("action_item_id", priorIds);
          await supabase.from("action_items").delete().in("id", priorIds);
        }
      }
    }

    // Write meeting insights
    const processedAt = new Date().toISOString();
    const { error: insightsError } = await supabase
      .from("meeting_insights")
      .insert({
        meeting_id: meetingId,
        summary: result.insights.summary,
        key_points: minutes.keyPoints.map((p) => p.text),
        decisions: minutes.decisions.map((p) => p.text),
        category: normalizeCategory(result.insights.category),
        detected_topics: result.insights.detectedTopics,
        processed_at: processedAt,
        minutes_draft: minutesDraft,
      });

    if (insightsError) {
      console.error("Failed to write insights:", insightsError);
      await markFailed("save");
      return fail(500, "Failed to save insights");
    }

    // Write action items (ids kept in insert order for ledger linking)
    let insertedActionItemIds: string[] = projectId ? actionItemIds : [];
    if (!projectId && result.actionItems.length > 0) {
      const { data: insertedItems, error: actionItemsError } = await supabase
        .from("action_items")
        .insert(
          result.actionItems.map((item, i) => ({
            id: actionItemIds[i],
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
        insertedActionItemIds = insertedItems.map((ai) => ai.id as string);
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
          console.error("Failed to auto-generate follow-ups:", followUpError);
          // Non-fatal — insights + action items are already saved
        }
      }
    }

    // Promise Ledger items (spec 0001). Line numbers are against the full
    // raw_text; writeLedgerItems never throws, so a ledger failure cannot undo
    // the insights and action items saved above.
    await writeLedgerItems(supabase, {
      meetingId,
      rawText,
      items: result.ledgerItems ?? [],
      actionItemIds: insertedActionItemIds,
    });

    // Notify the owner by email when the "Email notifications" preference is ON.
    // Non-fatal: any failure is logged and must not block the processing result.
    const emailSent = emailNotifications
      ? await sendReadyEmail(supabase, meeting, actorUserId)
      : false;

    // Mark the transcript fully ready now that AI insights + embeddings exist.
    try {
      await setTranscriptState(supabase, meetingId, "ready");
    } catch {
      // best-effort; AI work already succeeded.
    }

    await markPipelineStep(
      supabase,
      meetingId,
      "process",
      { status: "done", startedAt, model },
      source,
    );

    return {
      status: "done",
      insights: result.insights,
      actionItemCount: result.actionItems.length,
      emailSent,
      ...(projectId ? { proposalCount: result.actionItems.length } : {}),
      ...(projectId && proposalsWritten > 0
        ? {
            notify: () =>
              notifyProposalsReady(supabase, {
                projectId,
                meetingId,
                meetingTitle: meeting.title ?? "",
                count: proposalsWritten,
                processedAt,
              }),
          }
        : {}),
    };
  } catch (err) {
    await markFailed("error");
    throw err;
  }
}

export type EmbedOutcome =
  | { status: "done"; chunkCount: number }
  | { status: "busy" }
  | { status: "no_transcript" };

/**
 * Chunk and embed one meeting's transcript into meeting_chunks. The caller has
 * checked access. Throws when embedding fails (after marking the step failed).
 */
export async function embedMeeting(
  supabase: SupabaseClient,
  { meetingId, source }: { meetingId: string; source?: PipelineSource },
): Promise<EmbedOutcome> {
  const { data: transcript, error: transcriptError } = await supabase
    .from("transcripts")
    .select("raw_text")
    .eq("meeting_id", meetingId)
    .single();
  const rawText = (transcript?.raw_text as string | null | undefined) ?? "";
  if (transcriptError || !rawText.trim()) {
    console.error("Transcript not found:", transcriptError);
    return { status: "no_transcript" };
  }

  if (!(await claimPipelineStep(supabase, meetingId, "embed"))) {
    return { status: "busy" };
  }
  const startedAt = stepStart();
  try {
    const { chunkCount } = await embedAndStore(meetingId, rawText);
    await markPipelineStep(
      supabase,
      meetingId,
      "embed",
      { status: "done", startedAt },
      source,
    );
    return { status: "done", chunkCount };
  } catch (err) {
    await markPipelineStep(
      supabase,
      meetingId,
      "embed",
      { status: "failed", startedAt, reason: "error" },
      source,
    );
    throw err;
  }
}

async function hasRow(
  supabase: SupabaseClient,
  table: "meeting_insights" | "meeting_chunks",
  meetingId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from(table)
    .select("meeting_id")
    .eq("meeting_id", meetingId)
    .limit(1);
  if (error) throw error;
  return !!data && data.length > 0;
}

/**
 * Promise matching once both the summary and the chat index exist. Called after
 * process and after embed, so whichever finishes second runs it. A finished
 * match is never claimed again. Never throws.
 */
export async function maybeRunLedgerMatch(
  supabase: SupabaseClient,
  meetingId: string,
  source?: PipelineSource,
): Promise<void> {
  try {
    const [hasSummary, hasChunks] = await Promise.all([
      hasRow(supabase, "meeting_insights", meetingId),
      hasRow(supabase, "meeting_chunks", meetingId),
    ]);
    if (!hasSummary || !hasChunks) return;

    const [{ data: meeting }, { data: transcript }] = await Promise.all([
      supabase
        .from("meetings")
        .select("user_id, project_id")
        .eq("id", meetingId)
        .maybeSingle(),
      supabase
        .from("transcripts")
        .select("raw_text")
        .eq("meeting_id", meetingId)
        .maybeSingle(),
    ]);
    const rawText = (transcript?.raw_text as string | null | undefined) ?? "";
    if (!meeting || !rawText.trim()) return;

    if (!(await claimPipelineStep(supabase, meetingId, "ledger", false))) {
      return;
    }
    const startedAt = stepStart();
    try {
      // The candidate owner is the meeting creator (same as the match route).
      await runLedgerMatch(supabase, {
        meetingId,
        userId: meeting.user_id as string,
        projectId: (meeting.project_id as string | null) ?? null,
        rawText,
      });
      await markPipelineStep(
        supabase,
        meetingId,
        "ledger",
        { status: "done", startedAt },
        source,
      );
    } catch (err) {
      console.error("[ledger] auto match failed", { meetingId, err });
      await markPipelineStep(
        supabase,
        meetingId,
        "ledger",
        { status: "failed", startedAt, reason: "error" },
        source,
      );
    }
  } catch (err) {
    console.error("[ledger] auto match check failed", { meetingId, err });
  }
}

// ===== Server run (spec 0005, AC-6 to AC-8): the Stream webhook and the cron
// start the whole pipeline without anyone on the page.

// One deadline for the run: the route's 300 s minus a 20 s margin.
export const SERVER_RUN_BUDGET_MS = 280_000;
// Summary and chat index start only when this much time is left.
export const MIN_AI_LEFT_MS = 100_000;
// Settle wait: Stream sends one recording_ready per participant track.
export const SETTLE_POLL_MS = 5_000;
export const SETTLE_QUIET_MS = 45_000;
export const SETTLE_CAP_MS = 60_000;

export type ServerRunResult =
  | "not_found"
  | "skipped"
  | "busy"
  | "no_recording"
  | "too_short"
  | "failed"
  | "transcript_only"
  | "done";

type ServerMeetingRow = ProcessMeetingRow & {
  stream_call_id: string | null;
  stream_call_type: string | null;
};

export type ServerRunDeps = {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  countRecordings?: (callType: string, callId: string) => Promise<number>;
};

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

async function countIndividualRecordings(
  callType: string,
  callId: string,
): Promise<number> {
  const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
  const secret = process.env.STREAM_SECRET_KEY;
  if (!apiKey || !secret) return 0;
  const client = new StreamClient(apiKey, secret);
  const res = await client.video.listRecordings({ type: callType, id: callId });
  return (res?.recordings ?? []).filter(
    (r) => (r as { recording_type?: string }).recording_type === "individual",
  ).length;
}

// Distinct people who joined, so the settle wait knows how many tracks to
// expect. Zero when attendance is missing (the quiet window then decides).
async function expectedTrackCount(
  supabase: SupabaseClient,
  meetingId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("attendance_events")
    .select("user_id, stream_user_id")
    .eq("meeting_id", meetingId);
  if (error || !data) return 0;
  const ids = new Set(
    data.map(
      (r) =>
        ((r.stream_user_id as string | null) ?? (r.user_id as string)) || "",
    ),
  );
  ids.delete("");
  return ids.size;
}

/**
 * Wait until every expected track is listed, the count stops changing for the
 * quiet window, or the cap passes. Listing errors count as no change.
 */
export async function settleRecordings(
  supabase: SupabaseClient,
  meeting: {
    id: string;
    stream_call_id: string;
    stream_call_type: string | null;
  },
  deps: Required<ServerRunDeps>,
): Promise<number> {
  const expected = await expectedTrackCount(supabase, meeting.id);
  const callType = callTypeOfRow(meeting);
  const start = deps.now();
  let count = -1;
  let changedAt = start;
  for (;;) {
    try {
      const next = await deps.countRecordings(callType, meeting.stream_call_id);
      if (next !== count) {
        count = next;
        changedAt = deps.now();
      }
    } catch (err) {
      console.warn("[pipeline] recording list failed during settle:", err);
    }
    const now = deps.now();
    if (expected > 0 && count >= expected) break;
    if (count > 0 && now - changedAt >= SETTLE_QUIET_MS) break;
    if (now - start >= SETTLE_CAP_MS) break;
    await deps.sleep(SETTLE_POLL_MS);
  }
  return Math.max(0, count);
}

async function saveReadyTranscript(
  supabase: SupabaseClient,
  meetingId: string,
  result: { transcript: string; rawTranscript?: string; language?: string },
): Promise<boolean> {
  const row: Record<string, unknown> = {
    meeting_id: meetingId,
    source: "recording",
    raw_text: result.transcript.trim(),
    language: result.language,
    processing_state: "ready",
    updated_at: new Date().toISOString(),
    raw_whisper_text: result.rawTranscript?.trim() ?? null,
  };
  let { error } = await supabase
    .from("transcripts")
    .upsert(row, { onConflict: "meeting_id" });
  if (error && isMissingColumn(error)) {
    delete row.updated_at;
    delete row.raw_whisper_text;
    ({ error } = await supabase
      .from("transcripts")
      .upsert(row, { onConflict: "meeting_id" }));
  }
  if (error) console.error("[pipeline] saving the transcript failed:", error);
  return !error;
}

// The stored "Email notifications" toggle; a missing row means on.
async function emailToggleFor(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("user_settings")
    .select("email_notifications")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.email_notifications as boolean | undefined) ?? true;
}

async function runAiSteps(
  supabase: SupabaseClient,
  meeting: ServerMeetingRow,
  deadline: number,
  source: PipelineSource,
): Promise<void> {
  const emailNotifications = await emailToggleFor(supabase, meeting.user_id);
  const [processed, embedded] = await Promise.allSettled([
    processMeeting(supabase, {
      meeting,
      actorUserId: meeting.user_id,
      emailNotifications,
      deadline,
      source,
    }),
    embedMeeting(supabase, { meetingId: meeting.id, source }),
  ]);
  if (processed.status === "rejected") {
    console.error("[pipeline] server summary failed:", processed.reason);
  } else if (processed.value.status === "done" && processed.value.notify) {
    try {
      await processed.value.notify();
    } catch (err) {
      console.error("[pipeline] proposal notice failed:", err);
    }
  }
  if (embedded.status === "rejected") {
    console.error("[pipeline] server embed failed:", embedded.reason);
  }
  await maybeRunLedgerMatch(supabase, meeting.id, source);
}

/**
 * Transcript, then summary and chat index, for one ended meeting, with nobody
 * on the page. The page shares the same claims, so whichever starts first does
 * the work and the other watches. Never throws.
 */
export async function runServerPipeline(
  supabase: SupabaseClient,
  meetingId: string,
  {
    source = "webhook",
    startedAt,
    deps = {},
  }: { source?: PipelineSource; startedAt?: number; deps?: ServerRunDeps } = {},
): Promise<ServerRunResult> {
  const d: Required<ServerRunDeps> = {
    now: deps.now ?? Date.now,
    sleep: deps.sleep ?? defaultSleep,
    countRecordings: deps.countRecordings ?? countIndividualRecordings,
  };
  const deadline = (startedAt ?? d.now()) + SERVER_RUN_BUDGET_MS;
  let claimed = false;

  try {
    const { data: meeting } = await supabase
      .from("meetings")
      .select(
        "id, user_id, project_id, title, started_at, created_at, stream_call_id, stream_call_type",
      )
      .eq("id", meetingId)
      .maybeSingle();
    const row = meeting as ServerMeetingRow | null;
    if (!row || !row.stream_call_id) return "not_found";

    const current = await getTranscriptState(supabase, meetingId);
    if (current.hasInsights || current.state === "ready") return "skipped";

    if (!(await claimTranscriptGeneration(supabase, meetingId))) return "busy";
    claimed = true;

    const recordingStart = stepStart();
    await markPipelineStep(
      supabase,
      meetingId,
      "recording",
      { status: "running", startedAt: recordingStart },
      source,
    );
    await settleRecordings(
      supabase,
      { ...row, stream_call_id: row.stream_call_id },
      d,
    );

    const result = await generateTranscriptForMeeting({
      userId: row.user_id,
      meetingId,
      streamCallId: row.stream_call_id,
      streamCallType: callTypeOfRow(row),
      enforceOwner: false,
      deadline,
      source,
    });
    if (result.status !== "no_recording") {
      await markPipelineStep(
        supabase,
        meetingId,
        "recording",
        { status: "done", startedAt: recordingStart },
        source,
      );
    }

    if (result.status !== "ok") {
      claimed = false;
      await setTranscriptState(supabase, meetingId, result.status);
      return result.status;
    }
    claimed = false;
    if (!(await saveReadyTranscript(supabase, meetingId, result))) {
      await setTranscriptState(supabase, meetingId, "failed");
      return "failed";
    }

    if (deadline - d.now() < MIN_AI_LEFT_MS) return "transcript_only";
    await runAiSteps(supabase, row, deadline, source);
    return "done";
  } catch (err) {
    console.error("[pipeline] server run failed", { meetingId, err });
    if (claimed) {
      try {
        await setTranscriptState(supabase, meetingId, "failed");
      } catch {
        /* best effort */
      }
    }
    return "failed";
  }
}

// ===== Cron sweep (spec 0005, AC-9): finish meetings a webhook or page run
// left half done. Runs after the daily cron answers.

export const SWEEP_MAX_MEETINGS = 5;
// Leave a meeting alone for an hour: the webhook or the page may still run.
export const SWEEP_MIN_AGE_MS = 60 * 60 * 1000;
// Look back a week, so the sweep never walks the whole history.
const SWEEP_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const SWEEP_SCAN_ROWS = 50;

export type SweepAction = "regenerate" | "process" | "embed" | "ledger";

type SweepCandidate = {
  meeting_id: string;
  processing_state: string | null;
  raw_text: string | null;
  updated_at: string | null;
  pipeline: PipelineState | null;
};

/** What a stuck meeting needs next, or null when nothing is owed. */
export function sweepActionFor(
  row: SweepCandidate,
  has: { insights: boolean; chunks: boolean },
  now: number = Date.now(),
): SweepAction | null {
  if (row.processing_state === "pending") {
    return isPendingStale(row.updated_at, now) ? "regenerate" : null;
  }
  if (!(row.raw_text ?? "").trim()) return null;
  if (!has.insights) return "process";
  if (!has.chunks) return "embed";
  const ledger = row.pipeline?.steps?.ledger;
  if (ledger?.status === "failed" || isStepStale(ledger, now)) return "ledger";
  return null;
}

async function sweepOne(
  supabase: SupabaseClient,
  meetingId: string,
  action: SweepAction,
  deadline: number,
): Promise<void> {
  if (action === "regenerate") {
    await runServerPipeline(supabase, meetingId, {
      source: "cron",
      startedAt: deadline - SERVER_RUN_BUDGET_MS,
    });
    return;
  }
  if (action === "process") {
    const { data } = await supabase
      .from("meetings")
      .select("id, user_id, project_id, title, started_at, created_at")
      .eq("id", meetingId)
      .maybeSingle();
    const meeting = data as ProcessMeetingRow | null;
    if (!meeting) return;
    const outcome = await processMeeting(supabase, {
      meeting,
      actorUserId: meeting.user_id,
      emailNotifications: await emailToggleFor(supabase, meeting.user_id),
      deadline,
      source: "cron",
    });
    if (outcome.status === "done" && outcome.notify) await outcome.notify();
  } else if (action === "embed") {
    await embedMeeting(supabase, { meetingId, source: "cron" });
  }
  await maybeRunLedgerMatch(supabase, meetingId, "cron");
}

/**
 * Up to five stuck meetings, oldest first. Each step is wrapped so one failure
 * never stops the sweep. Returns how many meetings it worked on.
 */
export async function sweepStuckMeetings(
  supabase: SupabaseClient,
  {
    now = Date.now,
    budgetMs = SERVER_RUN_BUDGET_MS,
  }: {
    now?: () => number;
    budgetMs?: number;
  } = {},
): Promise<number> {
  const start = now();
  const deadline = start + budgetMs;
  const { data, error } = await supabase
    .from("transcripts")
    .select("meeting_id, processing_state, raw_text, updated_at, pipeline")
    .lt("updated_at", new Date(start - SWEEP_MIN_AGE_MS).toISOString())
    .gt("updated_at", new Date(start - SWEEP_LOOKBACK_MS).toISOString())
    .order("updated_at", { ascending: true })
    .limit(SWEEP_SCAN_ROWS);
  if (error) {
    console.error("[pipeline] sweep scan failed:", error);
    return 0;
  }

  let worked = 0;
  for (const row of (data ?? []) as SweepCandidate[]) {
    if (worked >= SWEEP_MAX_MEETINGS) break;
    if (deadline - now() < MIN_AI_LEFT_MS) break;
    try {
      const [insights, chunks] = await Promise.all([
        hasRow(supabase, "meeting_insights", row.meeting_id),
        hasRow(supabase, "meeting_chunks", row.meeting_id),
      ]);
      const action = sweepActionFor(row, { insights, chunks }, now());
      if (!action) continue;
      worked += 1;
      console.log("[pipeline] sweep", { meetingId: row.meeting_id, action });
      await sweepOne(supabase, row.meeting_id, action, deadline);
    } catch (err) {
      console.error("[pipeline] sweep step failed", {
        meetingId: row.meeting_id,
        err,
      });
    }
  }
  return worked;
}
