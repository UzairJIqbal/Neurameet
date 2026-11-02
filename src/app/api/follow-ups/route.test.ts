import { describe, it, expect, vi, beforeEach } from "vitest";
import { calls, queue, ok, resetQueues } from "@/test/supabase-queue-mock";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock(
  "@/lib/supabase-server",
  async () => (await import("@/test/supabase-queue-mock")).supabaseServerModule,
);

import { GET } from "./route";

describe("GET /api/follow-ups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetQueues();
  });

  it("returns 401 when signed out", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    expect((await GET()).status).toBe(401);
  });

  it("lists follow ups of the caller's personal meetings only", async () => {
    mockAuth.mockResolvedValue({ userId: "u1" });
    queue("meetings", ok([{ id: "m1" }]));
    queue(
      "follow_ups",
      ok([
        {
          id: "f1",
          status: "pending",
          priority: "medium",
          notes: null,
          updated_at: "2026-11-01T10:00:00.000Z",
          meeting_id: "m1",
          action_item_id: "a1",
          meetings: { title: "Standup" },
          action_items: { title: "Ship", assignee: null, due_date: null },
        },
      ]),
    );

    const res = await GET();
    const body = (await res.json()) as { followUps: Array<{ id: string }> };

    expect(res.status).toBe(200);
    expect(body.followUps.map((f) => f.id)).toEqual(["f1"]);
    // Project meetings are filtered out of the meeting scope.
    expect(calls).toContainEqual({
      table: "meetings",
      method: "is",
      args: ["project_id", null],
    });
    expect(calls).toContainEqual({
      table: "follow_ups",
      method: "in",
      args: ["meeting_id", ["m1"]],
    });
  });
});
