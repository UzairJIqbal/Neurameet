import { describe, it, expect, vi, beforeEach } from "vitest";

// Table results keyed by table name; each query step returns the same builder
// and awaiting it yields the next queued result for that table.
const { queues, mockAuth, mockSupabase } = vi.hoisted(() => {
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
  return {
    queues,
    mockAuth: vi.fn(),
    mockSupabase: vi.fn(() => ({ from: (t: string) => makeBuilder(t) })),
  };
});

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: mockSupabase }));

import { GET } from "./route";

const call = (userId: string | null, qs = "meetingId=m1") => {
  mockAuth.mockResolvedValue({ userId });
  return GET(new Request(`http://localhost/api/minutes?${qs}`));
};

const draft = {
  version: 1,
  lines: [
    {
      section: "decision",
      text: "Use Vercel",
      evidence: [
        { quote: "We go with Vercel", lineNumber: 1, speaker: "Sara" },
      ],
      supported: true,
      speakerLabels: ["Sara"],
      actionItemId: null,
      assignee: null,
    },
  ],
  dissentSuggestions: [],
  coverage: { lastLine: 2, totalLines: 2 },
};

const owned = { data: { id: "m1", user_id: "u1" }, error: null };

describe("GET /api/minutes", () => {
  beforeEach(() => {
    for (const k of Object.keys(queues)) delete queues[k];
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns 401 when signed out", async () => {
    expect((await call(null)).status).toBe(401);
  });

  it("returns 400 without a meetingId", async () => {
    expect((await call("u1", "")).status).toBe(400);
  });

  it("returns 404 when the meeting is missing", async () => {
    queues.meetings = [{ data: null, error: null }];
    expect((await call("u1")).status).toBe(404);
  });

  it("returns the same 404 to a stranger", async () => {
    queues.meetings = [owned];
    queues.attendance_events = [{ data: [], error: null }];
    const res = await call("intruder");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Meeting not found" });
  });

  it("tells a participant the minutes are not open yet", async () => {
    queues.meetings = [owned];
    queues.attendance_events = [{ data: [{ user_id: "p1" }], error: null }];
    const res = await call("p1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: "not_open" });
  });

  it("returns the owner's draft with the transcript source", async () => {
    queues.meetings = [owned];
    queues.meeting_insights = [{ data: { minutes_draft: draft }, error: null }];
    queues.transcripts = [{ data: { source: "recording" }, error: null }];
    const res = await call("u1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      state: "draft",
      draft,
      transcriptSource: "recording",
    });
  });

  it("returns no_draft for a null or old draft", async () => {
    queues.meetings = [owned, owned];
    queues.meeting_insights = [
      { data: { minutes_draft: null }, error: null },
      { data: { minutes_draft: { lines: [] } }, error: null },
    ];
    expect(await (await call("u1")).json()).toEqual({ state: "no_draft" });
    expect(await (await call("u1")).json()).toEqual({ state: "no_draft" });
  });

  it("returns 500 when a read fails", async () => {
    queues.meetings = [{ data: null, error: new Error("db down") }];
    expect((await call("u1")).status).toBe(500);
  });
});
