import { describe, it, expect } from "vitest";
import { rankCheckinItems, type CheckinRow } from "./live-ledger-rank";
import { CHECKIN_LIMIT } from "./live-ledger-types";

const row = (over: Partial<CheckinRow>): CheckinRow => ({
  id: "x",
  meeting_id: "m1",
  statement: "s",
  quote: "q",
  assignee: null,
  due_date: null,
  created_at: "2026-10-01T00:00:00Z",
  ...over,
});
const meetings = [{ id: "m1", title: "Sprint sync", started_at: "2026-10-01" }];
const today = "2026-11-02";

describe("rankCheckinItems", () => {
  it("puts overdue first, then due soonest, then newest undated", () => {
    const ranked = rankCheckinItems(
      [
        row({ id: "undated-old", created_at: "2026-09-01T00:00:00Z" }),
        row({ id: "due-later", due_date: "2026-11-20" }),
        row({ id: "overdue-recent", due_date: "2026-11-01" }),
        row({ id: "undated-new", created_at: "2026-10-30T00:00:00Z" }),
        row({ id: "overdue-old", due_date: "2026-10-10" }),
        row({ id: "due-soon", due_date: "2026-11-05" }),
      ],
      meetings,
      today,
    );
    expect(ranked.map((r) => r.id)).toEqual([
      "overdue-old",
      "overdue-recent",
      "due-soon",
      "due-later",
      "undated-new",
      "undated-old",
    ]);
    expect(ranked[0].derivedStatus).toBe("overdue");
    expect(ranked[2].derivedStatus).toBe("open");
  });

  it("breaks a due date tie by newest first", () => {
    const ranked = rankCheckinItems(
      [
        row({
          id: "a",
          due_date: "2026-11-05",
          created_at: "2026-10-01T00:00:00Z",
        }),
        row({
          id: "b",
          due_date: "2026-11-05",
          created_at: "2026-10-05T00:00:00Z",
        }),
      ],
      meetings,
      today,
    );
    expect(ranked.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("treats a due date of today as open, not overdue", () => {
    const [item] = rankCheckinItems(
      [row({ due_date: today })],
      meetings,
      today,
    );
    expect(item.derivedStatus).toBe("open");
  });

  it("returns an empty list for no rows", () => {
    expect(rankCheckinItems([], meetings, today)).toEqual([]);
  });

  it("cuts to the limit and fills the source meeting", () => {
    const rows = Array.from({ length: CHECKIN_LIMIT + 5 }, (_, i) =>
      row({ id: `r${i}`, meeting_id: i === 0 ? "gone" : "m1" }),
    );
    const ranked = rankCheckinItems(rows, meetings, today);
    expect(ranked).toHaveLength(CHECKIN_LIMIT);
    const gone = ranked.find((r) => r.id === "r0");
    expect(gone?.sourceMeeting.title).toBe("Untitled meeting");
    expect(ranked.find((r) => r.id === "r1")?.sourceMeeting.title).toBe(
      "Sprint sync",
    );
  });
});
