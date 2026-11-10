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
    updated_at: new Date().toISOString(),
  };
  if (opts?.rawText !== undefined) row.raw_text = opts.rawText;
  if (opts?.source !== undefined) row.source = opts.source;

  let { error } = await supabase
    .from("transcripts")
    .upsert(row, { onConflict: "meeting_id" });

  // Database not migrated to F10 yet (no updated_at column): write without it.
  if (error && isMissingColumn(error)) {
    delete row.updated_at;
    ({ error } = await supabase
      .from("transcripts")
      .upsert(row, { onConflict: "meeting_id" }));
  }

  if (error) {
    console.error("[transcript-state] upsert failed:", error);
    throw error;
  }
}

/** Postgres 42703 / PostgREST PGRST204: a column in the payload does not exist. */
export function isMissingColumn(error: { code?: string }): boolean {
  return error.code === "42703" || error.code === "PGRST204";
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

// A `pending` row older than this is a generation that died (function killed,
// network cut) and may be restarted. Longer than the route's maxDuration (300 s).
export const PENDING_STALE_MS = 6 * 60 * 1000;

export function isPendingStale(
  updatedAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!updatedAt) return true;
  const t = Date.parse(updatedAt);
  return !Number.isFinite(t) || now - t > PENDING_STALE_MS;
}

/**
 * Atomically take the right to generate. Returns false when another generation
 * is already running (a fresh `pending` row). The conditional update only
 * matches a row that is not pending or whose pending mark is stale, so two
 * concurrent clicks cannot both win.
 */
export async function claimTranscriptGeneration(
  supabase: SupabaseClient,
  meetingId: string,
): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const cutoff = new Date(Date.now() - PENDING_STALE_MS).toISOString();

  const { data: updated, error: updateErr } = await supabase
    .from("transcripts")
    .update({
      processing_state: "pending",
      source: "recording",
      updated_at: nowIso,
    })
    .eq("meeting_id", meetingId)
    .or(`processing_state.neq.pending,updated_at.lt.${cutoff}`)
    .select("id");
  if (updateErr) throw updateErr;
  if (updated && updated.length > 0) return true;

  // No row matched: either none exists yet, or a fresh pending one does.
  const { error: insertErr } = await supabase.from("transcripts").insert({
    meeting_id: meetingId,
    source: "recording",
    processing_state: "pending",
    updated_at: nowIso,
  });
  if (!insertErr) return true;
  // Unique violation: the row exists and is fresh pending, so we lost the race.
  if (insertErr.code === "23505") return false;
  throw insertErr;
}
