// Browser side callers for GET /api/ledger and the link review route, shared by
// the Ledger tab and the tab badge in MeetingTabs.
import type { LedgerResponse, LedgerReviewDecision } from "@/lib/meeting-types";

/** The viewer's local calendar date, so "overdue" never shifts with time zones. */
export const localToday = (): string => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
};

/** Throws with the route's error message when the load fails. */
export async function fetchLedger(
  meetingId: string,
  signal?: AbortSignal,
): Promise<LedgerResponse> {
  const query = new URLSearchParams({ meetingId, today: localToday() });
  const res = await fetch(`/api/ledger?${query.toString()}`, { signal });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Ledger failed: ${res.status}`);
  }
  return (await res.json()) as LedgerResponse;
}

/** True when the review was saved. Never throws. */
export async function reviewLedgerLink(
  linkId: string,
  decision: LedgerReviewDecision,
): Promise<boolean> {
  try {
    const res = await fetch(
      `/api/ledger/links/${encodeURIComponent(linkId)}/review`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      },
    );
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      console.error("[ledger] review failed:", data.error ?? res.status);
    }
    return res.ok;
  } catch (err) {
    console.error("[ledger] review request failed:", err);
    return false;
  }
}
