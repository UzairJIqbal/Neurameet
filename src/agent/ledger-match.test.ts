import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const { mockJudge, mockEmbedTexts } = vi.hoisted(() => ({
  mockJudge: vi.fn(),
  mockEmbedTexts: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./embed", () => ({ embedTexts: mockEmbedTexts }));
vi.mock("./ledger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./ledger")>()),
  judgeLedgerCandidates: mockJudge,
}));

import { LedgerJudgeError, runLedgerMatch } from "./ledger-match";

const rawText = ["Ali: survey bhej diya tha kal", "Sara: we moved to AWS"].join(
  "\n",
);

const candidate = (id: string) => ({
  id,
  meeting_id: "m0",
  kind: "promise",
  statement: `statement ${id}`,
  quote: `quote ${id}`,
  assignee: null,
  due_date: null,
  similarity: 0.8,
});

// Chainable double that records every write so tests can assert on them.
const makeSupabase = (state: {
  candidates: ReturnType<typeof candidate>[];
  existingLinks: Array<{ item_id: string; state: string }>;
  liveMarks?: Array<{ item_id: string; mark: string }>;
  liveItems?: Array<Omit<ReturnType<typeof candidate>, "similarity">>;
  ownedMeetingIds?: string[];
}) => {
  const writes = {
    upserted: [] as Array<Record<string, unknown>>,
    deletedItemIds: [] as string[],
    embeddedIds: [] as string[],
    recomputed: [] as string[],
    meetingFilters: [] as Array<[string, unknown]>,
  };
  const from = (table: string) => {
    const builder: Record<string, unknown> = {};
    let op: "select" | "delete" | "update" = "select";
    let updateId = "";
    let byId = false;
    const result = () => {
      if (op === "update") writes.embeddedIds.push(updateId);
      if (table === "ledger_live_marks") {
        return { data: state.liveMarks ?? [], error: null };
      }
      if (table === "meetings") {
        return {
          data: (state.ownedMeetingIds ?? []).map((id) => ({ id })),
          error: null,
        };
      }
      if (table === "ledger_items" && op === "select") {
        return { data: byId ? (state.liveItems ?? []) : [], error: null };
      }
      if (table === "ledger_links" && op === "select") {
        return { data: state.existingLinks, error: null };
      }
      return { data: null, error: null };
    };
    builder.select = () => builder;
    builder.is = (col: string, val: unknown) => {
      if (table === "meetings") writes.meetingFilters.push([col, val]);
      return builder;
    };
    builder.eq = (col: string, val: string) => {
      if (table === "meetings") writes.meetingFilters.push([col, val]);
      if (col === "id") updateId = val;
      return builder;
    };
    builder.in = (col: string, vals: string[]) => {
      if (op === "delete") writes.deletedItemIds.push(...vals);
      if (col === "id") byId = true;
      return builder;
    };
    builder.neq = () => builder;
    builder.delete = () => {
      op = "delete";
      return builder;
    };
    builder.update = () => {
      op = "update";
      return builder;
    };
    builder.upsert = (rows: Array<Record<string, unknown>>) => {
      writes.upserted.push(...rows);
      return Promise.resolve({ data: null, error: null });
    };
    builder.then = (res: (v: unknown) => unknown) =>
      Promise.resolve(result()).then(res);
    return builder;
  };
  const client = {
    from,
    rpc: (name: string, params: Record<string, unknown>) => {
      if (name === "ledger_recompute_item_status") {
        writes.recomputed.push(params.p_item_id as string);
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: state.candidates, error: null });
    },
  };
  return { client: client as unknown as SupabaseClient, writes };
};

const verdict = (itemId: string, quote: string) => ({
  itemId,
  relation: "kept" as const,
  confidence: 0.9,
  quote,
});

const args = { meetingId: "m1", userId: "u1", rawText };

