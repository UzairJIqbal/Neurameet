import { deriveLedgerStatus } from "@/agent/ledger";
import { CHECKIN_LIMIT, type CheckinItem } from "./live-ledger-types";

export interface CheckinRow {
  id: string;
  meeting_id: string;
  statement: string;
  quote: string;
  assignee: string | null;
  due_date: string | null;
  created_at: string;
}

export interface CheckinMeeting {
  id: string;
  title: string | null;
  started_at: string | null;
}

// 0 = overdue, 1 = has a due date, 2 = no due date.
function bucket(row: CheckinRow, today: string): number {
  if (!row.due_date) return 2;
  return row.due_date < today ? 0 : 1;
}

function compare(a: CheckinRow, b: CheckinRow, today: string): number {
  const ba = bucket(a, today);
  const bb = bucket(b, today);
  if (ba !== bb) return ba - bb;
  if (ba < 2 && a.due_date !== b.due_date) {
    return (a.due_date ?? "") < (b.due_date ?? "") ? -1 : 1;
  }
  // Same bucket and due date: newest first.
  return b.created_at.localeCompare(a.created_at);
}

/**
 * Deterministic check-in order (spec AC-1): overdue first (oldest due date
 * first), then items with a due date (soonest first), then the newest.
 */
export function rankCheckinItems(
  rows: CheckinRow[],
  meetings: CheckinMeeting[],
  today: string,
): CheckinItem[] {
  const byId = new Map(meetings.map((m) => [m.id, m]));
  return [...rows]
    .sort((a, b) => compare(a, b, today))
    .slice(0, CHECKIN_LIMIT)
    .map((row) => {
      const meeting = byId.get(row.meeting_id);
      return {
        id: row.id,
        statement: row.statement,
        quote: row.quote,
        assignee: row.assignee,
        dueDate: row.due_date,
        derivedStatus:
          deriveLedgerStatus("open", row.due_date, today) === "overdue"
            ? "overdue"
            : "open",
        sourceMeeting: {
          id: row.meeting_id,
          title: meeting?.title?.trim() || "Untitled meeting",
          startedAt: meeting?.started_at ?? null,
        },
      };
    });
}
