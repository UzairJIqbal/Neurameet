import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRpc, mockEmbed, mockGenerate } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockEmbed: vi.fn(),
  mockGenerate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("ai", () => ({ embed: mockEmbed }));
vi.mock("./rag", () => ({ QUESTION_EMBEDDING: "embedding-model" }));
vi.mock("./models", () => ({ generateStructuredWithFallback: mockGenerate }));
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: () => ({ rpc: mockRpc }),
}));

import { findPrepLedgerItems, generatePrepSuggestions } from "./prep";

const row = (id: string, dueDate: string | null) => ({
  id,
  meeting_id: "m1",
  meeting_title: "Survey kickoff",
  meeting_started_at: "2026-10-01T12:00:00.000Z",
  kind: "promise",
  statement: "Ali sends the survey",
  quote: "main Friday tak survey bhej dunga",
  assignee: "Ali",
  due_date: dueDate,
  similarity: 0.82,
});

const suggestions = {
  context: ["Survey is pending"],
  openActionItems: [],
  discussionPoints: [],
  questionsToAsk: [],
};

describe("findPrepLedgerItems (Promise Ledger AC-15)", () => {
  beforeEach(() => mockRpc.mockReset());

  it("maps rows and derives overdue from the given date", async () => {
    mockRpc.mockResolvedValue({
      data: [row("a", "2026-10-03"), row("b", "2026-12-01"), row("c", null)],
      error: null,
    });

    const items = await findPrepLedgerItems("user-1", [0.1], "2026-10-30");

    expect(mockRpc).toHaveBeenCalledWith("match_ledger_prep_items", {
      query_embedding: [0.1],
      p_user_id: "user-1",
      match_count: 5,
    });
    expect(items.map((i) => i.derivedStatus)).toEqual(["overdue", "open", "open"]);
    expect(items[0]).toMatchObject({
      id: "a",
      kind: "promise",
      assignee: "Ali",
      dueDate: "2026-10-03",
      sourceMeeting: {
        id: "m1",
        title: "Survey kickoff",
        startedAt: "2026-10-01T12:00:00.000Z",
      },
    });
  });

  it("returns an empty list when the lookup fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockRpc.mockResolvedValue({ data: null, error: { message: "boom" } });

    expect(await findPrepLedgerItems("user-1", [0.1], "2026-10-30")).toEqual([]);
    expect(spy.mock.calls[0][0]).toContain("[ledger]");
    spy.mockRestore();
  });
});

describe("generatePrepSuggestions ledger list", () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockEmbed.mockReset();
    mockEmbed.mockResolvedValue({ embedding: [0.1] });
    mockGenerate.mockResolvedValue({ object: suggestions });
  });

  it("returns ledger items beside the LLM suggestions", async () => {
    mockRpc.mockImplementation(async (fn: string) =>
      fn === "match_ledger_prep_items"
        ? { data: [row("a", null)], error: null }
        : { data: [], error: null },
    );

    const result = await generatePrepSuggestions("user-1", "Survey sync");

    expect(result.suggestions).toEqual(suggestions);
    expect(result.ledgerItems.map((i) => i.id)).toEqual(["a"]);
  });

  it("still returns suggestions when the ledger lookup fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockRpc.mockImplementation(async (fn: string) =>
      fn === "match_ledger_prep_items"
        ? { data: null, error: { message: "boom" } }
        : { data: [], error: null },
    );

    const result = await generatePrepSuggestions("user-1", "Survey sync");

    expect(result).toEqual({ suggestions, ledgerItems: [] });
    spy.mockRestore();
  });

  it("returns empty lists for an empty query", async () => {
    const result = await generatePrepSuggestions("user-1", "  ");
    expect(result.ledgerItems).toEqual([]);
    expect(mockEmbed).not.toHaveBeenCalled();
  });
});
