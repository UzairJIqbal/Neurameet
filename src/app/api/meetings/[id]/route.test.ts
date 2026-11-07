import { describe, it, expect, vi, beforeEach } from "vitest";

// Shared, mutable DB-result store + mocks (hoisted above the vi.mock factories).
const { store, mockAuth, mockSupabase } = vi.hoisted(() => {
  const store = {
    meetings: { data: null as unknown, error: null as unknown },
    attendanceRows: [] as Array<Record<string, unknown>>,
    insights: { data: null as unknown, error: null as unknown },
    actionItems: { data: null as unknown, error: null as unknown },
    // Phase W: active project memberships (removed_at null).
    members: [] as Array<Record<string, unknown>>,
    transcript: { data: null as unknown, error: null as unknown },
    tables: [] as string[],
  };
  const makeClient = () => ({
    from: (table: string) => {
      store.tables.push(table);
      const result =
        table === "transcripts"
          ? store.transcript
          : table === "meetings"
            ? store.meetings
            : table === "meeting_insights"
              ? store.insights
              : table === "action_items"
                ? store.actionItems
                : { data: null, error: null };
      // attendance_events applies the eq filters, so a row for another
      // meeting or another user never counts as proof of participation.
      const filters: Array<[string, unknown]> = [];
      const attendance = () => ({
        data: store.attendanceRows.filter((r) =>
          filters.every(([col, val]) => r[col] === val),
        ),
        error: null,
      });
      const member = () => ({
        data:
          store.members.find((r) =>
            filters.every(([col, val]) => (r[col] ?? null) === val),
          ) ?? null,
        error: null,
      });
      const builder = {
        eq: (col: string, val: unknown) => {
          filters.push([col, val]);
          return builder;
        },
        is: (col: string, val: unknown) => {
          filters.push([col, val]);
          return builder;
        },
        single: () => Promise.resolve(result),
        maybeSingle: () =>
          Promise.resolve(table === "project_members" ? member() : result),
        limit: () =>
          Promise.resolve(
            table === "attendance_events" ? attendance() : result,
          ),
        // Awaiting the chain directly (action items list) yields the result,
        // with the W4 review_state filter applied when the route adds one.
        then: (resolve: (v: unknown) => unknown) => {
          const state = filters.find(([col]) => col === "review_state");
          if (table !== "action_items" || !state) return resolve(result);
          const rows = (result.data ?? []) as Array<Record<string, unknown>>;
          return resolve({
            data: rows.filter((r) => r.review_state === state[1]),
            error: null,
          });
        },
      };
      return { select: () => builder };
    },
  });
  return {
    store,
    mockAuth: vi.fn(),
    mockSupabase: vi.fn(() => makeClient()),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  clerkClient: async () => ({
    users: {
      getUserList: async () => ({
        data: [
          {
            id: "owner",
            firstName: "Ali",
            lastName: "Hassan",
            imageUrl: "",
            primaryEmailAddress: { emailAddress: "ali@example.com" },
          },
        ],
      }),
    },
  }),
}));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: mockSupabase }));

import { GET } from "./route";

const meetingRow = (user_id: string, project_id: string | null = null) => ({
  id: "m1",
  user_id,
  project_id,
  title: "Test Meeting",
  status: "ended",
  stream_call_id: "call_1",
  started_at: null,
  ended_at: null,
  created_at: null,
});

const call = (userId: string | null, id: string) => {
  mockAuth.mockResolvedValue({ userId });
  return GET(new Request(`http://localhost/api/meetings/${id}`), {
    params: Promise.resolve({ id }),
  });
};

