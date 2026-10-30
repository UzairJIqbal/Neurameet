// Browser side caller for POST /api/ledger/match, shared by the upload modal,
// Retry summary, and the Ledger tab's Check again button.
export const LEDGER_MATCH_TIMEOUT_MS = 120000;
export const LEDGER_MATCH_FAILED_MESSAGE =
  "Promise matching did not finish. Open the Ledger tab and press Check again.";

/** True when matching finished. Never throws; a parent abort ends it early. */
export async function requestLedgerMatch(
  meetingId: string,
  parentSignal?: AbortSignal,
): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    LEDGER_MATCH_TIMEOUT_MS,
  );
  const onParentAbort = () => controller.abort();
  if (parentSignal?.aborted) controller.abort();
  parentSignal?.addEventListener("abort", onParentAbort);

  try {
    const res = await fetch("/api/ledger/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      console.error("Promise matching failed:", data.error ?? res.status);
    }
    return res.ok;
  } catch (err) {
    console.error("Promise matching request failed:", err);
    return false;
  } finally {
    clearTimeout(timeoutId);
    parentSignal?.removeEventListener("abort", onParentAbort);
  }
}
