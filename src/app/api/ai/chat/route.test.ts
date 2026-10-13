import { describe, it, expect, vi, beforeEach } from "vitest";

// Shared, mutable DB-result store + mocks (hoisted above the vi.mock factories).
const {
  store,
  mockAuth,
  mockCurrentUser,
  mockSupabase,
  mockStreamText,
  mockConvertToModelMessages,
  mockResolveChatModel,
  mockRetrieveContext,
  mockBuildSystemPrompt,
  mockGetUserRecordings,
} = vi.hoisted(() => {
  const store = {
    meetings: { data: null as unknown, error: null as unknown },
    attendance: { data: null as unknown, error: null as unknown },
  };
  const makeClient = () => ({
    from: (table: string) => {
      const result =
        table === "meetings"
          ? store.meetings
          : table === "attendance_events"
            ? store.attendance
            : { data: null, error: null };
      // Chainable builder: every .eq returns itself so .eq().eq().single()
      // (meetings) and .eq().eq().limit() (attendance) both resolve.
      const builder = {
        eq: () => builder,
        single: () => Promise.resolve(result),
        limit: () => Promise.resolve(result),
        order: () => builder,
        then: (
          onFulfilled: (value: unknown) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) => Promise.resolve(result).then(onFulfilled, onRejected),
      };
      return { select: () => builder };
    },
  });
  return {
    store,
    mockAuth: vi.fn(),
    mockCurrentUser: vi.fn(),
    mockSupabase: vi.fn(() => makeClient()),
    mockStreamText: vi.fn(() => ({
      toUIMessageStreamResponse: () => new Response("ok", { status: 200 }),
    })),
    mockConvertToModelMessages: vi.fn((m: unknown) => m),
    mockResolveChatModel: vi.fn(async () => ({ fakeModel: true })),
    mockRetrieveContext: vi.fn(async () => []),
    mockBuildSystemPrompt: vi.fn(() => "system-prompt"),
    mockGetUserRecordings: vi.fn(async () => [{}, {}]),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  currentUser: mockCurrentUser,
}));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: mockSupabase }));
vi.mock("ai", () => ({
  streamText: mockStreamText,
  convertToModelMessages: mockConvertToModelMessages,
  createUIMessageStream: vi.fn(),
  createUIMessageStreamResponse: vi.fn(),
  UIMessage: class {},
}));
vi.mock("@/agent/models", () => ({ resolveChatModel: mockResolveChatModel }));
vi.mock("@/agent/rag", () => ({
  retrieveContext: mockRetrieveContext,
  buildSystemPrompt: mockBuildSystemPrompt,
}));

vi.mock("@/lib/recordings", () => ({
  getUserRecordings: mockGetUserRecordings,
}));

import { POST } from "./route";

const call = (
  userId: string | null,
  body: { messages?: unknown[]; meetingId?: string },
) => {
  mockAuth.mockResolvedValue({ userId });
  return POST(
    new Request("http://localhost/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
};

const meetingRow = (user_id: string) => ({ id: "m1", user_id });

const body = (meetingId: string) => ({
  messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
  meetingId,
});

describe("POST /api/ai/chat authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.meetings = { data: null, error: null };
    store.attendance = { data: null, error: null };
    // Keep the hoisted defaults intact.
    mockRetrieveContext.mockImplementation(async () => []);
    mockBuildSystemPrompt.mockImplementation(() => "system-prompt");
    mockResolveChatModel.mockImplementation(async () => ({ fakeModel: true }));
  });

  it("rejects when not authenticated", async () => {
    const res = await call(null, body("m1"));
    expect(res.status).toBe(401);
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it("streams for the meeting owner", async () => {
    store.meetings = { data: meetingRow("u1"), error: null };

    const res = await call("u1", body("m1"));

    expect(res.status).toBe(200);
    expect(mockStreamText).toHaveBeenCalledTimes(1);
    expect(mockRetrieveContext).toHaveBeenCalledWith("m1", "hello");
  });

  it("streams for a recorded participant (the prior 404 bug)", async () => {
    // Meeting belongs to "owner", but the caller attended under a different
    // Clerk account. Before the fix the strict owner-only .single() threw
    // PGRST116 and returned "Meeting not found" (404).
    store.meetings = { data: meetingRow("owner"), error: null };
    store.attendance = {
      data: [{ user_id: "participant" }],
      error: null,
    };

    const res = await call("participant", body("m1"));

    expect(res.status).toBe(200);
    expect(mockStreamText).toHaveBeenCalledTimes(1);
  });

  it("still rejects a caller who is neither owner nor participant", async () => {
    store.meetings = { data: meetingRow("owner"), error: null };
    store.attendance = { data: [], error: null };

    const res = await call("stranger", body("m1"));

    expect(res.status).toBe(404);
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it("returns 404 when the meeting does not exist (PGRST116)", async () => {
    store.meetings = { data: null, error: { code: "PGRST116" } };

    const res = await call("u1", body("nope"));

    expect(res.status).toBe(404);
    expect(mockStreamText).not.toHaveBeenCalled();
  });
});

describe("POST /api/ai/chat general assistant", () => {
  const ask = (text: string) => ({
    messages: [{ role: "user", parts: [{ type: "text", text }] }],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentUser.mockResolvedValue({ firstName: "Ana" });
    store.meetings = { data: [], error: null };
  });

  it("rejects a malformed messages payload", async () => {
    const res = await call("u1", { messages: [{ role: "hacker" }] });
    expect(res.status).toBe(400);
  });

  it("does not short-circuit a non-count recording question", async () => {
    const res = await call("u1", ask("How do I record a meeting?"));
    expect(res.status).toBe(200);
    expect(mockGetUserRecordings).not.toHaveBeenCalled();
    expect(mockStreamText).toHaveBeenCalled();
  });

  it("looks up recordings for a count question", async () => {
    await call("u1", ask("How many recordings do I have?"));
    expect(mockGetUserRecordings).toHaveBeenCalledWith("u1");
  });
});
