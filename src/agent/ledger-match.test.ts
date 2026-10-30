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
}) => {
  const writes = {
    upserted: [] as Array<Record<string, unknown>>,
    deletedItemIds: [] as string[],
    embeddedIds: [] as string[],
  };
  const from = (table: string) => {
    const builder: Record<string, unknown> = {};
    let op: "select" | "delete" | "update" = "select";
    let updateId = "";
    const result = () => {
      if (op === "update") writes.embeddedIds.push(updateId);
      if (table === "ledger_items" && op === "select") {
        return { data: [], error: null };
      }
      if (table === "ledger_links" && op === "select") {
        return { data: state.existingLinks, error: null };
      }
      return { data: null, error: null };
    };
    builder.select = () => builder;
    builder.is = () => builder;
    builder.eq = (col: string, val: string) => {
      if (col === "id") updateId = val;
      return builder;
    };
    builder.in = (_col: string, vals: string[]) => {
      if (op === "delete") writes.deletedItemIds.push(...vals);
      return builder;
    };
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
    rpc: () => Promise.resolve({ data: state.candidates, error: null }),
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
});
