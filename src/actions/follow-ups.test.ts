import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock(
  "@/lib/supabase-server",
  async () => (await import("@/test/supabase-queue-mock")).supabaseServerModule,
);

import { calls, queue, resetQueues } from "@/test/supabase-queue-mock";
import { updateFollowUpStatus } from "./follow-ups";

describe("updateFollowUpStatus", () => {
  beforeEach(() => {
    resetQueues();
    mockAuth.mockResolvedValue({ userId: "u1" });
  });

  it("only looks at the caller's personal meetings", async () => {
    queue("meetings", { data: [{ id: "m1" }], error: null });
    queue("follow_ups", { data: { id: "f1" }, error: null });
    expect(await updateFollowUpStatus("f1", "completed")).toEqual({ ok: true });
    const meetingFilters = calls
      .filter((c) => c.table === "meetings" && ["eq", "is"].includes(c.method))
      .map((c) => [c.method, ...c.args]);
    expect(meetingFilters).toEqual([
      ["eq", "user_id", "u1"],
      ["is", "project_id", null],
    ]);
  });

  it("returns Not found when the follow-up is outside those meetings", async () => {
    queue("meetings", { data: [], error: null });
    queue("follow_ups", { data: null, error: null });
    expect(await updateFollowUpStatus("f1", "completed")).toEqual({
      ok: false,
      error: "Not found",
    });
    expect(
      calls.some((c) => c.table === "follow_ups" && c.method === "update"),
    ).toBe(false);
  });
});
