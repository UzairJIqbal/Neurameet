import type { SupabaseClient } from "@supabase/supabase-js";

// Shared lifecycle helper for the async transcript-generation pipeline.
// A single `transcripts` row carries the state so clients can poll it and the
// AI work never dangles in `pending` if a function times out or errors.
//
// States:
//   not_started  default; row may not exist yet
//   pending      STT + merge (or downstream AI) is in flight
//   ready        raw_text (and, for owner, insights) is available
//   no_recording Stream has not finalized recordings yet — retryable
//   too_short    recording too short / silent to transcribe
//   failed       a hard error — retryable from the client
export type ProcessingState =
  | "not_started"
  | "pending"
  | "ready"
  | "failed"
  | "no_recording"
  | "too_short";

/**
 * Upsert the processing state for a meeting's transcript row. Because
 * `transcripts.meeting_id` is UNIQUE, this safely creates the row on first
 * call and updates it on every subsequent call without inserting duplicates.
 * Pass `rawText` only when you have it; omit to leave `raw_text` untouched
 * (so a `pending` write does not clobber a cached transcript).
 */
export async function setTranscriptState(
  supabase: SupabaseClient,
  meetingId: string,
  state: ProcessingState,
  opts?: { rawText?: string; source?: "upload" | "recording" },
): Promise<void> {
  const row: Record<string, unknown> = {
    meeting_id: meetingId,
    processing_state: state,
  };
  if (opts?.rawText !== undefined) row.raw_text = opts.rawText;
  if (opts?.source !== undefined) row.source = opts.source;

  const { error } = await supabase
    .from("transcripts")
    .upsert(row, { onConflict: "meeting_id" });

  if (error) {
    console.error("[transcript-state] upsert failed:", error);
    throw error;
  }
}

/**
 * Read the current processing state + whether insights exist. Returns
 * `not_started` when the row has not been created yet.
 */
export async function getTranscriptState(
  supabase: SupabaseClient,
  meetingId: string,
): Promise<{
  state: ProcessingState;
  rawText: string;
  hasInsights: boolean;
}> {
  const [{ data: row }, { data: insights }] = await Promise.all([
    supabase
      .from("transcripts")
      .select("processing_state, raw_text")
      .eq("meeting_id", meetingId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("meeting_insights")
      .select("id")
      .eq("meeting_id", meetingId)
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    state: (row?.processing_state as ProcessingState) || "not_started",
    rawText: row?.raw_text ?? "",
    hasInsights: !!insights,
  };
}
