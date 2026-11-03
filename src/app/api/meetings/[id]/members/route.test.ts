import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok, queue, resetQueues } from "@/test/supabase-queue-mock";

const { mockAuth, mockGet, mockUpdate, mockCall } = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_STREAM_API_KEY = "key";
  process.env.STREAM_SECRET_KEY = "secret";
  return {
    mockAuth: vi.fn(),
    mockGet: vi.fn(),
    mockUpdate: vi.fn(),
    mockCall: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock(
  "@/lib/supabase-server",
  async () => (await import("@/test/supabase-queue-mock")).supabaseServerModule,
);
vi.mock("@stream-io/node-sdk", () => ({
  StreamClient: vi.fn(function () {
    return {
      video: {
        call: mockCall,
      },
    };
  }),
}));

import { POST } from "./route";

const post = (userId: string | null) => {
  mockAuth.mockResolvedValue({ userId });
  return POST(new Request("http://localhost/api/meetings/call_1/members"), {
    params: Promise.resolve({ id: "call_1" }),
  });
};
const projectMeeting = ok({
  id: "m1",
  user_id: "owner",
  project_id: "p1",
  stream_call_type: "project",
});
const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();
const freshConsent = ok({ consented_at: minutesAgo(1), notice_version: "w3-v1" });

describe("POST /api/meetings/[id]/members", () => {
  beforeEach(() => {
    resetQueues();
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockGet.mockResolvedValue({});
    mockUpdate.mockResolvedValue({});
    mockCall.mockReturnValue({ get: mockGet, updateCallMembers: mockUpdate });
  });

  it("rejects when not signed in", async () => {
    expect((await post(null)).status).toBe(401);
  });

  it("keeps a personal meeting unchanged (no role sent)", async () => {
    queue("meetings", ok({ id: "m1", user_id: "owner", project_id: null }));
    expect((await post("u2")).status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({
      update_members: [{ user_id: "u2" }],
    });
    expect(mockCall).toHaveBeenCalledWith("default", "call_1");
  });

  it("keeps a call with no meetings row unchanged", async () => {
    queue("meetings", ok(null));
    expect((await post("u2")).status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({
      update_members: [{ user_id: "u2" }],
    });
  });

  it("returns 404 to a non member of the project and never touches Stream", async () => {
    queue("meetings", projectMeeting);
    queue("project_members", ok(null));
    expect((await post("u2")).status).toBe(404);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ["owner", "admin"],
    ["admin", "admin"],
    ["developer", "call_member"],
    ["viewer", "call_member"],
  ])("maps project %s to Stream %s", async (role, streamRole) => {
    queue("meetings", projectMeeting);
    queue("project_members", ok({ role }));
    queue("meeting_participants", freshConsent);
    expect((await post("u2")).status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({
      update_members: [{ user_id: "u2", role: streamRole }],
    });
    expect(mockCall).toHaveBeenCalledWith("project", "call_1");
  });

  it.each([
    ["missing", ok(null)],
    ["stale", ok({ consented_at: minutesAgo(16), notice_version: "w3-v1" })],
    ["an old version", ok({ consented_at: minutesAgo(1), notice_version: "w2-v0" })],
  ])("returns 409 when the consent tick is %s", async (_label, row) => {
    queue("meetings", projectMeeting);
    queue("project_members", ok({ role: "developer" }));
    queue("meeting_participants", row);
    const res = await post("u2");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Please accept the recording notice" });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("asks for consent on a moved meeting that kept the default call type", async () => {
    queue("meetings", ok({ id: "m1", user_id: "owner", project_id: "p1", stream_call_type: "default" }));
    queue("project_members", ok({ role: "developer" }));
    queue("meeting_participants", ok(null));
    expect((await post("u2")).status).toBe(409);
  });

  it("fails closed when the meeting lookup errors", async () => {
    queue("meetings", { data: null, error: { message: "db down" } });
    expect((await post("u2")).status).toBe(500);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