describe("runLedgerMatch", () => {
  beforeEach(() => {
    mockJudge.mockReset();
    mockEmbedTexts.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("returns 0 without calling the judge when there are no candidates", async () => {
    const { client, writes } = makeSupabase({
      candidates: [],
      existingLinks: [],
    });
    expect(await runLedgerMatch(client, args)).toEqual({ matched: 0 });
    expect(mockJudge).not.toHaveBeenCalled();
    expect(writes.upserted).toEqual([]);
  });

  it("never touches a confirmed or rejected link", async () => {
    mockJudge.mockResolvedValue([
      verdict("c1", "survey bhej diya tha kal"),
      verdict("c2", "we moved to AWS"),
      verdict("c3", "survey bhej diya tha kal"),
    ]);
    const { client, writes } = makeSupabase({
      candidates: [candidate("c1"), candidate("c2"), candidate("c3")],
      existingLinks: [
        { item_id: "c1", state: "confirmed" },
        { item_id: "c2", state: "rejected" },
      ],
    });
    expect(await runLedgerMatch(client, args)).toEqual({ matched: 1 });
    expect(writes.upserted).toHaveLength(1);
    expect(writes.upserted[0]).toMatchObject({
      item_id: "c3",
      evidence_meeting_id: "m1",
      state: "suggested",
      line_number: 1,
      speaker: "Ali",
    });
    expect(writes.deletedItemIds).toEqual([]);
  });

  it("deletes a suggested link the rerun did not repeat", async () => {
    mockJudge.mockResolvedValue([verdict("c1", "we moved to AWS")]);
    const { client, writes } = makeSupabase({
      candidates: [candidate("c1"), candidate("c2")],
      existingLinks: [
        { item_id: "c1", state: "suggested" },
        { item_id: "c2", state: "suggested" },
      ],
    });
    await runLedgerMatch(client, args);
    expect(writes.deletedItemIds).toEqual(["c2"]);
    expect(writes.upserted.map((r) => r.item_id)).toEqual(["c1"]);
  });

  it("writes nothing when the judge fails", async () => {
    mockJudge.mockRejectedValue(new Error("both providers down"));
    const { client, writes } = makeSupabase({
      candidates: [candidate("c1")],
      existingLinks: [{ item_id: "c1", state: "suggested" }],
    });
    await expect(runLedgerMatch(client, args)).rejects.toBeInstanceOf(
      LedgerJudgeError,
    );
    expect(writes.upserted).toEqual([]);
    expect(writes.deletedItemIds).toEqual([]);
  });

  describe("live marks reconcile (spec 0002 AC-14)", () => {
    const reversed = (itemId: string, quote: string) => ({
      ...verdict(itemId, quote),
      relation: "reversed" as const,
    });

    it("confirms a verdict that agrees with the live mark and recomputes", async () => {
      mockJudge.mockResolvedValue([
        verdict("c1", "survey bhej diya tha kal"),
        verdict("c2", "we moved to AWS"),
      ]);
      const { client, writes } = makeSupabase({
        candidates: [candidate("c1"), candidate("c2")],
        existingLinks: [],
        liveMarks: [{ item_id: "c1", mark: "kept" }],
      });
      expect(await runLedgerMatch(client, args)).toEqual({ matched: 2 });
      const byItem = new Map(writes.upserted.map((r) => [r.item_id, r]));
      expect(byItem.get("c1")).toMatchObject({ state: "confirmed" });
      expect(byItem.get("c1")?.decided_at).toEqual(expect.any(String));
      expect(byItem.get("c2")).toMatchObject({
        state: "suggested",
        decided_at: null,
      });
      expect(writes.recomputed).toEqual(["c1"]);
    });

    it("keeps a disagreeing verdict suggested", async () => {
      mockJudge.mockResolvedValue([reversed("c1", "we moved to AWS")]);
      const { client, writes } = makeSupabase({
        candidates: [candidate("c1")],
        existingLinks: [],
        liveMarks: [{ item_id: "c1", mark: "kept" }],
      });
      await runLedgerMatch(client, args);
      expect(writes.upserted[0]).toMatchObject({
        relation: "reversed",
        state: "suggested",
      });
      expect(writes.recomputed).toEqual([]);
    });

    it("adds a live marked item similarity left out, if the user owns it", async () => {
      mockJudge.mockResolvedValue([verdict("x1", "survey bhej diya tha kal")]);
      const { client, writes } = makeSupabase({
        candidates: [],
        existingLinks: [],
        liveMarks: [
          { item_id: "x1", mark: "kept" },
          { item_id: "x2", mark: "kept" },
        ],
        liveItems: [
          { ...candidate("x1"), meeting_id: "m0" },
          { ...candidate("x2"), meeting_id: "other" },
        ],
        ownedMeetingIds: ["m0"],
      });
      expect(await runLedgerMatch(client, args)).toEqual({ matched: 1 });
      const judged = mockJudge.mock.calls[0][0].candidates.map(
        (c: { id: string }) => c.id,
      );
      expect(judged).toEqual(["x1"]);
      expect(writes.upserted[0]).toMatchObject({
        item_id: "x1",
        state: "confirmed",
      });
    });

    it("scopes live marked items to personal meetings on a personal meeting", async () => {
      mockJudge.mockResolvedValue([]);
      const { client, writes } = makeSupabase({
        candidates: [],
        existingLinks: [],
        liveMarks: [{ item_id: "x1", mark: "kept" }],
        liveItems: [candidate("x1")],
        ownedMeetingIds: ["m0"],
      });
      await runLedgerMatch(client, args);
      expect(writes.meetingFilters).toEqual([
        ["user_id", "u1"],
        ["project_id", null],
      ]);
    });

    it("scopes live marked items to the whole project on a project meeting", async () => {
      mockJudge.mockResolvedValue([]);
      const { client, writes } = makeSupabase({
        candidates: [],
        existingLinks: [],
        liveMarks: [{ item_id: "x1", mark: "kept" }],
        liveItems: [candidate("x1")],
        ownedMeetingIds: ["m0"],
      });
      await runLedgerMatch(client, { ...args, projectId: "p1" });
      expect(writes.meetingFilters).toEqual([["project_id", "p1"]]);
    });

    it("never touches a rejected link even when the live mark agrees", async () => {
      mockJudge.mockResolvedValue([verdict("c1", "survey bhej diya tha kal")]);
      const { client, writes } = makeSupabase({
        candidates: [candidate("c1")],
        existingLinks: [{ item_id: "c1", state: "rejected" }],
        liveMarks: [{ item_id: "c1", mark: "kept" }],
      });
      expect(await runLedgerMatch(client, args)).toEqual({ matched: 0 });
      expect(writes.upserted).toEqual([]);
      expect(writes.recomputed).toEqual([]);
    });
  });
});
