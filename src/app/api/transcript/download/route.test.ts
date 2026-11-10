// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Authorization tests: the caller must own or have attended the meeting, and
// the body's streamCallId must match the stored one, before any generation.
const { store, mockAuth, mockGenerate, mockClaim } = vi.hoisted(() => ({
  store: {
    meeting: null as Record<string, unknown> | null,
    attendance: [] as Array<Record<string, unknown>>,
    member: null as Record<string, unknown> | null,
    review: null as Record<string, unknown> | null,
  },
  mockAuth: vi.fn(),
  mockGenerate: vi.fn(),
  mockClaim: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/agent/transcript-generation", () => ({
  generateTranscriptForMeeting: mockGenerate,
}));
vi.mock("@/lib/transcript-state", () => ({
  setTranscriptState: vi.fn(async () => undefined),
  claimTranscriptGeneration: mockClaim,
  isMissingColumn: () => false,
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
            : table === "minutes_reviews" && store.review
              ? [store.review]
              : table === "project_members" && store.member
                ? [store.member]
                : [];
      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          filters.push([col, val]);
          return builder;
        },
        is: () => builder,
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
    mockClaim.mockReset();
    mockClaim.mockResolvedValue(true);
    mockGenerate.mockResolvedValue({
      status: "ok",
      transcript: "A: hi",
      language: "en",
    });
    store.meeting = { id: "m1", user_id: "owner", stream_call_id: "call-1" };
    store.attendance = [];
    store.review = null;
    store.member = null;
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

  it("answers pending and starts no second run while one is in flight (F10)", async () => {
    mockAuth.mockResolvedValue({ userId: "owner" });
    mockClaim.mockResolvedValue(false);
    const res = await post({ meetingId: "m1", streamCallId: "call-1" });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("pending");
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("says no_recording is final once the call ended long ago (F10)", async () => {
    mockAuth.mockResolvedValue({ userId: "owner" });
    store.meeting = {
      id: "m1",
      user_id: "owner",
      stream_call_id: "call-1",
      ended_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    };
    mockGenerate.mockResolvedValue({ status: "no_recording", message: "wait" });
    const body = await (await post({ meetingId: "m1", streamCallId: "call-1" })).json();
    expect(body.status).toBe("no_recording");
    expect(body.final).toBe(true);
    expect(body.message).toMatch(/not recorded/i);
  });

  it("keeps no_recording retryable right after the call ends (F10)", async () => {
    mockAuth.mockResolvedValue({ userId: "owner" });
    store.meeting = {
      id: "m1",
      user_id: "owner",
      stream_call_id: "call-1",
      ended_at: new Date().toISOString(),
    };
    mockGenerate.mockResolvedValue({ status: "no_recording", message: "wait" });
    const body = await (await post({ meetingId: "m1", streamCallId: "call-1" })).json();
    expect(body.final).toBe(false);
    expect(body.message).toBe("wait");
  });

  it("allows the owner", async () => {
    mockAuth.mockResolvedValue({ userId: "owner" });
    const res = await post({ meetingId: "m1", streamCallId: "call-1" });
    expect(res.status).toBe(200);
  });

  it("returns 409 and generates nothing under a minutes review (spec 0003 AC-7)", async () => {
    store.attendance = [{ id: "a1", meeting_id: "m1", user_id: "user_a" }];
    store.review = { meeting_id: "m1", status: "open" };
    const res = await post({ meetingId: "m1", streamCallId: "call-1" });
    expect(res.status).toBe(409);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  describe("on a project meeting (spec 0004)", () => {
    beforeEach(() => {
      store.meeting = {
        id: "m1",
        user_id: "owner",
        project_id: "p1",
        stream_call_id: "call-1",
      };
    });
    const member = (role: string) => {
      store.member = { project_id: "p1", user_id: "user_a", role };
    };

    it("returns 404 to a non member, even one who attended", async () => {
      store.attendance = [{ id: "a1", meeting_id: "m1", user_id: "user_a" }];
      const res = await post({ meetingId: "m1", streamCallId: "call-1" });
      expect(res.status).toBe(404);
      expect(mockGenerate).not.toHaveBeenCalled();
    });

    it("returns 403 to a Viewer", async () => {
      member("viewer");
      const res = await post({ meetingId: "m1", streamCallId: "call-1" });
      expect(res.status).toBe(403);
      expect(mockGenerate).not.toHaveBeenCalled();
    });

    it("lets a Developer download but not generate", async () => {
      member("developer");
      const res = await post({ meetingId: "m1", streamCallId: "call-1" });
      expect(res.status).toBe(403);
      expect(mockGenerate).not.toHaveBeenCalled();
    });

    it("lets an Admin generate", async () => {
      member("admin");
      const res = await post({ meetingId: "m1", streamCallId: "call-1" });
      expect(res.status).toBe(200);
      expect(mockGenerate).toHaveBeenCalledOnce();
    });
  });
});
