import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  calls,
  callsOf,
  queue,
  ok,
  resetQueues,
} from "@/test/supabase-queue-mock";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock(
  "@/lib/supabase-server",
  async () => (await import("@/test/supabase-queue-mock")).supabaseServerModule,
);

import { DELETE, GET } from "./route";

const ctx = { params: Promise.resolve({ id: "f1" }) };
const req = () => new Request("http://localhost/api/follow-ups/f1");

const asUser = (userId: string | null) =>
  mockAuth.mockResolvedValue({ userId });

describe("GET /api/follow-ups/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetQueues();
  });

  it("scopes the lookup to the caller's personal meetings", async () => {
    asUser("u1");
    queue("meetings", ok([]));
    queue("follow_ups", ok(null));

    const res = await GET(req(), ctx);

    // A follow up on a project meeting is outside the scope, so it is not found.
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Follow-up not found" });
    expect(calls).toContainEqual({
      table: "meetings",
      method: "is",
      args: ["project_id", null],
    });
  });
});

describe("DELETE /api/follow-ups/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetQueues();
  });

  it("returns 404 for a follow up on a project meeting, even for its creator", async () => {
    asUser("u1");
    queue(
      "follow_ups",
      ok({
        id: "f1",
        meeting_id: "m1",
        meetings: { user_id: "u1", project_id: "p1" },
      }),
    );

    const res = await DELETE(req(), ctx);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Follow-up not found" });
    expect(callsOf("follow_ups", "delete")).toHaveLength(0);
  });

  it("still returns 403 for a non owner on a personal meeting", async () => {
    asUser("stranger");
    queue(
      "follow_ups",
      ok({
        id: "f1",
        meeting_id: "m1",
        meetings: { user_id: "u1", project_id: null },
      }),
    );

    expect((await DELETE(req(), ctx)).status).toBe(403);
    expect(callsOf("follow_ups", "delete")).toHaveLength(0);
  });

  it("deletes for the owner of a personal meeting", async () => {
    asUser("u1");
    queue(
      "follow_ups",
      ok({
        id: "f1",
        meeting_id: "m1",
        meetings: { user_id: "u1", project_id: null },
      }),
      ok(null),
    );

    expect((await DELETE(req(), ctx)).status).toBe(200);
    expect(callsOf("follow_ups", "delete")).toHaveLength(1);
  });
});
