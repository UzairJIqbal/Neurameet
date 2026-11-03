// Browser side lookup of a meeting row by its Stream call id (W3).
// Returns null on a 404 (no row yet, so a personal `default` call) and throws on
// any other failure, so callers show LoadError instead of guessing `default`.

import {
  DEFAULT_CALL_TYPE,
  isStreamCallType,
  type StreamCallType,
} from "@/lib/stream-call-type";

export type MeetingByCall = { meetingId: string; callType: StreamCallType };

export class MeetingLookupError extends Error {
  constructor(public status: number) {
    super(`Meeting lookup failed (${status})`);
    this.name = "MeetingLookupError";
  }
}

export async function lookupMeetingByCall(
  callId: string,
  signal?: AbortSignal,
): Promise<MeetingByCall | null> {
  const res = await fetch(
    `/api/meetings/by-call/${encodeURIComponent(callId)}`,
    {
      signal,
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new MeetingLookupError(res.status);
  const data = (await res.json()) as {
    meetingId?: unknown;
    callType?: unknown;
  };
  if (typeof data.meetingId !== "string")
    throw new MeetingLookupError(res.status);
  return {
    meetingId: data.meetingId,
    callType: isStreamCallType(data.callType)
      ? data.callType
      : DEFAULT_CALL_TYPE,
  };
}
