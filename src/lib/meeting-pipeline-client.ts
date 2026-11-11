// Browser side AI chain for a meeting that just got a transcript without going
// through the upload modal: process, then embed, then promise matching.
import { readUserPrefs } from "@/lib/user-prefs";
import { requestLedgerMatch } from "@/lib/ledger-match-client";

const STEP_TIMEOUT_MS = 120000;

export type PipelineResult =
  | { status: "skipped" }
  | { status: "processed"; embedded: boolean; matched: boolean }
  | { status: "failed"; message: string };

async function postJson(
  url: string,
  body: object,
): Promise<{ ok: boolean; error?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STEP_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    return { ok: false, error: data?.error };
  } catch (err) {
    console.error(`Request to ${url} failed:`, err);
    return { ok: false };
  } finally {
    clearTimeout(timeoutId);
  }
}

/** True when the caller can manage the meeting and no summary exists yet. */
async function needsProcessing(meetingId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/meetings/${meetingId}`);
    if (!res.ok) return false;
    const data = (await res.json()) as {
      insights?: { summary?: string } | null;
    };
    return !data.insights?.summary;
  } catch (err) {
    console.error("Meeting lookup failed:", err);
    return false;
  }
}

export async function runMeetingPipeline(
  meetingId: string,
): Promise<PipelineResult> {
  if (!(await needsProcessing(meetingId))) return { status: "skipped" };
  const { emailNotifications } = readUserPrefs();
  const processed = await postJson("/api/ai/process", {
    meetingId,
    emailNotifications,
  });
  if (!processed.ok) {
    return {
      status: "failed",
      message: processed.error ?? "Summary generation failed, try again",
    };
  }
  const embedded = (await postJson("/api/ai/embed", { meetingId })).ok;
  const matched = embedded ? await requestLedgerMatch(meetingId) : false;
  return { status: "processed", embedded, matched };
}
