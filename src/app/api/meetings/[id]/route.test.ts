import { describe, it, expect, vi, beforeEach } from "vitest";

// Shared, mutable DB-result store + mocks (hoisted above the vi.mock factories).
const { store, mockAuth, mockSupabase } = vi.hoisted(() => {
  const store = {
    meetings: { data: null as unknown, error: null as unknown },
    attendance: { data: null as unknown, error: null as unknown },
    insights: { data: null as unknown, error: null as unknown },
    actionItems: { data: null as unknown, error: null as unknown },
  };
  const makeClient = () => ({
    from: (table: string) => {
      const result =
        table === "meetings"
          ? store.meetings
          : table === "attendance_events"
            ? store.attendance
            : table === "meeting_insights"
              ? store.insights
              : table === "action_items"
                ? store.actionItems
                : { data: null, error: null };
      const builder = {
        eq: () => builder,
        single: () => Promise.resolve(result),
        limit: () => Promise.resolve(result),
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

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: mockSupabase }));

import { GET } from "./route";

const meetingRow = (user_id: string) => ({
  id: "m1",
  user_id,
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
    store.attendance = { data: null, error: null };
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
    store.attendance = { data: [{ user_id: "participant" }], error: null };

    const res = await call("participant", "m1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { meeting: { id: string } };
    expect(body.meeting.id).toBe("m1");
  });

  it("still rejects a caller who is neither owner nor participant", async () => {
    store.meetings = { data: meetingRow("owner"), error: null };
    store.attendance = { data: [], error: null };

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
