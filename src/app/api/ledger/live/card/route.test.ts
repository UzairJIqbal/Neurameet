import { describe, it, expect, vi, beforeEach } from "vitest";

// Table results keyed by table name; awaiting any query yields the next
// queued result for that table. Writes are recorded per table.
const {
  queues,
  writes,
  mockAuth,
  mockSupabase,
  mockFind,
  mockResolve,
  mockSend,
  mockCount,
  mockEmbed,
} = vi.hoisted(() => {
  const queues: Record<string, Array<{ data: unknown; error: unknown }>> = {};
  const writes: Array<{ table: string; op: string; payload: unknown }> = [];
  const makeBuilder = (table: string) => {
    const next = () =>
      Promise.resolve(queues[table]?.shift() ?? { data: null, error: null });
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order", "is", "neq", "limit"]) {
      builder[m] = () => builder;
    }
    for (const op of ["update", "insert", "upsert", "delete"]) {
      builder[op] = (payload: unknown) => {
        writes.push({ table, op, payload });
        return builder;
      };
    }
    builder.maybeSingle = next;
    builder.single = next;
    builder.then = (
      res: (v: unknown) => unknown,
      rej: (e: unknown) => unknown,
    ) => next().then(res, rej);
    return builder;
  };
  return {
    queues,
    writes,
    mockAuth: vi.fn(),
    mockSupabase: vi.fn(() => ({ from: (t: string) => makeBuilder(t) })),
    mockFind: vi.fn(),
    mockResolve: vi.fn(),
    mockSend: vi.fn(),
    mockCount: vi.fn(),
    mockEmbed: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: mockSupabase }));
vi.mock("@/lib/live-ledger-auth", () => ({
  findLiveMeeting: mockFind,
  resolveLiveCaller: mockResolve,
}));
vi.mock("@/lib/live-ledger-events", () => ({
  sendLiveLedgerEvent: mockSend,
  countCallParticipants: mockCount,
}));
vi.mock("@/agent/embed", () => ({ embedTexts: mockEmbed }));

const MEETING = { id: "live", ownerId: "owner" };

const reset = () => {
  for (const k of Object.keys(queues)) delete queues[k];
  writes.length = 0;
  vi.clearAllMocks();
  mockFind.mockResolvedValue(MEETING);
  mockSend.mockResolvedValue(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
};

const post = (
  POST: (r: Request) => Promise<Response>,
  userId: string | null,
  body: unknown,
) => {
  mockAuth.mockResolvedValue({ userId });
  return POST(
    new Request("http://localhost/api", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
};

import { POST } from "./route";

const item = {
  id: "i1",
  meeting_id: "old",
  statement: "Ali sends the survey",
  quote: "main Friday tak survey bhej dunga",
  assignee: "Ali",
  due_date: "2026-10-20",
};

const queueRaise = (
  latestRaisedAt: string | null,
  mark: string | null = null,
) => {
  queues.ledger_items = [{ data: item, error: null }];
  queues.meetings = [{ data: { id: "old", title: "Kickoff" }, error: null }];
  queues.ledger_live_marks = [
    {
      data: latestRaisedAt ? [{ raised_at: latestRaisedAt }] : [],
      error: null,
    },
    { data: null, error: null },
    { data: { mark }, error: null },
  ];
};

const raise = (userId: string | null = "owner") =>
  post(POST, userId, {
    callId: "c1",
    itemId: "i1",
    action: "raise",
    today: "2026-11-02",
  });

describe("POST /api/ledger/live/card", () => {
  beforeEach(reset);

  it("returns 401 signed out and 400 for a bad body", async () => {
    expect((await raise(null)).status).toBe(401);
    expect(
      (await post(POST, "owner", { callId: "c1", itemId: "i1", action: "fly" }))
        .status,
    ).toBe(400);
    expect(
      (
        await post(POST, "owner", {
          callId: "c1",
          itemId: "i1",
          action: "mark",
          mark: "maybe",
        })
      ).status,
    ).toBe(400);
  });

  it("returns 404 when the caller does not own the meeting", async () => {
    expect((await raise("intruder")).status).toBe(404);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("returns 404 for an item from this same meeting", async () => {
    queues.ledger_items = [
      { data: { ...item, meeting_id: "live" }, error: null },
    ];
    expect((await raise()).status).toBe(404);
  });

  it("raises: closes other cards, stores the row, sends ledger.card", async () => {
    queueRaise(null);
    const res = await raise();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.card).toMatchObject({
      event: "ledger.card",
      itemId: "i1",
      derivedStatus: "overdue",
      sourceTitle: "Kickoff",
    });
    expect(body.mark).toBeNull();
    const ops = writes
      .filter((w) => w.table === "ledger_live_marks")
      .map((w) => w.op);
    expect(ops).toEqual(["update", "upsert"]);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith(
      "c1",
      "owner",
      expect.objectContaining({ event: "ledger.card" }),
    );
  });

  it("re-sends the stored mark when a marked card is raised again", async () => {
    queueRaise(null, "kept");
    const res = await raise();
    expect((await res.json()).mark).toBe("kept");
    expect(mockSend).toHaveBeenLastCalledWith("c1", "owner", {
      event: "ledger.card_mark",
      itemId: "i1",
      mark: "kept",
    });
  });

  it("returns 429 when raising again too fast", async () => {
    queueRaise(new Date().toISOString());
    expect((await raise()).status).toBe(429);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("returns 502 when the event cannot be sent (the row stays)", async () => {
    queueRaise(null);
    mockSend.mockResolvedValue(false);
    const res = await raise();
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe(
      "Could not reach everyone, try again",
    );
    expect(writes.some((w) => w.op === "upsert")).toBe(true);
  });

  it("marks an open card and sends card_mark", async () => {
    queues.ledger_live_marks = [{ data: [{ id: "lm1" }], error: null }];
    const res = await post(POST, "owner", {
      callId: "c1",
      itemId: "i1",
      action: "mark",
      mark: "reversed",
    });
    expect(res.status).toBe(200);
    expect(writes[0]).toMatchObject({
      op: "update",
      payload: expect.objectContaining({ mark: "reversed" }),
    });
    expect(mockSend).toHaveBeenCalledWith("c1", "owner", {
      event: "ledger.card_mark",
      itemId: "i1",
      mark: "reversed",
    });
  });

  it("returns 409 when marking a card that is not up", async () => {
    queues.ledger_live_marks = [{ data: [], error: null }];
    const res = await post(POST, "owner", {
      callId: "c1",
      itemId: "i1",
      action: "mark",
      mark: "kept",
    });
    expect(res.status).toBe(409);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("closes a card and sends card_close", async () => {
    const res = await post(POST, "owner", {
      callId: "c1",
      itemId: "i1",
      action: "close",
    });
    expect(res.status).toBe(200);
    expect(mockSend).toHaveBeenCalledWith("c1", "owner", {
      event: "ledger.card_close",
      itemId: "i1",
    });
  });

  it("returns 500 on a database failure", async () => {
    queues.ledger_items = [{ data: null, error: { message: "boom" } }];
    expect((await raise()).status).toBe(500);
  });
});
