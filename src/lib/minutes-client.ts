// Browser side caller for GET /api/minutes, used by the Minutes tab.
import type { MinutesResponse } from "@/lib/minutes-types";

/** Throws with the route's error message when the load fails. */
export async function fetchMinutes(
  meetingId: string,
  signal?: AbortSignal,
): Promise<MinutesResponse> {
  const query = new URLSearchParams({ meetingId });
  const res = await fetch(`/api/minutes?${query.toString()}`, { signal });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Minutes failed: ${res.status}`);
  }
  return (await res.json()) as MinutesResponse;
}

async function post<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `Request failed: ${res.status}`);
  return json;
}

export const openReview = (meetingId: string, deadlineDays: number) =>
  post<{ reviewId: string; deadlineAt: string }>("/api/minutes/review", {
    meetingId,
    action: "open",
    deadlineDays,
  });

export const cancelReview = (meetingId: string) =>
  post<{ ok: true }>("/api/minutes/review", { meetingId, action: "cancel" });

export const updateClaim = (
  meetingId: string,
  action: "claim" | "assign" | "clear",
  speakerLabel: string,
  userId?: string,
) =>
  post<{ ok: true }>("/api/minutes/claim", {
    meetingId,
    action,
    speakerLabel,
    userId,
  });

export const attestLine = (
  meetingId: string,
  action: "confirm" | "correct" | "view",
  lineId: string,
  note?: string,
  suggestionId?: string,
) =>
  post<{ answer: unknown }>("/api/minutes/attest", {
    meetingId,
    action,
    lineId,
    note,
    suggestionId,
  });

export const finishReview = (meetingId: string) =>
  post<{ doneAt: string }>("/api/minutes/attest", {
    meetingId,
    action: "finish",
  });

export const dismissSuggestion = (meetingId: string, suggestionId: string) =>
  post<{ status: "dismissed" }>("/api/minutes/suggestion", {
    meetingId,
    suggestionId,
    action: "dismiss",
  });

export const sealMinutes = (meetingId: string) =>
  post<{ sealId: string; hash: string; statusText: string }>(
    "/api/minutes/seal",
    { meetingId },
  );

/** Downloads the sealed PDF through a temporary link. */
export async function downloadMinutesPdf(meetingId: string): Promise<void> {
  const res = await fetch(
    `/api/minutes/pdf?${new URLSearchParams({ meetingId }).toString()}`,
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `PDF failed: ${res.status}`);
  }
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const name = /filename="([^"]+)"/u.exec(disposition)?.[1] ?? "minutes.pdf";
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
