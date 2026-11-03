// @vitest-environment node
//
// Spec 0004 manage gate on POST /api/guest/admit for project meetings. Kept in
// its own file: it mocks guest-store, which the G2 regression test exercises.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { queue, ok, resetQueues } from "@/test/supabase-queue-mock";

const { mockAuth, mockStore, mockGetGuest, mockUpdate, mockCall, mockSend } =
  vi.hoisted(() => ({
    mockAuth: vi.fn(),
    mockStore: vi.fn(async () => true),
    mockGetGuest: vi.fn(),
    mockUpdate: vi.fn(),
    mockCall: vi.fn(),
    mockSend: vi.fn(async () => ({})),
  }));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock(
  "@/lib/supabase-server",
  async () => (await import("@/test/supabase-queue-mock")).supabaseServerModule,
);
vi.mock("@/lib/guest-store", () => ({
  getGuest: mockGetGuest,
  admit: mockStore,
}));
vi.mock("@stream-io/node-sdk", () => ({
  StreamClient: class {
    video = { sendCallEvent: mockSend, call: mockCall };
  },
}));

import { POST } from "./route";

const post = () =>
  POST(
    new Request("http://localhost/api/guest/admit", {
      method: "POST",
      body: JSON.stringify({ guest_token: "gt", meeting_id: "call-1" }),
    }) as never,
  );

describe("POST /api/guest/admit on a project meeting (spec 0004, manage)", () => {
  beforeEach(() => {
    resetQueues();
    vi.clearAllMocks();
    mockGetGuest.mockResolvedValue({ guest_token: "gt", meeting_id: "call-1" });
    mockAuth.mockResolvedValue({ userId: "u2" });
    queue("meetings", ok({ id: "m1", user_id: "u1", project_id: "p1" }));
  });

  it.each([
    ["a non member", null, 404],
    ["a Viewer", "viewer", 403],
    ["a Developer", "developer", 403],
  ] as const)("%s gets %i", async (_who, role, status) => {
    queue("project_members", ok(role ? { role } : null));
    const res = await post();
    expect(res.status).toBe(status);
    expect(mockStore).not.toHaveBeenCalled();
  });

  it("lets an Admin admit", async () => {
    queue("project_members", ok({ role: "admin" }));
    const res = await post();
    expect(res.status).toBe(200);
    expect(mockStore).toHaveBeenCalledWith("gt");
  });

  it("keeps the personal rule: a non creator gets 403", async () => {
    resetQueues();
    queue("meetings", ok({ id: "m1", user_id: "u1", project_id: null }));
    const res = await post();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Not authorized" });
  });
});

describe("POST /api/guest/admit on a project call type (W3)", () => {
  const order: string[] = [];

  beforeEach(() => {
    resetQueues();
    vi.clearAllMocks();
    order.length = 0;
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockAuth.mockResolvedValue({ userId: "u1" });
    mockGetGuest.mockResolvedValue({
      guest_token: "gt",
      meeting_id: "call-1",
      stream_user_id: "guest-abc",
    });
    mockUpdate.mockImplementation(async () => {
      order.push("member");
      return {};
    });
    mockStore.mockImplementation(async () => {
      order.push("admit");
      return true;
    });
    mockCall.mockReturnValue({ updateCallMembers: mockUpdate });
    queue(
      "meetings",
      ok({ id: "m1", user_id: "u1", project_id: "p1", stream_call_type: "project" }),
    );
    queue("project_members", ok({ role: "owner" }));
  });

  it("adds the guest as a call member before admitting", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(mockCall).toHaveBeenCalledWith("project", "call-1");
    expect(mockUpdate).toHaveBeenCalledWith({
      update_members: [{ user_id: "guest-abc", role: "call_member" }],
    });
    expect(order).toEqual(["member", "admit"]);
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ type: "project" }));
  });

  it("returns 409 while the guest has no Stream identity yet", async () => {
    mockGetGuest.mockResolvedValue({ guest_token: "gt", meeting_id: "call-1", stream_user_id: "" });
    const res = await post();
    expect(res.status).toBe(409);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockStore).not.toHaveBeenCalled();
  });

  it("returns 502 and keeps the guest pending when Stream fails", async () => {
    mockUpdate.mockRejectedValue(new Error("stream down"));
    const res = await post();
    expect(res.status).toBe(502);
    expect(mockStore).not.toHaveBeenCalled();
  });
});
