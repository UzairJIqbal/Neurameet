import { describe, it, expect, vi, beforeEach } from "vitest";

// Table results keyed by table name; awaiting a query yields the next queued
// result for that table. `updates` captures every update payload.
const { queues, updates, mockAuth, mockRpc, mockSupabase } = vi.hoisted(() => {
  const queues: Record<string, Array<{ data: unknown; error: unknown }>> = {};
  const updates: Array<{ table: string; payload: unknown }> = [];
  const makeBuilder = (table: string) => {
    const next = () =>
      Promise.resolve(queues[table]?.shift() ?? { data: null, error: null });
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "eq"]) builder[m] = () => builder;
    builder.update = (payload: unknown) => {
      updates.push({ table, payload });
      return builder;
    };
    builder.maybeSingle = next;
    builder.then = (
      res: (v: unknown) => unknown,
      rej: (e: unknown) => unknown,
    ) => next().then(res, rej);
    return builder;
  };
  const mockRpc = vi.fn();
  return {
    queues,
    updates,
    mockAuth: vi.fn(),
    mockRpc,
    mockSupabase: vi.fn(() => ({
      from: (t: string) => makeBuilder(t),
      rpc: mockRpc,
    })),
  };
});

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: mockSupabase }));

import { POST } from "./route";

const LINK_ID = "11111111-2222-4333-8444-555555555555";
const ITEM_ID = "item-1";

const call = (userId: string | null, body: unknown, id = LINK_ID) => {
  mockAuth.mockResolvedValue({ userId });
  return POST(
    new Request(`http://localhost/api/ledger/links/${id}/review`, {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
};

const owned = () => {
  queues.ledger_links = [
    { data: { id: LINK_ID, item_id: ITEM_ID }, error: null },
    { data: null, error: null }, // the update
  ];
  queues.ledger_items = [{ data: { meeting_id: "m1" }, error: null }];
  queues.meetings = [{ data: { id: "m1" }, error: null }];
};

describe("POST /api/ledger/links/[id]/review", () => {
  beforeEach(() => {
    for (const k of Object.keys(queues)) delete queues[k];
    updates.length = 0;
    mockRpc.mockReset();
    mockRpc.mockResolvedValue({ data: null, error: null });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns 401 when signed out", async () => {
    expect((await call(null, { decision: "confirm" })).status).toBe(401);
  });

  it("returns 400 for a body that is not JSON", async () => {
    expect((await call("u1", "not json")).status).toBe(400);
  });

  it("returns 400 for an unknown decision", async () => {
    expect((await call("u1", { decision: "approve" })).status).toBe(400);
  });

  it("returns 404 for an id that is not a UUID, before any query", async () => {
    const res = await call("u1", { decision: "confirm" }, "abc");
    expect(res.status).toBe(404);
    expect(mockSupabase).not.toHaveBeenCalled();
  });

  it("returns 404 when the link does not exist", async () => {
    queues.ledger_links = [{ data: null, error: null }];
    expect((await call("u1", { decision: "confirm" })).status).toBe(404);
  });

  it("returns 404 for another user's meeting, with the same message", async () => {
    queues.ledger_links = [
      { data: { id: LINK_ID, item_id: ITEM_ID }, error: null },
    ];
    queues.ledger_items = [{ data: { meeting_id: "m1" }, error: null }];
    queues.meetings = [{ data: null, error: null }];
    const res = await call("intruder", { decision: "confirm" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Link not found" });
    expect(updates).toHaveLength(0);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it.each([
    ["confirm", "confirmed", true],
    ["reject", "rejected", true],
    ["reset", "suggested", false],
  ] as const)(
    "%s saves state %s and recomputes the item status",
    async (decision, state, hasDecidedAt) => {
      owned();
      const res = await call("u1", { decision });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ id: LINK_ID, state });

      expect(updates).toHaveLength(1);
      const payload = updates[0].payload as {
        state: string;
        decided_at: string | null;
      };
      expect(updates[0].table).toBe("ledger_links");
      expect(payload.state).toBe(state);
      if (hasDecidedAt) {
        expect(Number.isNaN(Date.parse(payload.decided_at ?? ""))).toBe(false);
      } else {
        expect(payload.decided_at).toBeNull();
      }

      expect(mockRpc).toHaveBeenCalledWith("ledger_recompute_item_status", {
        p_item_id: ITEM_ID,
      });
    },
  );

  it("returns 500 when the recompute fails", async () => {
    owned();
    mockRpc.mockResolvedValue({ data: null, error: new Error("boom") });
    expect((await call("u1", { decision: "confirm" })).status).toBe(500);
  });
});
