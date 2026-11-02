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
import { GET } from "./route";

const get = (query: string, userId: string | null = "owner") => {
  mockAuth.mockResolvedValue({ userId });
  return GET(new Request(`http://localhost/api/ledger/live?${query}`));
};

describe("GET /api/ledger/live", () => {
  beforeEach(() => {
    reset();
    mockResolve.mockResolvedValue({
      meeting: MEETING,
      callerId: "u2",
      isOwner: false,
    });
  });

  it("returns 400 without callId or a valid today", async () => {
    expect((await get("today=2026-11-02")).status).toBe(400);
    expect((await get("callId=c1")).status).toBe(400);
    expect((await get("callId=c1&today=2 Nov")).status).toBe(400);
  });

  it("returns 403 for someone outside the call", async () => {
    mockResolve.mockResolvedValue(null);
    expect((await get("callId=c1&today=2026-11-02", null)).status).toBe(403);
  });

  it("passes the guest token through to the caller check", async () => {
    queues.ledger_live_marks = [{ data: [], error: null }];
    await get("callId=c1&today=2026-11-02&guestStreamToken=tok", null);
    expect(mockResolve).toHaveBeenCalledWith(expect.anything(), {
      callId: "c1",
      authUserId: null,
      guestStreamToken: "tok",
    });
  });

  it("returns nothing open when there is no card or agreement", async () => {
    queues.ledger_live_marks = [{ data: [], error: null }];
    const res = await get("callId=c1&today=2026-11-02");
    expect(await res.json()).toEqual({
      isOwner: false,
      card: null,
      agreement: null,
    });
  });

  it("catches up a late joiner on the open card and agreement, with their own vote", async () => {
    queues.ledger_live_marks = [
      { data: [{ item_id: "i1", mark: "kept" }], error: null },
    ];
    queues.ledger_items = [
      {
        data: {
          id: "i1",
          meeting_id: "old",
          statement: "Ali sends the survey",
          quote: "survey bhej dunga",
          assignee: "Ali",
          due_date: "2026-12-01",
        },
        error: null,
      },
    ];
    queues.meetings = [{ data: { title: "Kickoff" }, error: null }];
    queues.ledger_agreements = [
      { data: { id: "a1", statement: "We ship Friday" }, error: null },
    ];
    queues.ledger_agreement_votes = [
      {
        data: [
          { voter_id: "u2", vote: "agree" },
          { voter_id: "u3", vote: "not_yet" },
        ],
        error: null,
      },
    ];
    const body = await (await get("callId=c1&today=2026-11-02")).json();
    expect(body.card).toMatchObject({
      mark: "kept",
      card: { itemId: "i1", derivedStatus: "open", sourceTitle: "Kickoff" },
    });
    expect(body.agreement).toEqual({
      agreementId: "a1",
      statement: "We ship Friday",
      agree: 1,
      notYet: 1,
      myVote: "agree",
      result: null,
    });
  });

  it("returns 500 when the read fails", async () => {
    queues.ledger_live_marks = [{ data: null, error: { message: "boom" } }];
    expect((await get("callId=c1&today=2026-11-02")).status).toBe(500);
  });
});
