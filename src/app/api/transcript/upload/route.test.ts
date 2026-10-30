import { describe, it, expect, vi, beforeEach } from "vitest";

// Table results keyed by table name; awaiting a query yields the next queued
// result for that table. `inserts` captures every insert payload.
const { queues, inserts, mockAuth, mockSupabase } = vi.hoisted(() => {
  const queues: Record<string, Array<{ data: unknown; error: unknown }>> = {};
  const inserts: Array<{ table: string; payload: Record<string, unknown> }> =
    [];
  const makeBuilder = (table: string) => {
    const next = () =>
      Promise.resolve(queues[table]?.shift() ?? { data: null, error: null });
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "eq", "limit", "upsert"])
      builder[m] = () => builder;
    builder.insert = (payload: Record<string, unknown>) => {
      inserts.push({ table, payload });
      return builder;
    };
    builder.single = next;
    builder.then = (
      res: (v: unknown) => unknown,
      rej: (e: unknown) => unknown,
    ) => next().then(res, rej);
    return builder;
  };
  return {
    queues,
    inserts,
    mockAuth: vi.fn(),
    mockSupabase: vi.fn(() => ({ from: (t: string) => makeBuilder(t) })),
  };
});

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: mockSupabase }));

import { POST } from "./route";

const call = (body: Record<string, unknown>) => {
  mockAuth.mockResolvedValue({ userId: "user-1" });
  return POST(
    new Request("http://localhost/api/transcript/upload", {
      method: "POST",
      body: JSON.stringify({ title: "Sync", rawText: "Ali: hello", ...body }),
    }),
  );
};

describe("POST /api/transcript/upload meetingDate (Promise Ledger AC-5)", () => {
  beforeEach(() => {
    for (const k of Object.keys(queues)) delete queues[k];
    inserts.length = 0;
  });

  it("sets started_at and ended_at to noon UTC on a new meeting", async () => {
    queues.meetings = [{ data: { id: "m-new" }, error: null }];
    const res = await call({ meetingDate: "2026-10-01" });

    expect(res.status).toBe(200);
    const meeting = inserts.find((i) => i.table === "meetings");
    expect(meeting?.payload.started_at).toBe("2026-10-01T12:00:00.000Z");
    expect(meeting?.payload.ended_at).toBe("2026-10-01T12:00:00.000Z");
  });

  it("returns 400 and creates nothing for a bad date", async () => {
    const res = await call({ meetingDate: "2026-02-30" });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Meeting date must be a valid date (YYYY-MM-DD)",
    });
    expect(inserts).toHaveLength(0);
  });

  it("ignores the date when attaching to an existing meeting", async () => {
    queues.meetings = [
      { data: { id: "m-old", user_id: "user-1" }, error: null },
    ];
    const res = await call({ meetingId: "m-old", meetingDate: "not-a-date" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ meetingId: "m-old", canProcess: true });
    expect(inserts.find((i) => i.table === "meetings")).toBeUndefined();
  });
});
