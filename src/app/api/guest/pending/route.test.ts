// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { queue, ok, resetQueues } from "@/test/supabase-queue-mock";

const { mockAuth, mockGetAllPending } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockGetAllPending: vi.fn(async () => [{ guest_token: "gt" }]),
}));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock(
  "@/lib/supabase-server",
  async () => (await import("@/test/supabase-queue-mock")).supabaseServerModule,
);
vi.mock("@/lib/guest-store", () => ({ getAllPending: mockGetAllPending }));

import { GET } from "./route";

const get = () =>
  GET(
    new Request("http://localhost/api/guest/pending?meetingId=call-1") as never,
  );

describe("GET /api/guest/pending", () => {
  beforeEach(() => {
    resetQueues();
    mockGetAllPending.mockClear();
    mockAuth.mockResolvedValue({ userId: "u2" });
  });

  it("returns no guests while the meeting row does not exist", async () => {
    const res = await get();
    expect(await res.json()).toEqual({ pending: [] });
  });

  it("keeps the personal rule: the creator sees guests, others get 403", async () => {
    queue("meetings", ok({ id: "m1", user_id: "u2", project_id: null }));
    expect((await get()).status).toBe(200);
    queue("meetings", ok({ id: "m1", user_id: "u1", project_id: null }));
    expect((await get()).status).toBe(403);
  });

  it.each([
    ["a non member", null, 404],
    ["a Viewer", "viewer", 403],
    ["a Developer", "developer", 403],
    ["an Admin", "admin", 200],
  ] as const)(
    "on a project meeting %s gets %i (spec 0004, manage)",
    async (_who, role, status) => {
      queue("meetings", ok({ id: "m1", user_id: "u1", project_id: "p1" }));
      queue("project_members", ok(role ? { role } : null));
      const res = await get();
      expect(res.status).toBe(status);
      if (status !== 200) expect(mockGetAllPending).not.toHaveBeenCalled();
    },
  );
});
