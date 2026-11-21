import { describe, it, expect, vi, beforeEach } from "vitest";
import { callsOf, ok, queue, resetQueues } from "@/test/supabase-queue-mock";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock(
  "@/lib/supabase-server",
  async () => (await import("@/test/supabase-queue-mock")).supabaseServerModule,
);

import { DELETE } from "./route";

const del = (userId: string | null) => {
  mockAuth.mockResolvedValue({ userId });
  return DELETE(
    new Request("http://localhost/api/meetings/m1", { method: "DELETE" }),
    {
      params: Promise.resolve({ id: "m1" }),
    },
  );
};
const meeting = ok({ id: "m1", user_id: "owner" });

describe("DELETE /api/meetings/[id] personal", () => {
  beforeEach(() => {
    resetQueues();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("deletes the creator's meeting with no minutes check (spec 0006)", async () => {
    queue("meetings", meeting, ok(null));
    expect((await del("owner")).status).toBe(200);
    expect(callsOf("meetings", "delete")).toHaveLength(1);
    expect(callsOf("minutes_seals", "select")).toHaveLength(0);
  });

  it("answers 500 when the delete fails", async () => {
    queue("meetings", meeting, {
      data: null,
      error: { code: "23503", message: "restrict" },
    });
    expect((await del("owner")).status).toBe(500);
  });
});

describe("DELETE /api/meetings/[id] roles", () => {
  const projectMeeting = ok({ id: "m1", user_id: "owner", project_id: "p1" });

  beforeEach(() => {
    resetQueues();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("keeps a personal meeting creator only, 403 Not authorized", async () => {
    queue("meetings", meeting);
    const res = await del("someone");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Not authorized" });
    expect(callsOf("meetings", "delete")).toHaveLength(0);
  });

  it("returns 404 to a non member of the project", async () => {
    queue("meetings", projectMeeting);
    queue("project_members", ok(null));
    expect((await del("u2")).status).toBe(404);
    expect(callsOf("meetings", "delete")).toHaveLength(0);
  });

  it.each(["admin", "developer", "viewer"])(
    "refuses a project %s with 403",
    async (role) => {
      queue("meetings", projectMeeting);
      queue("project_members", ok({ role }));
      const res = await del("u2");
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Not authorized" });
      expect(callsOf("meetings", "delete")).toHaveLength(0);
    },
  );

  it("refuses the creator who is only an Admin of the project", async () => {
    queue("meetings", projectMeeting);
    queue("project_members", ok({ role: "admin" }));
    expect((await del("owner")).status).toBe(403);
  });

  it("lets the project Owner delete", async () => {
    queue("meetings", projectMeeting, ok(null));
    queue("project_members", ok({ role: "owner" }));
    expect((await del("u2")).status).toBe(200);
    expect(callsOf("meetings", "delete")).toHaveLength(1);
  });
});