describe("GET /api/meetings/[id] authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.meetings = { data: null, error: null };
    store.attendanceRows = [];
    store.insights = {
      data: {
        summary: "s",
        key_points: [],
        decisions: [],
        category: "c",
        detected_topics: [],
      },
      error: null,
    };
    store.actionItems = { data: [], error: null };
    store.members = [];
  });

  it("rejects when not authenticated", async () => {
    const res = await call(null, "m1");
    expect(res.status).toBe(401);
  });

  it("returns the meeting for the owner", async () => {
    store.meetings = { data: meetingRow("u1"), error: null };

    const res = await call("u1", "m1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { meeting: { id: string } };
    expect(body.meeting.id).toBe("m1");
  });

  it("returns the meeting for a recorded participant (the prior 404 bug)", async () => {
    // Meeting belongs to "owner", but the caller attended under a different
    // Clerk account. Before the fix the strict owner-only .single() threw
    // PGRST116 (0 rows) and returned "Meeting not found" (404).
    store.meetings = { data: meetingRow("owner"), error: null };
    store.attendanceRows = [{ meeting_id: "m1", user_id: "participant" }];

    const res = await call("participant", "m1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { meeting: { id: string } };
    expect(body.meeting.id).toBe("m1");
  });

  it("still rejects a caller who is neither owner nor participant", async () => {
    store.meetings = { data: meetingRow("owner"), error: null };
    // Someone else attended this meeting, and the stranger attended another
    // one: neither row may authorize the stranger here.
    store.attendanceRows = [
      { meeting_id: "m1", user_id: "participant" },
      { meeting_id: "m2", user_id: "stranger" },
    ];

    const res = await call("stranger", "m1");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Meeting not found");
  });

  it("returns 404 when the meeting does not exist (PGRST116)", async () => {
    store.meetings = { data: null, error: { code: "PGRST116" } };

    const res = await call("u1", "nope");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/meetings/[id] on a project meeting", () => {
  const items = [
    { id: "a1", title: "Ship it", assignee: null, due_date: null },
  ];
  const asMember = (role: string) => {
    store.members = [
      { project_id: "p1", user_id: "u2", role, removed_at: null },
    ];
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    store.meetings = { data: meetingRow("owner", "p1"), error: null };
    store.attendanceRows = [];
    store.insights = { data: null, error: null };
    store.actionItems = { data: items, error: null };
    store.members = [];
  });

  it("returns 404 to a non member, even one who attended", async () => {
    store.attendanceRows = [{ meeting_id: "m1", user_id: "u2" }];
    const res = await call("u2", "m1");
    expect(res.status).toBe(404);
  });

  it("returns 404 to a removed member", async () => {
    store.members = [
      {
        project_id: "p1",
        user_id: "u2",
        role: "admin",
        removed_at: "2026-11-01",
      },
    ];
    expect((await call("u2", "m1")).status).toBe(404);
  });

  it("gives a Viewer read access, canManage false, and only confirmed action items", async () => {
    asMember("viewer");
    store.actionItems = {
      data: [
        {
          id: "a1",
          title: "Proposed",
          assignee: null,
          due_date: null,
          review_state: "proposed",
        },
        {
          id: "a2",
          title: "Confirmed",
          assignee: null,
          due_date: null,
          review_state: "confirmed",
        },
      ],
      error: null,
    };
    const res = await call("u2", "m1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      projectId: "p1",
      role: "viewer",
      canManage: false,
    });
    expect(body.actionItems.map((i: { id: string }) => i.id)).toEqual(["a2"]);
  });

  it("gives a Developer the action items but canManage false", async () => {
    asMember("developer");
    const body = await (await call("u2", "m1")).json();
    expect(body.canManage).toBe(false);
    expect(body.actionItems).toHaveLength(1);
  });

  it("gives an Admin canManage true", async () => {
    asMember("admin");
    const body = await (await call("u2", "m1")).json();
    expect(body).toMatchObject({ role: "admin", canManage: true });
    expect(body.actionItems).toHaveLength(1);
  });

  it("does not let the creator manage once they are only a Developer", async () => {
    store.meetings = { data: meetingRow("u2", "p1"), error: null };
    asMember("developer");
    const body = await (await call("u2", "m1")).json();
    expect(body.canManage).toBe(false);
  });

  it("keeps personal meetings: projectId null, role null, canManage for the creator", async () => {
    store.meetings = { data: meetingRow("u1"), error: null };
    const body = await (await call("u1", "m1")).json();
    expect(body).toMatchObject({
      projectId: null,
      role: null,
      canManage: true,
    });
  });

  // AC-70v: the route leaves the transcript out for a Viewer, with no query.
  it("never sends a Viewer the transcript and never reads it", async () => {
    asMember("viewer");
    store.transcript = { data: { raw_text: "Ali: secret" }, error: null };
    store.tables = [];
    const body = await (await call("u2", "m1")).json();
    expect("transcriptText" in body).toBe(false);
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(store.tables).not.toContain("transcripts");
  });

  it("sends a Developer the transcript and the header fields", async () => {
    asMember("developer");
    store.transcript = { data: { raw_text: "Ali: hello" }, error: null };
    store.meetings = {
      data: {
        ...meetingRow("owner", "p1"),
        description: "Auth",
        scheduled_end_at: "2026-11-09T11:00:00Z",
        meeting_type: "architecture",
        invited_user_ids: ["u2"],
      },
      error: null,
    };
    const body = await (await call("u2", "m1")).json();
    expect(body.transcriptText).toBe("Ali: hello");
    expect(body.meeting).toMatchObject({
      description: "Auth",
      scheduledEndAt: "2026-11-09T11:00:00Z",
      meetingType: "architecture",
      organizerName: "Ali Hassan",
      invitedUserIds: ["u2"],
    });
  });

  it("sends a null transcript when the meeting has none", async () => {
    asMember("developer");
    store.transcript = { data: null, error: null };
    const body = await (await call("u2", "m1")).json();
    expect(body.transcriptText).toBeNull();
  });

  it("gives a personal meeting participant canManage false", async () => {
    store.meetings = { data: meetingRow("owner"), error: null };
    store.attendanceRows = [{ meeting_id: "m1", user_id: "participant" }];
    const body = await (await call("participant", "m1")).json();
    expect(body.canManage).toBe(false);
  });
});
