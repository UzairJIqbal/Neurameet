import { describe, it, expect, vi, beforeEach } from "vitest";

// Shared, mutable DB-result store + mocks (hoisted above the vi.mock factories).
const { store, mockAuth, mockEmbedAndStore, mockSupabase } = vi.hoisted(() => {
  const store = {
    meetings: { data: null as unknown, error: null as unknown },
    attendance: { data: null as unknown, error: null as unknown },
    transcript: { data: null as unknown, error: null as unknown },
  };
  const makeClient = () => ({
    from: (table: string) => {
      const result =
        table === "meetings"
          ? store.meetings
          : table === "attendance_events"
            ? store.attendance
            : store.transcript;
      // Chainable builder: every .eq returns itself so .eq().eq().single()
      // (attendance) and .eq().single() (meetings/transcripts) both resolve.
      const builder = {
        eq: () => builder,
        single: () => Promise.resolve(result),
        limit: () => Promise.resolve(result),
      };
      return {
        select: () => builder,
      };
    },
  });
  return {
    store,
    mockAuth: vi.fn(),
    mockEmbedAndStore: vi.fn(),
    mockSupabase: vi.fn(() => makeClient()),
  };
});

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: mockSupabase }));
vi.mock("@/agent/embed", () => ({ embedAndStore: mockEmbedAndStore }));

import { POST } from "./route";

const call = (userId: string | null, body: unknown) => {
  mockAuth.mockResolvedValue({ userId });
  return POST(
    new Request("http://localhost/api/ai/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
};

describe("POST /api/ai/embed authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.meetings = { data: null, error: null };
    store.attendance = { data: null, error: null };
    store.transcript = { data: null, error: null };
  });

  it("rejects when not authenticated", async () => {
    const res = await call(null, { meetingId: "m1" });
    expect(res.status).toBe(401);
    expect(mockEmbedAndStore).not.toHaveBeenCalled();
  });

  it("embeds for the meeting owner", async () => {
    store.meetings = { data: { id: "m1", user_id: "u1" }, error: null };
    store.transcript = { data: { raw_text: "Hello world." }, error: null };
    mockEmbedAndStore.mockResolvedValue({ chunkCount: 1 });

    const res = await call("u1", { meetingId: "m1" });

    expect(res.status).toBe(200);
    expect(mockEmbedAndStore).toHaveBeenCalledWith("m1", "Hello world.");
  });

  it("embeds for a recorded participant (non-owner) — the prior 404 bug", async () => {
    // Meeting belongs to "owner", but the caller is a participant who uploaded
    // the transcript under a different Clerk account. Before the fix this hit
    // the strict owner-only check and returned "Meeting not found" (404).
    store.meetings = { data: { id: "m1", user_id: "owner" }, error: null };
    store.attendance = {
      data: [{ user_id: "participant" }],
      error: null,
    };
    store.transcript = { data: { raw_text: "Hello world." }, error: null };
    mockEmbedAndStore.mockResolvedValue({ chunkCount: 1 });

    const res = await call("participant", { meetingId: "m1" });

    expect(res.status).toBe(200);
    expect(mockEmbedAndStore).toHaveBeenCalledWith("m1", "Hello world.");
  });

  it("still rejects a caller who is neither owner nor participant", async () => {
    store.meetings = { data: { id: "m1", user_id: "owner" }, error: null };
    store.attendance = { data: [], error: null };

    const res = await call("stranger", { meetingId: "m1" });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Meeting not found");
    expect(mockEmbedAndStore).not.toHaveBeenCalled();
  });

  it("returns 404 when the meeting does not exist", async () => {
    store.meetings = { data: null, error: { code: "PGRST116" } };

    const res = await call("u1", { meetingId: "nope" });
    expect(res.status).toBe(404);
    expect(mockEmbedAndStore).not.toHaveBeenCalled();
  });

  it("returns 404 when the transcript is missing or empty", async () => {
    store.meetings = { data: { id: "m1", user_id: "u1" }, error: null };
    store.transcript = { data: { raw_text: "   " }, error: null };

    const res = await call("u1", { meetingId: "m1" });
    expect(res.status).toBe(404);
    expect(mockEmbedAndStore).not.toHaveBeenCalled();
  });
});
