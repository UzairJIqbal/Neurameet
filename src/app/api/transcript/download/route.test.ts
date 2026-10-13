// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Authorization tests: the caller must own or have attended the meeting, and
// the body's streamCallId must match the stored one, before any generation.
const { store, mockAuth, mockGenerate } = vi.hoisted(() => ({
  store: {
    meeting: null as Record<string, unknown> | null,
    attendance: [] as Array<Record<string, unknown>>,
  },
  mockAuth: vi.fn(),
  mockGenerate: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/agent/transcript-generation", () => ({
  generateTranscriptForMeeting: mockGenerate,
}));
vi.mock("@/lib/transcript-state", () => ({
  setTranscriptState: vi.fn(async () => undefined),
}));
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: () => ({
    from: (table: string) => {
      const filters: Array<[string, unknown]> = [];
      const rows = (): Array<Record<string, unknown>> =>
        table === "meetings"
          ? store.meeting
            ? [store.meeting]
            : []
          : table === "attendance_events"
            ? store.attendance
            : [];
      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          filters.push([col, val]);
          return builder;
        },
        limit: () => builder,
        maybeSingle: async () => ({
          data:
            rows().find((r) => filters.every(([c, v]) => r[c] === v)) ?? null,
          error: null,
        }),
        upsert: async () => ({ error: null }),
      };
      return builder;
    },
  }),
}));

import { POST } from "./route";

const post = (body: Record<string, unknown>) =>
  POST(
    new Request("http://localhost/api/transcript/download", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

describe("POST /api/transcript/download authorization", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: "user_a" });
    mockGenerate.mockReset();
    mockGenerate.mockResolvedValue({
      status: "ok",
      transcript: "A: hi",
      language: "en",
    });
    store.meeting = { id: "m1", user_id: "owner", stream_call_id: "call-1" };
    store.attendance = [];
  });

  it("rejects a streamCallId that is not the meeting's", async () => {
    store.attendance = [{ id: "a1", meeting_id: "m1", user_id: "user_a" }];
    const res = await post({ meetingId: "m1", streamCallId: "other-call" });
    expect(res.status).toBe(404);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("forbids a signed-in user who neither owns nor attended", async () => {
    store.attendance = [
      { id: "a1", meeting_id: "m1", user_id: "someone_else" },
      { id: "a2", meeting_id: "m2", user_id: "user_a" },
    ];
    const res = await post({ meetingId: "m1", streamCallId: "call-1" });
    expect(res.status).toBe(403);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("allows a recorded attendee", async () => {
    store.attendance = [{ id: "a1", meeting_id: "m1", user_id: "user_a" }];
    const res = await post({ meetingId: "m1", streamCallId: "call-1" });
    expect(res.status).toBe(200);
    expect(mockGenerate).toHaveBeenCalledOnce();
  });

  it("allows the owner", async () => {
    mockAuth.mockResolvedValue({ userId: "owner" });
    const res = await post({ meetingId: "m1", streamCallId: "call-1" });
    expect(res.status).toBe(200);
  });
});
