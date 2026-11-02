import { describe, it, expect, vi, beforeEach } from "vitest";

// Table results keyed by table name; each query step returns the same builder
// and awaiting it yields the next queued result for that table.
const { queues, inCalls, eqCalls, mockAuth, mockSupabase } = vi.hoisted(() => {
  const queues: Record<string, Array<{ data: unknown; error: unknown }>> = {};
  const inCalls: Array<{ table: string; ids: unknown }> = [];
  const eqCalls: Array<{ table: string; col: string; value: unknown }> = [];
  const makeBuilder = (table: string) => {
    const next = () =>
      Promise.resolve(queues[table]?.shift() ?? { data: null, error: null });
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "order", "is"]) builder[m] = () => builder;
    builder.eq = (col: string, value: unknown) => {
      eqCalls.push({ table, col, value });
      return builder;
    };
    builder.in = (_col: string, ids: unknown) => {
      inCalls.push({ table, ids });
      return builder;
    };
    builder.maybeSingle = next;
    builder.then = (
      res: (v: unknown) => unknown,
      rej: (e: unknown) => unknown,
    ) => next().then(res, rej);
    return builder;
  };
  return {
    queues,
    inCalls,
    eqCalls,
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
  return GET(new Request(`http://localhost/api/ledger/live/checkin?${qs}`));
};

describe("GET /api/ledger/live/checkin", () => {
  beforeEach(() => {
    for (const k of Object.keys(queues)) delete queues[k];
    inCalls.length = 0;
    eqCalls.length = 0;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns 401 when signed out", async () => {
    expect((await call(null, "callId=c1&today=2026-11-02")).status).toBe(401);
  });

  it("returns 400 for a missing callId or a bad today", async () => {
    expect((await call("u1", "today=2026-11-02")).status).toBe(400);
    expect((await call("u1", "callId=c1&today=2026-02-30")).status).toBe(400);
    expect((await call("u1", "callId=c1")).status).toBe(400);
  });

  it("returns 404 when the caller does not own the call's meeting", async () => {
    queues.meetings = [{ data: null, error: null }];
    expect((await call("intruder", "callId=c1&today=2026-11-02")).status).toBe(
      404,
    );
  });

  it("returns ranked open items from the owner's other meetings only", async () => {
    queues.meetings = [
      { data: { id: "live", user_id: "u1" }, error: null },
      {
        data: [
          { id: "live", title: "Today", started_at: "2026-11-02" },
          { id: "old", title: "Kickoff", started_at: "2026-10-01" },
        ],
        error: null,
      },
    ];
    queues.ledger_items = [
      {
        data: [
          {
            id: "i2",
            meeting_id: "old",
            statement: "Sara ships the doc",
            quote: "I will ship the doc",
            assignee: "Sara",
            due_date: null,
            created_at: "2026-10-01T00:00:00Z",
          },
          {
            id: "i1",
            meeting_id: "old",
            statement: "Ali sends the survey",
            quote: "main Friday tak survey bhej dunga",
            assignee: "Ali",
            due_date: "2026-10-20",
            created_at: "2026-10-01T00:00:00Z",
          },
        ],
        error: null,
      },
    ];
    const res = await call("u1", "callId=c1&today=2026-11-02");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{
        id: string;
        derivedStatus: string;
        sourceMeeting: { title: string };
      }>;
    };
    expect(body.items.map((i) => i.id)).toEqual(["i1", "i2"]);
    expect(body.items[0].derivedStatus).toBe("overdue");
    expect(body.items[0].sourceMeeting.title).toBe("Kickoff");
    // The live meeting's own items are never asked for.
    expect(inCalls).toEqual([{ table: "ledger_items", ids: ["old"] }]);
  });

  it("returns an empty list without querying items when there is no other meeting", async () => {
    queues.meetings = [
      { data: { id: "live", user_id: "u1" }, error: null },
      { data: [{ id: "live", title: "Today", started_at: null }], error: null },
    ];
    const res = await call("u1", "callId=c1&today=2026-11-02");
    expect(await res.json()).toEqual({ items: [] });
    expect(inCalls).toEqual([]);
  });

  it("returns 500 when the database fails", async () => {
    queues.meetings = [{ data: null, error: new Error("down") }];
    expect((await call("u1", "callId=c1&today=2026-11-02")).status).toBe(500);
  });

  it("returns 404 on a personal call owned by someone else", async () => {
    queues.meetings = [{ data: { id: "live", user_id: "owner" }, error: null }];
    const res = await call("intruder", "callId=c1&today=2026-11-02");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Meeting not found" });
  });

  describe("project call (manage need)", () => {
    const projectLive = {
      data: { id: "live", user_id: "creator", project_id: "p1" },
      error: null,
    };

    it("returns 404 to a non member", async () => {
      queues.meetings = [projectLive];
      queues.project_members = [{ data: null, error: null }];
      const res = await call("stranger", "callId=c1&today=2026-11-02");
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Meeting not found" });
    });

    it("returns 403 to a Viewer and to a Developer", async () => {
      queues.meetings = [projectLive, projectLive];
      queues.project_members = [
        { data: { role: "viewer" }, error: null },
        { data: { role: "developer" }, error: null },
      ];
      const viewer = await call("v1", "callId=c1&today=2026-11-02");
      expect(viewer.status).toBe(403);
      expect(await viewer.json()).toEqual({ error: "Not authorized" });
      expect((await call("d1", "callId=c1&today=2026-11-02")).status).toBe(403);
      expect(inCalls).toEqual([]);
    });

    it("lists open items from the project's other meetings for an Admin", async () => {
      queues.meetings = [
        projectLive,
        {
          data: [
            { id: "live", title: "Today", started_at: "2026-11-02" },
            { id: "other", title: "Planning", started_at: "2026-10-01" },
          ],
          error: null,
        },
      ];
      queues.project_members = [{ data: { role: "admin" }, error: null }];
      queues.ledger_items = [
        {
          data: [
            {
              id: "i1",
              meeting_id: "other",
              statement: "Ali sends the survey",
              quote: "survey bhej dunga",
              assignee: "Ali",
              due_date: null,
              created_at: "2026-10-01T00:00:00Z",
            },
          ],
          error: null,
        },
      ];
      const res = await call("a1", "callId=c1&today=2026-11-02");
      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: Array<{ id: string }> };
      expect(body.items.map((i) => i.id)).toEqual(["i1"]);
      // The candidate meetings are the project's, not the caller's own.
      const meetingFilters = eqCalls.filter((c) => c.table === "meetings");
      expect(meetingFilters).toContainEqual({
        table: "meetings",
        col: "project_id",
        value: "p1",
      });
      expect(meetingFilters.some((c) => c.col === "user_id")).toBe(false);
      expect(inCalls).toEqual([{ table: "ledger_items", ids: ["other"] }]);
    });
  });
});
