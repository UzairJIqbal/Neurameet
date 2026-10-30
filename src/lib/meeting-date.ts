// Optional "Meeting date" on transcript upload (Promise Ledger spec 0001,
// AC-5). The date anchors relative due dates, so it becomes started_at on a new
// meeting at noon UTC (noon keeps the calendar day stable in any time zone).

export type MeetingDateResult =
  { ok: true; startedAt: string | null } | { ok: false; error: string };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function parseMeetingDate(value: unknown, now: Date): MeetingDateResult {
  if (value === undefined || value === null || value === "") {
    return { ok: true, startedAt: null };
  }

  const invalid = {
    ok: false as const,
    error: "Meeting date must be a valid date (YYYY-MM-DD)",
  };
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return invalid;

  const [year, month, day] = value.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  // Round trip so an impossible date like 2026-02-30 is rejected.
  if (utc.toISOString().slice(0, 10) !== value) return invalid;

  // The server runs on UTC; allow one extra day so a user ahead of UTC picking
  // their own local today is never rejected.
  const latestAllowed = new Date(now.getTime() + DAY_MS)
    .toISOString()
    .slice(0, 10);
  if (value > latestAllowed) {
    return { ok: false, error: "Meeting date cannot be in the future" };
  }

  return { ok: true, startedAt: `${value}T12:00:00.000Z` };
}
