import type { SupabaseClient } from "@supabase/supabase-js";

// Per step timings for the after meeting pipeline (spec 0005), stored in
// transcripts.pipeline so a slow step stays visible after the log window is
// gone. Every helper here is best effort: a failed write logs and never throws,
// so timings can never break the pipeline they measure.

export type PipelineStep =
  "recording" | "whisper" | "cleanup" | "process" | "embed";

export type PipelineSource = "webhook" | "page" | "cron";

export type PipelineStepStatus = "running" | "done" | "failed" | "skipped";

export type PipelineStepValue = {
  status: PipelineStepStatus;
  startedAt: string;
  endedAt?: string;
  ms?: number;
  model?: string;
  reason?: string;
};

export type PipelineState = {
  source?: PipelineSource;
  steps?: Partial<Record<PipelineStep, PipelineStepValue>>;
};

// Same window as the claim RPC: a running step older than this died.
export const PIPELINE_STEP_STALE_MS = 5 * 60 * 1000;

export function isStepStale(
  value: PipelineStepValue | undefined,
  now: number = Date.now(),
): boolean {
  if (!value || value.status !== "running") return false;
  const t = Date.parse(value.startedAt);
  return !Number.isFinite(t) || now - t > PIPELINE_STEP_STALE_MS;
}

/** Start a timer for one step. Pass the result to markPipelineStep. */
export function stepStart(): string {
  return new Date().toISOString();
}

/**
 * Write one step whole (the RPC replaces the step value) and log one
 * `[pipeline]` line. A running mark carries only status and startedAt; a final
 * mark adds endedAt and ms computed here.
 */
export async function markPipelineStep(
  supabase: SupabaseClient,
  meetingId: string,
  step: PipelineStep,
  patch: {
    status: PipelineStepStatus;
    startedAt: string;
    model?: string;
    reason?: string;
  },
  source?: PipelineSource,
): Promise<void> {
  const value: PipelineStepValue = {
    status: patch.status,
    startedAt: patch.startedAt,
  };
  if (patch.status !== "running") {
    const endedAt = new Date();
    value.endedAt = endedAt.toISOString();
    const started = Date.parse(patch.startedAt);
    value.ms = Number.isFinite(started)
      ? Math.max(0, endedAt.getTime() - started)
      : 0;
  }
  if (patch.model) value.model = patch.model;
  if (patch.reason) value.reason = patch.reason;

  console.log(
    `[pipeline] meeting=${meetingId} step=${step} status=${value.status}` +
      (value.ms !== undefined ? ` ms=${value.ms}` : "") +
      (value.model ? ` model=${value.model}` : "") +
      (value.reason ? ` reason=${value.reason}` : "") +
      (source ? ` source=${source}` : ""),
  );

  try {
    const { error } = await supabase.rpc("pipeline_mark", {
      p_meeting: meetingId,
      p_step: step,
      p_value: value,
      p_source: source ?? null,
    });
    if (error) console.error("[pipeline] mark failed:", error);
  } catch (err) {
    console.error("[pipeline] mark failed:", err);
  }
}

/**
 * Take the right to run one step. True when this caller runs it. With
 * allowDone false a finished step is never claimed again.
 * Returns false on any error, so a broken claim never runs a step twice.
 */
export async function claimPipelineStep(
  supabase: SupabaseClient,
  meetingId: string,
  step: PipelineStep,
  allowDone: boolean = true,
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("claim_pipeline_step", {
      p_meeting: meetingId,
      p_step: step,
      p_allow_done: allowDone,
    });
    if (error) {
      console.error("[pipeline] claim failed:", error);
      return false;
    }
    return data === true;
  } catch (err) {
    console.error("[pipeline] claim failed:", err);
    return false;
  }
}

/** Read the stored pipeline for one meeting (null when none). Never throws. */
export async function getPipelineState(
  supabase: SupabaseClient,
  meetingId: string,
): Promise<PipelineState | null> {
  try {
    const { data, error } = await supabase
      .from("transcripts")
      .select("pipeline")
      .eq("meeting_id", meetingId)
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("[pipeline] read failed:", error);
      return null;
    }
    return (data?.pipeline as PipelineState | null) ?? null;
  } catch (err) {
    console.error("[pipeline] read failed:", err);
    return null;
  }
}

export type RecapStepState = "waiting" | "running" | "done" | "failed";

export type RecapSteps = {
  recording: RecapStepState;
  transcript: RecapStepState;
  summary: RecapStepState;
};

/**
 * The three after meeting steps the status route returns (spec 0005, step
 * derivation). Pure, so the page and the tests read the same answer.
 */
export function deriveRecapSteps(
  input: {
    state: string;
    rawTextAvailable: boolean;
    hasInsights: boolean;
    pendingStale: boolean;
    noRecordingFinal: boolean;
    pipeline: PipelineState | null;
  },
  now: number = Date.now(),
): RecapSteps {
  const steps = input.pipeline?.steps ?? {};
  const live = (v: PipelineStepValue | undefined) =>
    v?.status === "running" && !isStepStale(v, now);
  const pendingLive = input.state === "pending" && !input.pendingStale;

  // Whisper only starts once Stream listed the recordings, so any whisper mark
  // means the recording step is behind us.
  let recording: RecapStepState = "waiting";
  if (
    steps.recording?.status === "done" ||
    steps.whisper ||
    input.rawTextAvailable ||
    input.state === "too_short"
  ) {
    recording = "done";
  } else if (input.state === "no_recording" && input.noRecordingFinal) {
    recording = "failed";
  } else if (
    live(steps.recording) ||
    input.state === "no_recording" ||
    pendingLive
  ) {
    recording = "running";
  }

  // A fresh pending retry beats a whisper failure left from the last run.
  let transcript: RecapStepState = "waiting";
  if (input.rawTextAvailable) transcript = "done";
  else if (input.state === "failed" || input.state === "too_short")
    transcript = "failed";
  else if (pendingLive) transcript = "running";
  else if (steps.whisper?.status === "failed") transcript = "failed";

  let summary: RecapStepState = "waiting";
  if (input.hasInsights) summary = "done";
  else if (steps.process?.status === "failed") summary = "failed";
  else if (live(steps.process)) summary = "running";

  return { recording, transcript, summary };
}
