import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok, queue, resetQueues, callsOf } from "@/test/supabase-queue-mock";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock(
  "@/lib/supabase-server",
  async () => (await import("@/test/supabase-queue-mock")).supabaseServerModule,
);

import { POST } from "./route";

const post = (body: unknown, userId: string | null = "u2") => {
  mockAuth.mockResolvedValue({ userId });
  return POST(
    new Request("http://localhost/api/meetings/call_1/consent", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "call_1" }) },
  );
};
const current = { noticeVersion: "w3-v1" };
const projectMeeting = ok({ id: "m1", user_id: "owner", project_id: "p1" });

describe("POST /api/meetings/[id]/consent (W3)", () => {
  beforeEach(() => {
    resetQueues();
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("rejects when not signed in", async () => {
    expect((await post(current, null)).status).toBe(401);
  });

  it("returns 422 for a wrong notice version", async () => {
    expect((await post({ noticeVersion: "w2-v0" })).status).toBe(422);
    expect((await post({})).status).toBe(422);
  });

  it("returns 404 for a personal meeting or a call with no row", async () => {
    queue(
      "meetings",
      ok({ id: "m1", user_id: "owner", project_id: null }),
      ok(null),
    );
    expect((await post(current)).status).toBe(404);
    expect((await post(current)).status).toBe(404);
  });

  it("returns 404 to a non member and saves nothing", async () => {
    queue("meetings", projectMeeting);
    queue("project_members", ok(null));
    expect((await post(current)).status).toBe(404);
    expect(callsOf("meeting_participants", "upsert")).toHaveLength(0);
  });

  it("upserts the tick for any member", async () => {
    queue("meetings", projectMeeting);
    queue("project_members", ok({ role: "viewer" }));
    const res = await post(current);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const [upsert] = callsOf("meeting_participants", "upsert");
    expect(upsert.args[0]).toMatchObject({
      meeting_id: "m1",
      user_id: "u2",
      notice_version: "w3-v1",
    });
    expect(upsert.args[1]).toEqual({ onConflict: "meeting_id,user_id" });
  });
});
