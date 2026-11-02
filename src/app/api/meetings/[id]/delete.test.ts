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
const SEALED = { error: "Sealed minutes can't be deleted" };

describe("DELETE /api/meetings/[id] with Tasdeeq minutes", () => {
  beforeEach(() => {
    resetQueues();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("refuses to delete a meeting with sealed minutes", async () => {
    queue("meetings", meeting);
    queue("minutes_seals", ok([{ id: "seal-1" }]));
    const res = await del("owner");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual(SEALED);
    expect(callsOf("meetings", "delete")).toHaveLength(0);
  });

  it("returns 409 when a seal lands after the check (foreign key restrict)", async () => {
    queue("meetings", meeting, {
      data: null,
      error: { code: "23503", message: "restrict" },
    });
    queue("minutes_seals", ok([]));
    const res = await del("owner");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual(SEALED);
  });

  it("deletes a meeting with no seal (an open review goes with it)", async () => {
    queue("meetings", meeting, ok(null));
    queue("minutes_seals", ok([]));
    expect((await del("owner")).status).toBe(200);
    expect(callsOf("meetings", "delete")).toHaveLength(1);
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
    queue("minutes_seals", ok([]));
    expect((await del("u2")).status).toBe(200);
    expect(callsOf("meetings", "delete")).toHaveLength(1);
  });
});
