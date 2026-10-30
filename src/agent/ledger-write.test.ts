import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { writeLedgerItems } from "./ledger";
import type { LedgerItemExtraction } from "./types";

// Minimal chainable Supabase double: records deletes and inserts per table.
const makeSupabase = (state: {
  items: Array<{ id: string; quote: string }>;
  reviewedItemIds: string[];
  insertError?: unknown;
}) => {
  const calls = {
    deleted: [] as string[],
    inserted: [] as Array<Record<string, unknown>>,
  };
  const client = {
    from: (table: string) => ({
      select: () => {
        if (table === "ledger_items") {
          return {
            eq: () => Promise.resolve({ data: state.items, error: null }),
          };
        }
        return {
          in: () => ({
            in: () =>
              Promise.resolve({
                data: state.reviewedItemIds.map((item_id) => ({ item_id })),
                error: null,
              }),
          }),
        };
      },
      delete: () => ({
        in: (_col: string, ids: string[]) => {
          calls.deleted.push(...ids);
          return Promise.resolve({ error: null });
        },
      }),
      insert: (rows: Array<Record<string, unknown>>) => {
        calls.inserted.push(...rows);
        return Promise.resolve({ error: state.insertError ?? null });
      },
    }),
  };
  return { client: client as unknown as SupabaseClient, calls };
};

const rawText =
  "Ali: main Friday tak survey bhej dunga\nSara: We picked Vercel";
const items: LedgerItemExtraction[] = [
  {
    kind: "promise",
    statement: "Ali sends the survey",
    quote: "main Friday tak survey bhej dunga",
    quoteLanguage: "mixed",
    speaker: "Ali",
    assignee: "Ali",
    dueDate: null,
    actionItemIndex: null,
  },
  {
    kind: "decision",
    statement: "Hosting is Vercel",
    quote: "We picked Vercel",
    quoteLanguage: "en",
    speaker: "Sara",
    assignee: null,
    dueDate: null,
    actionItemIndex: null,
  },
];

describe("writeLedgerItems (reprocess keep rule, AC-13)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("keeps reviewed items, replaces the rest, and skips a duplicate of a kept quote", async () => {
    const { client, calls } = makeSupabase({
      items: [
        { id: "kept", quote: "main Friday tak survey bhej dunga" },
        { id: "stale", quote: "something old" },
      ],
      reviewedItemIds: ["kept"],
    });

    const n = await writeLedgerItems(client, {
      meetingId: "m1",
      rawText,
      items,
      actionItemIds: [],
    });

    expect(calls.deleted).toEqual(["stale"]);
    expect(calls.inserted.map((r) => r.quote)).toEqual(["We picked Vercel"]);
    expect(n).toBe(1);
  });

  it("never throws when the insert fails", async () => {
    const { client } = makeSupabase({
      items: [],
      reviewedItemIds: [],
      insertError: new Error("db down"),
    });
    await expect(
      writeLedgerItems(client, {
        meetingId: "m1",
        rawText,
        items,
        actionItemIds: [],
      }),
    ).resolves.toBe(0);
    expect(console.error).toHaveBeenCalled();
  });
});
