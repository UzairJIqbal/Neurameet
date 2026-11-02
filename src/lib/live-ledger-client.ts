// Browser side callers for the Live Ledger routes (spec 0002).
import type {
  AgreementCloseResponse,
  AgreementVote,
  CheckinResponse,
  LiveCardState,
  LiveMark,
  LiveStateResponse,
  VoteResponse,
} from "@/lib/live-ledger-types";
import { localToday } from "@/lib/ledger-client";

/** A failed Live Ledger call, keeping the HTTP status for retry rules. */
export class LiveLedgerError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "LiveLedgerError";
  }
}

async function readJson<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new LiveLedgerError(
      body.error ?? `${fallback}: ${res.status}`,
      res.status,
    );
  }
  return (await res.json()) as T;
}

const postJson = <T>(url: string, body: unknown, fallback: string) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((res) => readJson<T>(res, fallback));

/** Throws with the route's error message when the load fails. */
export async function fetchCheckin(
  callId: string,
  signal?: AbortSignal,
): Promise<CheckinResponse> {
  const query = new URLSearchParams({ callId, today: localToday() });
  const res = await fetch(`/api/ledger/live/checkin?${query.toString()}`, {
    signal,
  });
  return readJson<CheckinResponse>(res, "Check-in failed");
}

export async function fetchLiveState(
  callId: string,
  guestStreamToken: string | null,
  signal?: AbortSignal,
): Promise<LiveStateResponse> {
  const query = new URLSearchParams({ callId, today: localToday() });
  if (guestStreamToken) query.set("guestStreamToken", guestStreamToken);
  const res = await fetch(`/api/ledger/live?${query.toString()}`, { signal });
  return readJson<LiveStateResponse>(res, "Live ledger failed");
}

export const raiseCard = (callId: string, itemId: string) =>
  postJson<LiveCardState>(
    "/api/ledger/live/card",
    { callId, itemId, action: "raise", today: localToday() },
    "Could not show the card",
  );

export const markCard = (callId: string, itemId: string, mark: LiveMark) =>
  postJson<{ itemId: string; mark: LiveMark }>(
    "/api/ledger/live/card",
    { callId, itemId, action: "mark", mark },
    "Could not mark the card",
  );

export const closeCard = (callId: string, itemId: string) =>
  postJson<{ itemId: string; closed: boolean }>(
    "/api/ledger/live/card",
    { callId, itemId, action: "close" },
    "Could not close the card",
  );

export const openAgreement = (callId: string, statement: string) =>
  postJson<{ agreementId: string; statement: string }>(
    "/api/ledger/live/agreement",
    { callId, action: "open", statement },
    "Could not start the agreement check",
  );

export const closeAgreement = (callId: string, agreementId: string) =>
  postJson<AgreementCloseResponse>(
    "/api/ledger/live/agreement",
    { callId, action: "close", agreementId },
    "Could not close the agreement check",
  );

export const castVote = (
  callId: string,
  agreementId: string,
  vote: AgreementVote,
  guestStreamToken: string | null,
) =>
  postJson<VoteResponse>(
    "/api/ledger/live/vote",
    { callId, agreementId, vote, guestStreamToken },
    "Could not save your vote",
  );
