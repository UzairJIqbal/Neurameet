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

import { viewerLeaks } from "@/test/viewer-walk";
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

describe("GET /api/ledger Viewer redaction (spec 0004 AC-62)", () => {
  beforeEach(() => {
    for (const k of Object.keys(queues)) delete queues[k];
  });

  // The route must drop these even from a wider row than it asked for.
  it("returns no quote, speaker, or line on items, links, incoming, or live only", async () => {
    queues.meetings = [
      { data: { id: "m1", user_id: "u0", project_id: "p1", title: "Standup" }, error: null },
      {
        data: [{ id: "m0", title: "Kickoff", started_at: "2026-10-01T12:00:00Z" }],
        error: null,
      },
    ];
    queues.project_members = [{ data: { role: "viewer" }, error: null }];
    queues.ledger_items = [
      { data: [itemRow()], error: null },
      {
        data: [
          itemRow({ id: "old1", meeting_id: "m0" }),
          itemRow({ id: "old2", meeting_id: "m0" }),
        ],
        error: null,
      },
    ];
    queues.ledger_links = [
      { data: [linkRow({ item_id: "i1", evidence_kind: "meeting" })], error: null },
      { data: [linkRow()], error: null },
    ];
    queues.ledger_live_marks = [
      { data: [], error: null },
      {
        data: [{ meeting_id: "m1", item_id: "old2", mark: "kept", marked_at: null }],
        error: null,
      },
    ];
    const res = await call("u1", "meetingId=m1&today=2026-10-30");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.incoming).toHaveLength(1);
    expect(body.liveOnly).toHaveLength(1);
    expect(viewerLeaks(body)).toEqual([]);
    expect(body.items[0].outcome.said.state).toBe("hidden");
  });

  it("hides a meeting link's quote when its evidence is outside the project", async () => {
    queues.meetings = [
      { data: { id: "m1", user_id: "u1", project_id: "p1", title: "Standup" }, error: null },
    ];
    queues.project_members = [{ data: { role: "developer" }, error: null }];
    queues.ledger_items = [{ data: [itemRow()], error: null }];
    queues.ledger_links = [
      {
        data: [
          linkRow({
            item_id: "i1",
            evidence_kind: "meeting",
            evidence_meeting_id: "outside",
            state: "confirmed",
            quote: "secret quote",
          }),
        ],
        error: null,
      },
      { data: [], error: null },
    ];
    queues.ledger_live_marks = [
      { data: [], error: null },
      { data: [], error: null },
    ];
    const res = await call("u1", "meetingId=m1&today=2026-10-30");
    const body = await res.json();
    expect(JSON.stringify(body.items[0].links)).not.toContain("secret");
    expect(body.items[0].links[0]).toMatchObject({
      outsideProject: true,
      evidenceMeetingId: null,
    });
  });
});

describe("GET /api/ledger code links", () => {
  beforeEach(() => {
    for (const k of Object.keys(queues)) delete queues[k];
  });

  const codeLink = linkRow({
    item_id: "i1",
    evidence_kind: "code",
    evidence_meeting_id: null,
    evidence_task_link_id: "tl1",
    line_number: null,
  });

  const queued = (meeting: Record<string, unknown>) => {
    queues.meetings = [{ data: meeting, error: null }];
    queues.ledger_items = [{ data: [itemRow()], error: null }];
    queues.ledger_links = [
      { data: [codeLink], error: null },
      { data: [], error: null },
    ];
    queues.ledger_live_marks = [
      { data: [], error: null },
      { data: [], error: null },
    ];
  };

  it("adds the PR for an owner, with no meeting or line", async () => {
    queued({ id: "m1", user_id: "u1", project_id: null });
    queues.task_links = [
      {
        data: [
          {
            id: "tl1",
            repo_full_name: "acme/app",
            pr_number: 7,
            pr_url: "https://github.com/acme/app/pull/7",
            reverted_at: null,
          },
        ],
        error: null,
      },
    ];
    const res = await call("u1", "meetingId=m1&today=2026-10-30");
    const link = (await res.json()).items[0].links[0];
    expect(link).toMatchObject({
      evidenceKind: "code",
      evidenceMeetingId: null,
      lineNumber: null,
      pr: {
        repoFullName: "acme/app",
        prNumber: 7,
        prUrl: "https://github.com/acme/app/pull/7",
        reverted: false,
      },
    });
  });

  it("gives a Viewer no PR, a null quote, and never reads the links", async () => {
    queued({ id: "m1", user_id: "u0", project_id: "p1" });
    queues.project_members = [{ data: { role: "viewer" }, error: null }];
    queues.task_links = [{ data: null, error: { message: "must not be read" } }];
    const res = await call("u1", "meetingId=m1&today=2026-10-30");
    expect(res.status).toBe(200);
    const link = (await res.json()).items[0].links[0];
    expect(link.pr).toBeUndefined();
    expect(link.quote).toBeNull();
    expect(queues.task_links).toHaveLength(1);
  });
});
