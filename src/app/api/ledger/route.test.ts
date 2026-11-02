import { describe, it, expect, vi, beforeEach } from "vitest";

// Table results keyed by table name; each query step returns the same builder
// and awaiting it yields the next queued result for that table.
const { queues, mockAuth, mockSupabase } = vi.hoisted(() => {
  const queues: Record<string, Array<{ data: unknown; error: unknown }>> = {};
  const makeBuilder = (table: string) => {
    const next = () =>
      Promise.resolve(queues[table]?.shift() ?? { data: null, error: null });
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order", "not", "is"])
      builder[m] = () => builder;
    builder.maybeSingle = next;
    builder.then = (
      res: (v: unknown) => unknown,
      rej: (e: unknown) => unknown,
    ) => next().then(res, rej);
    return builder;
  };
  return {
    queues,
    mockAuth: vi.fn(),
    mockSupabase: vi.fn(() => ({ from: (t: string) => makeBuilder(t) })),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: mockSupabase }));

import { GET } from "./route";

const call = (userId: string | null, qs: string) => {
  mockAuth.mockResolvedValue({ userId });
  return GET(new Request(`http://localhost/api/ledger?${qs}`));
};

const itemRow = (over: Record<string, unknown> = {}) => ({
  id: "i1",
  meeting_id: "m1",
  action_item_id: null,
  kind: "promise",
  statement: "Ali sends the survey",
  quote: "main Friday tak survey bhej dunga",
  quote_language: "mixed",
  speaker: "Ali",
  assignee: "Ali",
  due_date: "2026-10-29",
  line_number: 2,
  status: "open",
  created_at: "2026-10-01T00:00:00Z",
  ...over,
});

const linkRow = (over: Record<string, unknown> = {}) => ({
  id: "l1",
  item_id: "old1",
  evidence_meeting_id: "m1",
  relation: "reversed",
  quote: "we are moving to AWS",
  speaker: "Sara",
  line_number: 4,
  confidence: 0.9,
  state: "suggested",
  decided_at: null,
  created_at: "2026-10-20T00:00:00Z",
  ...over,
});

describe("GET /api/ledger", () => {
  beforeEach(() => {
    for (const k of Object.keys(queues)) delete queues[k];
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns 401 when signed out", async () => {
    const res = await call(null, "meetingId=m1&today=2026-10-30");
    expect(res.status).toBe(401);
  });

  it("returns 400 for a malformed today", async () => {
    expect((await call("u1", "meetingId=m1&today=2026-13-40")).status).toBe(
      400,
    );
    expect((await call("u1", "meetingId=m1")).status).toBe(400);
  });

  it("returns 404 when the caller does not own the meeting", async () => {
    queues.meetings = [{ data: null, error: null }];
    const res = await call("intruder", "meetingId=m1&today=2026-10-30");
    expect(res.status).toBe(404);
  });

  it("derives overdue and counts non rejected reversals", async () => {
    queues.meetings = [
      { data: { id: "m1", user_id: "u1" }, error: null },
      {
        data: [
          { id: "m0", title: "Kickoff", started_at: "2026-10-01T12:00:00Z" },
        ],
        error: null,
      },
    ];
    queues.ledger_items = [
      { data: [itemRow()], error: null },
      {
        data: [itemRow({ id: "old1", meeting_id: "m0", kind: "decision" })],
        error: null,
      },
    ];
    queues.ledger_links = [
      { data: [], error: null },
      {
        data: [linkRow(), linkRow({ id: "l2", state: "rejected" })],
        error: null,
      },
    ];

    const res = await call("u1", "meetingId=m1&today=2026-10-30");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items[0].derivedStatus).toBe("overdue");
    expect(body.items[0].links).toEqual([]);
    expect(body.incoming).toHaveLength(2);
    expect(body.incoming[0].sourceMeeting).toEqual({
      id: "m0",
      title: "Kickoff",
      startedAt: "2026-10-01T12:00:00Z",
    });
    expect(body.reversalCount).toBe(1);
  });

  it("carries live marks, agreement counts and unbacked live marks (spec 0002)", async () => {
    queues.meetings = [
      { data: { id: "m1", user_id: "u1" }, error: null },
      {
        data: [
          { id: "m0", title: "Kickoff", started_at: "2026-10-01T12:00:00Z" },
        ],
        error: null,
      },
    ];
    queues.ledger_items = [
      {
        data: [
          itemRow({
            source: "live_agreement",
            agreed_count: 3,
            total_count: 4,
            line_number: 0,
          }),
        ],
        error: null,
      },
      {
        data: [
          itemRow({ id: "old1", meeting_id: "m0" }),
          itemRow({ id: "old2", meeting_id: "m0" }),
        ],
        error: null,
      },
    ];
    queues.ledger_links = [
      { data: [], error: null },
      { data: [linkRow()], error: null },
    ];
    queues.ledger_live_marks = [
      {
        data: [
          {
            meeting_id: "m5",
            item_id: "i1",
            mark: "open",
            marked_at: "2026-10-05T00:00:00Z",
          },
          {
            meeting_id: "m6",
            item_id: "i1",
            mark: "kept",
            marked_at: "2026-10-06T00:00:00Z",
          },
        ],
        error: null,
      },
      {
        data: [
          {
            meeting_id: "m1",
            item_id: "old1",
            mark: "reversed",
            marked_at: null,
          },
          { meeting_id: "m1", item_id: "old2", mark: "kept", marked_at: null },
        ],
        error: null,
      },
    ];

    const res = await call("u1", "meetingId=m1&today=2026-10-30");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items[0]).toMatchObject({
      source: "live_agreement",
      agreedCount: 3,
      totalCount: 4,
      liveMark: "kept",
    });
    expect(body.incoming[0].liveMark).toBe("reversed");
    expect(body.liveOnly).toHaveLength(1);
    expect(body.liveOnly[0]).toMatchObject({
      mark: "kept",
      item: { id: "old2" },
      sourceMeeting: { id: "m0" },
    });
  });

  it("returns 404 to a non member on a project meeting (spec 0004)", async () => {
    queues.meetings = [
      { data: { id: "m1", user_id: "u1", project_id: "p1" }, error: null },
    ];
    queues.project_members = [{ data: null, error: null }];
    const res = await call("outsider", "meetingId=m1&today=2026-10-30");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Meeting not found" });
  });

  it("lets a Viewer read a project meeting's ledger (spec 0004, read)", async () => {
    queues.meetings = [
      { data: { id: "m1", user_id: "u1", project_id: "p1" }, error: null },
    ];
    queues.project_members = [{ data: { role: "viewer" }, error: null }];
    queues.ledger_items = [{ data: [], error: null }];
    queues.ledger_links = [{ data: [], error: null }];
    queues.ledger_live_marks = [{ data: [], error: null }];
    const res = await call("viewer", "meetingId=m1&today=2026-10-30");
    expect(res.status).toBe(200);
  });

  it("returns 500 on a database failure", async () => {
    queues.meetings = [{ data: { id: "m1", user_id: "u1" }, error: null }];
    queues.ledger_items = [{ data: null, error: { message: "boom" } }];
    const res = await call("u1", "meetingId=m1&today=2026-10-30");
    expect(res.status).toBe(500);
  });
});
