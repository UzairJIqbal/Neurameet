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

const CALLER = { meeting: MEETING, callerId: "guest-1", isOwner: false };
const vote = (body: Record<string, unknown> = {}) =>
  post(POST, null, {
    callId: "c1",
    agreementId: "a1",
    vote: "agree",
    guestStreamToken: "tok",
    ...body,
  });

describe("POST /api/ledger/live/vote", () => {
  beforeEach(() => {
    reset();
    mockResolve.mockResolvedValue(CALLER);
  });

  it("returns 400 for a bad vote", async () => {
    expect((await vote({ vote: "maybe" })).status).toBe(400);
  });

  it("returns 403 when the caller is not a participant", async () => {
    mockResolve.mockResolvedValue(null);
    expect((await vote()).status).toBe(403);
    expect(mockResolve).toHaveBeenCalledWith(expect.anything(), {
      callId: "c1",
      authUserId: null,
      guestStreamToken: "tok",
    });
  });

  it("returns 404 for an unknown agreement and 409 once closed", async () => {
    queues.ledger_agreements = [{ data: null, error: null }];
    expect((await vote()).status).toBe(404);
    queues.ledger_agreements = [
      { data: { id: "a1", status: "closed" }, error: null },
    ];
    expect((await vote()).status).toBe(409);
  });

  it("stores one vote per voter (id from the token, not the body) and sends the tally", async () => {
    queues.ledger_agreements = [
      { data: { id: "a1", status: "open" }, error: null },
    ];
    queues.ledger_agreement_votes = [
      { data: null, error: null },
      {
        data: [
          { voter_id: "guest-1", vote: "not_yet" },
          { voter_id: "owner", vote: "agree" },
        ],
        error: null,
      },
    ];
    const res = await vote({ vote: "not_yet", voterId: "spoofed" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      agree: 1,
      notYet: 1,
      myVote: "not_yet",
    });
    expect(writes[0]).toMatchObject({
      table: "ledger_agreement_votes",
      op: "upsert",
      payload: expect.objectContaining({
        voter_id: "guest-1",
        vote: "not_yet",
      }),
    });
    expect(mockSend).toHaveBeenCalledWith("c1", "owner", {
      event: "ledger.agreement_tally",
      agreementId: "a1",
      agree: 1,
      notYet: 1,
    });
  });

  it("still answers 200 when the tally event fails (vote already stored)", async () => {
    queues.ledger_agreements = [
      { data: { id: "a1", status: "open" }, error: null },
    ];
    queues.ledger_agreement_votes = [
      { data: null, error: null },
      { data: [{ voter_id: "guest-1", vote: "agree" }], error: null },
    ];
    mockSend.mockResolvedValue(false);
    expect((await vote()).status).toBe(200);
  });
});
