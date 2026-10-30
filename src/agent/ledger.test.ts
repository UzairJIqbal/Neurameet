import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  deriveLedgerStatus,
  filterVerdicts,
  findQuoteLine,
  numberTranscriptLines,
  LEDGER_MAX_ITEMS,
  prepareLedgerRows,
  recomputeLedgerItemStatus,
  stripSpeakerPrefix,
} from "./ledger";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LedgerItemExtraction } from "./types";

const transcript = [
  "Sara: Let's start with the hosting question.",
  "Ali: main   Friday tak survey bhej dunga",
  "Sara: ہم Vercel استعمال کریں گے",
  "Bilal: We decided to go with Vercel for hosting.",
].join("\n");

const item = (
  over: Partial<LedgerItemExtraction> = {},
): LedgerItemExtraction => ({
  kind: "promise",
  statement: "Ali will send the survey by Friday",
  quote: "main Friday tak survey bhej dunga",
  quoteLanguage: "mixed",
  speaker: "Ali",
  assignee: "Ali",
  dueDate: "2026-10-09",
  actionItemIndex: 0,
  ...over,
});

const prepare = (
  items: LedgerItemExtraction[],
  extra: { actionItemIds?: string[]; keptQuotes?: string[] } = {},
) =>
  prepareLedgerRows({
    meetingId: "m1",
    rawText: transcript,
    items,
    actionItemIds: extra.actionItemIds ?? ["ai-1"],
    keptQuotes: extra.keptQuotes ?? [],
  });

describe("findQuoteLine", () => {
  it("finds Roman Urdu despite extra spaces and case", () => {
    expect(findQuoteLine(transcript, "MAIN friday TAK  survey")).toEqual({
      lineNumber: 2,
      speaker: "Ali",
    });
  });

  it("finds Urdu script", () => {
    expect(
      findQuoteLine(transcript, "Vercel استعمال کریں گے")?.lineNumber,
    ).toBe(3);
  });

  it("ignores a speaker label the model left in the quote", () => {
    expect(
      findQuoteLine(transcript, "Bilal: We decided to go with Vercel")
        ?.lineNumber,
    ).toBe(4);
  });

  it("returns null when the quote is not in the transcript", () => {
    expect(findQuoteLine(transcript, "we will move to AWS")).toBeNull();
  });

  it("rejects a near empty quote", () => {
    expect(findQuoteLine(transcript, "a")).toBeNull();
  });
});

describe("stripSpeakerPrefix", () => {
  it("does not treat a time as a speaker", () => {
    expect(stripSpeakerPrefix("10:30 works for me")).toBe("10:30 works for me");
  });
});

describe("prepareLedgerRows", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("stores a verified promise with line, assignee, due date, and action item", () => {
    const [row] = prepare([item()]);
    expect(row).toMatchObject({
      meeting_id: "m1",
      kind: "promise",
      quote_language: "mixed",
      line_number: 2,
      assignee: "Ali",
      due_date: "2026-10-09",
      action_item_id: "ai-1",
    });
  });

  it("drops an unverified quote and logs without the quote text", () => {
    const rows = prepare([item({ quote: "we will move to AWS" })]);
    expect(rows).toHaveLength(0);
    expect(console.warn).toHaveBeenCalledWith(
      "[ledger] dropped unverified quote",
      {
        meetingId: "m1",
        kind: "promise",
      },
    );
  });

  it("clears assignee, due date, and action item for decisions", () => {
    const [row] = prepare([
      item({ kind: "decision", quote: "We decided to go with Vercel" }),
    ]);
    expect(row).toMatchObject({
      assignee: null,
      due_date: null,
      action_item_id: null,
    });
  });

  it("maps an out of range action item index to null", () => {
    expect(
      prepare([item({ actionItemIndex: 5 })])[0].action_item_id,
    ).toBeNull();
    expect(
      prepare([item({ actionItemIndex: -1 })])[0].action_item_id,
    ).toBeNull();
  });

  it("nulls an unparseable due date", () => {
    expect(
      prepare([item({ dueDate: "October Friday" })])[0].due_date,
    ).toBeNull();
  });

  it("skips an item whose quote matches a kept item", () => {
    expect(
      prepare([item()], { keptQuotes: ["Main Friday tak survey bhej dunga"] }),
    ).toHaveLength(0);
  });

  it("falls back to the line's speaker label", () => {
    expect(prepare([item({ speaker: null })])[0].speaker).toBe("Ali");
  });

  it(`caps at ${LEDGER_MAX_ITEMS} rows`, () => {
    const long = Array.from(
      { length: 20 },
      (_, i) => `Ali: promise number ${i} ok`,
    ).join("\n");
    const rows = prepareLedgerRows({
      meetingId: "m1",
      rawText: long,
      items: Array.from({ length: 20 }, (_, i) =>
        item({ quote: `promise number ${i} ok` }),
      ),
      actionItemIds: [],
      keptQuotes: [],
    });
    expect(rows).toHaveLength(LEDGER_MAX_ITEMS);
  });
});

