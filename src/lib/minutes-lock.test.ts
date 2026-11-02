import { describe, it, expect, vi, beforeEach } from "vitest";
import { client, ok, queue, resetQueues } from "@/test/supabase-queue-mock";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertMinutesUnlocked } from "./minutes-lock";

const supabase = client as unknown as SupabaseClient;

describe("assertMinutesUnlocked", () => {
  beforeEach(() => {
    resetQueues();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns null when the meeting has no review", async () => {
    queue("minutes_reviews", ok(null));
    expect(await assertMinutesUnlocked(supabase, "m1")).toBeNull();
  });

  it("returns 409 while a review is open, sealing, or sealed", async () => {
    queue(
      "minutes_reviews",
      ok({ status: "open" }),
      ok({ status: "sealing" }),
      ok({ status: "sealed" }),
    );
    const open = await assertMinutesUnlocked(supabase, "m1");
    expect(open?.status).toBe(409);
    expect((await open?.json()).error).toMatch(/under review/u);
    expect((await assertMinutesUnlocked(supabase, "m1"))?.status).toBe(409);
    const sealed = await assertMinutesUnlocked(supabase, "m1");
    expect((await sealed?.json()).error).toBe(
      "These minutes are sealed and can't change.",
    );
  });

  it("returns 500 when the check itself fails", async () => {
    queue("minutes_reviews", { data: null, error: { message: "down" } });
    expect((await assertMinutesUnlocked(supabase, "m1"))?.status).toBe(500);
  });
});
