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
vi.mock("@/lib/live-ledger-auth", async (importOriginal) => ({
  // The real manager gate (liveManagerDenial) runs against the mocked meeting.
  ...(await importOriginal<typeof import("@/lib/live-ledger-auth")>()),
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

const open = (statement: unknown, userId: string | null = "owner") =>
  post(POST, userId, { callId: "c1", action: "open", statement });
const close = () =>
  post(POST, "owner", { callId: "c1", action: "close", agreementId: "a1" });

const queueClose = (votes: Array<{ voter_id: string; vote: string }>) => {
  queues.ledger_agreements = [
    {
      data: {
        id: "a1",
        statement: "Hum Friday ko launch karenge",
        status: "open",
      },
      error: null,
    },
    { data: [{ id: "a1" }], error: null },
    { data: null, error: null },
  ];
  queues.ledger_agreement_votes = [{ data: votes, error: null }];
  queues.ledger_items = [{ data: { id: "item-new" }, error: null }];
};

describe("POST /api/ledger/live/agreement", () => {
  beforeEach(() => {
    reset();
    mockEmbed.mockResolvedValue([[0.1, 0.2]]);
  });

  it("returns 401, 400 for an empty or too long statement, and 404 for a non owner", async () => {
    expect((await open("We ship", null)).status).toBe(401);
    expect((await open("   ")).status).toBe(400);
    expect((await open("x".repeat(281))).status).toBe(400);
    expect((await open("We ship", "intruder")).status).toBe(404);
  });

  it("opens with a trimmed statement and sends agreement_open", async () => {
    queues.ledger_agreements = [{ data: { id: "a1" }, error: null }];
    const res = await open("  We ship Friday  ");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      agreementId: "a1",
      statement: "We ship Friday",
    });
    expect(mockSend).toHaveBeenCalledWith("c1", "owner", {
      event: "ledger.agreement_open",
      agreementId: "a1",
      statement: "We ship Friday",
    });
  });

  it("returns 409 when another agreement is already open", async () => {
    queues.ledger_agreements = [{ data: null, error: { code: "23505" } }];
    expect((await open("We ship")).status).toBe(409);
  });

  it("returns 502 with the agreementId when the open event fails", async () => {
    queues.ledger_agreements = [{ data: { id: "a1" }, error: null }];
    mockSend.mockResolvedValue(false);
    const res = await open("We ship");
    expect(res.status).toBe(502);
    expect((await res.json()).agreementId).toBe("a1");
  });

  it("closes: counts N of M and saves a live agreement decision item", async () => {
    queueClose([
      { voter_id: "owner", vote: "agree" },
      { voter_id: "u2", vote: "agree" },
      { voter_id: "u3", vote: "not_yet" },
    ]);
    mockCount.mockResolvedValue(4);
    const res = await close();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      agreed: 2,
      total: 4,
      itemId: "item-new",
    });
    const item = writes.find((w) => w.table === "ledger_items");
    expect(item?.payload).toMatchObject({
      kind: "decision",
      source: "live_agreement",
      quote: "Hum Friday ko launch karenge",
      quote_language: "en",
      line_number: 0,
      agreed_count: 2,
      total_count: 4,
      embedding: [0.1, 0.2],
    });
    expect(mockSend).toHaveBeenCalledWith("c1", "owner", {
      event: "ledger.agreement_close",
      agreementId: "a1",
      agreed: 2,
      total: 4,
    });
  });

  it("falls back to the voter count when the participant count fails", async () => {
    queueClose([
      { voter_id: "owner", vote: "agree" },
      { voter_id: "g1", vote: "agree" },
    ]);
    mockCount.mockResolvedValue(null);
    expect(await (await close()).json()).toMatchObject({ agreed: 2, total: 2 });
  });

  it("still saves the item without an embedding when embedding fails", async () => {
    queueClose([{ voter_id: "owner", vote: "agree" }]);
    mockCount.mockResolvedValue(1);
    mockEmbed.mockRejectedValue(new Error("quota"));
    expect((await close()).status).toBe(200);
    const item = writes.find((w) => w.table === "ledger_items");
    expect(item?.payload).toMatchObject({ embedding: null });
  });

  it("returns 404 for an unknown agreement and 409 for a closed one", async () => {
    queues.ledger_agreements = [{ data: null, error: null }];
    expect((await close()).status).toBe(404);
    queues.ledger_agreements = [
      { data: { id: "a1", statement: "x", status: "closed" }, error: null },
    ];
    expect((await close()).status).toBe(409);
  });

  it("returns 409 and writes no item when a second close loses the race", async () => {
    queues.ledger_agreements = [
      { data: { id: "a1", statement: "x", status: "open" }, error: null },
      { data: [], error: null },
    ];
    queues.ledger_agreement_votes = [{ data: [], error: null }];
    mockCount.mockResolvedValue(2);
    expect((await close()).status).toBe(409);
    expect(writes.some((w) => w.table === "ledger_items")).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  describe("project call (manage need)", () => {
    const PROJECT_MEETING = { id: "live", ownerId: "creator", projectId: "p1" };
    beforeEach(() => mockFind.mockResolvedValue(PROJECT_MEETING));
    const openAs = (userId: string) => open("We ship Friday", userId);

    it("returns 404 to a non member", async () => {
      queues.project_members = [{ data: null, error: null }];
      const res = await openAs("stranger");
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Meeting not found" });
      expect(writes).toEqual([]);
    });

    it("returns 403 to a Viewer and to a Developer", async () => {
      queues.project_members = [
        { data: { role: "viewer" }, error: null },
        { data: { role: "developer" }, error: null },
      ];
      const viewer = await openAs("v1");
      expect(viewer.status).toBe(403);
      expect(await viewer.json()).toEqual({ error: "Not authorized" });
      expect((await openAs("d1")).status).toBe(403);
      expect(writes).toEqual([]);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("returns 403 to the creator once demoted to Developer", async () => {
      queues.project_members = [{ data: { role: "developer" }, error: null }];
      expect((await openAs("creator")).status).toBe(403);
    });

    it("lets an Admin open an agreement", async () => {
      queues.project_members = [{ data: { role: "admin" }, error: null }];
      queues.ledger_agreements = [{ data: { id: "a1" }, error: null }];
      expect((await open("We ship Friday", "a1")).status).toBe(200);
    });
  });
});
