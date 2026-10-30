import { describe, it, expect, vi, beforeEach } from "vitest";

// Table results keyed by table name; awaiting a query yields the next queued
// result for that table.
const { queues, mockAuth, mockSupabase, mockRunMatch, JudgeError } = vi.hoisted(
  () => {
    const queues: Record<string, Array<{ data: unknown; error: unknown }>> = {};
    const makeBuilder = (table: string) => {
      const next = () =>
        Promise.resolve(queues[table]?.shift() ?? { data: null, error: null });
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "eq", "limit"]) builder[m] = () => builder;
      builder.maybeSingle = next;
      builder.then = (
        res: (v: unknown) => unknown,
        rej: (e: unknown) => unknown,
      ) => next().then(res, rej);
      return builder;
    };
    class JudgeError extends Error {}
    return {
      queues,
      mockAuth: vi.fn(),
      mockSupabase: vi.fn(() => ({ from: (t: string) => makeBuilder(t) })),
      mockRunMatch: vi.fn(),
      JudgeError,
    };
  },
);

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: mockSupabase }));
vi.mock("@/agent/ledger-match", () => ({
  runLedgerMatch: mockRunMatch,
  LedgerJudgeError: JudgeError,
}));

import { POST } from "./route";

const call = (userId: string | null, body: unknown) => {
  mockAuth.mockResolvedValue({ userId });
  return POST(
    new Request("http://localhost/api/ledger/match", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
};

const owned = () => {
  queues.meetings = [{ data: { id: "m1" }, error: null }];
};

describe("POST /api/ledger/match", () => {
  beforeEach(() => {
    for (const k of Object.keys(queues)) delete queues[k];
    mockRunMatch.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns 401 when signed out", async () => {
    expect((await call(null, { meetingId: "m1" })).status).toBe(401);
  });

  it("returns 400 without a meetingId", async () => {
    expect((await call("u1", {})).status).toBe(400);
  });

  it("returns 404 when the caller does not own the meeting", async () => {
    queues.meetings = [{ data: null, error: null }];
    expect((await call("intruder", { meetingId: "m1" })).status).toBe(404);
    expect(mockRunMatch).not.toHaveBeenCalled();
  });

  it("returns 409 when there is no transcript", async () => {
    owned();
    queues.transcripts = [{ data: null, error: null }];
    expect((await call("u1", { meetingId: "m1" })).status).toBe(409);
  });

  it("returns 409 when the meeting has no chunks", async () => {
    owned();
    queues.transcripts = [{ data: { raw_text: "Ali: hi" }, error: null }];
    queues.meeting_chunks = [{ data: [], error: null }];
    expect((await call("u1", { meetingId: "m1" })).status).toBe(409);
    expect(mockRunMatch).not.toHaveBeenCalled();
  });

  it("returns 502 when the judge fails", async () => {
    owned();
    queues.transcripts = [{ data: { raw_text: "Ali: hi" }, error: null }];
    queues.meeting_chunks = [{ data: [{ id: "c" }], error: null }];
    mockRunMatch.mockRejectedValue(new JudgeError("down"));
    expect((await call("u1", { meetingId: "m1" })).status).toBe(502);
  });

  it("returns 500 on a database failure", async () => {
    queues.meetings = [{ data: null, error: { message: "db down" } }];
    expect((await call("u1", { meetingId: "m1" })).status).toBe(500);
  });

  it("returns the matched count", async () => {
    owned();
    queues.transcripts = [{ data: { raw_text: "Ali: hi" }, error: null }];
    queues.meeting_chunks = [{ data: [{ id: "c" }], error: null }];
    mockRunMatch.mockResolvedValue({ matched: 2 });
    const res = await call("u1", { meetingId: "m1" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ matched: 2 });
    expect(mockRunMatch).toHaveBeenCalledWith(expect.anything(), {
      meetingId: "m1",
      userId: "u1",
      rawText: "Ali: hi",
    });
  });
});
