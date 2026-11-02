// @vitest-environment node
//
// Spec 0004 manage gate on POST /api/guest/admit for project meetings. Kept in
// its own file: it mocks guest-store, which the G2 regression test exercises.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { queue, ok, resetQueues } from "@/test/supabase-queue-mock";

const { mockAuth, mockStore } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockStore: vi.fn(async () => true),
}));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock(
  "@/lib/supabase-server",
  async () => (await import("@/test/supabase-queue-mock")).supabaseServerModule,
);
vi.mock("@/lib/guest-store", () => ({
  getGuest: vi.fn(async () => ({ guest_token: "gt", meeting_id: "call-1" })),
  admit: mockStore,
}));
vi.mock("@stream-io/node-sdk", () => ({
  StreamClient: class {
    video = { sendCallEvent: vi.fn(async () => ({})) };
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
    mockStore.mockClear();
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
