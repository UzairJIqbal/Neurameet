import { describe, it, expect, vi, beforeEach } from "vitest";

// Shared, mutable DB-result store + mocks (hoisted above the vi.mock factories).
const { store, mockAuth, mockSupabase } = vi.hoisted(() => {
  const store = {
    meetings: { data: null as unknown, error: null as unknown },
    attendance: { data: null as unknown, error: null as unknown },
    transcripts: { data: null as unknown, error: null as unknown },
    insights: { data: null as unknown, error: null as unknown },
  };
  const makeClient = () => ({
    from: (table: string) => {
      const result =
        table === "meetings"
          ? store.meetings
          : table === "attendance_events"
            ? store.attendance
            : table === "transcripts"
              ? store.transcripts
              : table === "meeting_insights"
                ? store.insights
                : { data: null, error: null };
      const builder = {
        eq: () => builder,
        single: () => Promise.resolve(result),
        limit: () => Promise.resolve(result),
        maybeSingle: () => Promise.resolve(result),
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
vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: mockSupabase }));

import { POST } from "./route";

const call = (userId: string | null, meetingId: string) => {
  mockAuth.mockResolvedValue({ userId });
  return POST(
    new Request("http://localhost/api/engagement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId }),
    }),
  );
};

const ownerRow = { id: "m1", title: "Test", user_id: "owner" };

describe("POST /api/engagement authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.meetings = { data: null, error: null };
    // No transcript -> the AI generation branch is skipped, isolating the scope
    // check from the (un-mocked) speaker-insights AI call.
    store.transcripts = { data: null, error: null };
    store.insights = { data: null, error: null };
  });

  it("rejects when not authenticated", async () => {
    const res = await call(null, "m1");
    expect(res.status).toBe(401);
  });

  it("returns engagement for the owner", async () => {
    store.meetings = { data: ownerRow, error: null };
    store.attendance = { data: [], error: null };

    const res = await call("owner", "m1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { meetingId: string };
    expect(body.meetingId).toBe("m1");
  });

  it("returns engagement for a recorded participant (the prior 404 bug)", async () => {
    // Meeting belongs to "owner"; caller attended under a different Clerk
    // account. Before the fix the strict owner-only .single() threw and returned
    // "Meeting not found" (404), which the Engagement tab surfaced as an error.
    store.meetings = { data: ownerRow, error: null };
    store.attendance = {
      data: [
        {
          user_id: "participant",
          participant_name: "Participant",
          participant_email: null,
          session_started_at: "2024-01-01T00:00:00Z",
          session_ended_at: null,
          talk_time_seconds: 0,
          mic_toggles: 0,
          camera_toggles: 0,
        },
      ],
      error: null,
    };

    const res = await call("participant", "m1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { meetingId: string };
    expect(body.meetingId).toBe("m1");
  });

  it("still rejects a caller who is neither owner nor participant", async () => {
    store.meetings = { data: ownerRow, error: null };
    store.attendance = { data: [], error: null };

    const res = await call("stranger", "m1");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Meeting not found");
  });
});