describe("deriveLedgerStatus", () => {
  it("marks an open promise due yesterday as overdue", () => {
    expect(deriveLedgerStatus("open", "2026-10-29", "2026-10-30")).toBe(
      "overdue",
    );
  });

  it("keeps a promise due today open", () => {
    expect(deriveLedgerStatus("open", "2026-10-30", "2026-10-30")).toBe("open");
  });

  it("never overrides kept or reversed", () => {
    expect(deriveLedgerStatus("kept", "2026-01-01", "2026-10-30")).toBe("kept");
    expect(deriveLedgerStatus("reversed", "2026-01-01", "2026-10-30")).toBe(
      "reversed",
    );
  });

  it("leaves an item with no due date open", () => {
    expect(deriveLedgerStatus("open", null, "2026-10-30")).toBe("open");
  });
});

describe("recomputeLedgerItemStatus", () => {
  const client = (error: unknown) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error });
    return { rpc, supabase: { rpc } as unknown as SupabaseClient };
  };

  it("calls the SQL function with the item id", async () => {
    const { rpc, supabase } = client(null);
    await recomputeLedgerItemStatus(supabase, "item-1");
    expect(rpc).toHaveBeenCalledWith("ledger_recompute_item_status", {
      p_item_id: "item-1",
    });
  });

  it("throws when the database call fails", async () => {
    const { supabase } = client(new Error("boom"));
    await expect(recomputeLedgerItemStatus(supabase, "item-1")).rejects.toThrow(
      "boom",
    );
  });
});

describe("filterVerdicts", () => {
  const verdict = (over: Record<string, unknown> = {}) => ({
    itemId: "c1",
    relation: "kept" as const,
    confidence: 0.9,
    quote: "We decided to go with Vercel for hosting.",
    ...over,
  });
  const run = (verdicts: ReturnType<typeof verdict>[]) =>
    filterVerdicts({
      verdicts: verdicts as Parameters<typeof filterVerdicts>[0]["verdicts"],
      candidateIds: ["c1", "c2"],
      rawText: transcript,
    });

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("drops a verdict below the confidence threshold", () => {
    expect(run([verdict({ confidence: 0.6 })])).toEqual([]);
  });

  it("keeps a verdict at exactly 0.7 with its line and speaker", () => {
    expect(run([verdict({ confidence: 0.7 })])).toEqual([
      {
        itemId: "c1",
        relation: "kept",
        confidence: 0.7,
        quote: "We decided to go with Vercel for hosting.",
        speaker: "Bilal",
        lineNumber: 4,
      },
    ]);
  });

  it("drops none, unknown ids, and unverified quotes", () => {
    expect(
      run([
        verdict({ relation: "none" }),
        verdict({ itemId: "stranger" }),
        verdict({ itemId: "c2", quote: "we never said this" }),
        verdict({ itemId: "c2", quote: null }),
      ]),
    ).toEqual([]);
  });

  it("verifies an Urdu quote and strips copied line and speaker labels", () => {
    const [row] = run([
      verdict({
        relation: "reversed",
        quote: "3: Sara: ہم Vercel استعمال کریں گے",
      }),
    ]);
    expect(row).toMatchObject({
      relation: "reversed",
      quote: "ہم Vercel استعمال کریں گے",
      speaker: "Sara",
      lineNumber: 3,
    });
  });

  it("keeps only the first verdict per item", () => {
    const rows = run([
      verdict({ confidence: 0.8 }),
      verdict({ relation: "reversed", confidence: 0.95 }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].relation).toBe("kept");
  });
});

describe("numberTranscriptLines", () => {
  it("numbers every line from 1", () => {
    expect(numberTranscriptLines("a\nb")).toBe("1: a\n2: b");
  });

  it("cuts long transcripts at the cap and says so", () => {
    const out = numberTranscriptLines("abcdef", 3);
    expect(out).toBe("1: abc\n[transcript truncated for processing]");
  });
});
