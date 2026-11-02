import { describe, it, expect, vi, beforeEach } from "vitest";
import { callsOf, ok, queue, resetQueues } from "@/test/supabase-queue-mock";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock(
  "@/lib/supabase-server",
  async () => (await import("@/test/supabase-queue-mock")).supabaseServerModule,
);

import { POST } from "./route";

const post = (userId: string | null, body: Record<string, unknown>) => {
  mockAuth.mockResolvedValue({ userId });
  return POST(
    new Request("http://localhost/api/minutes/suggestion", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
};

const meeting = ok({
  id: "m1",
  user_id: "owner",
  title: "Weekly",
  started_at: null,
  created_at: null,
});
const ali = {
  user_id: "p1",
  display_name: "Ali",
  email: null,
  is_owner: false,
  done_at: null,
};
const aliClaim = {
  speaker_label: "ali",
  display_label: "Ali",
  user_id: "p1",
  claimed_by: "self",
};
const suggestion = (status = "suggested") => ({
  id: "s1",
  speaker_label: "Ali",
  position: "Too costly",
  related_line_id: null,
  status,
});
const body = { meetingId: "m1", suggestionId: "s1", action: "dismiss" };

function setup(
  opts: { status?: string; claims?: unknown[]; afterStatus?: string } = {},
) {
  queue("meetings", meeting);
  queue(
    "minutes_reviews",
    ok({ id: "r1", status: "open" }),
    ok({ status: opts.afterStatus ?? "open" }),
  );
  queue("minutes_attesters", ok(ali), ok([ali]));
  queue("minutes_dissent_suggestions", ok([suggestion(opts.status)]));
  queue("minutes_lines", ok([]));
  queue("minutes_speaker_claims", ok(opts.claims ?? [aliClaim]));
}

describe("POST /api/minutes/suggestion", () => {
  beforeEach(() => {
    resetQueues();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns 401 when signed out and 400 for another action", async () => {
    expect((await post(null, body)).status).toBe(401);
    expect((await post("p1", { ...body, action: "adopt" })).status).toBe(400);
  });

  it("returns 403 when the label is held by someone else", async () => {
    setup({ claims: [{ ...aliClaim, user_id: "owner" }] });
    expect((await post("p1", body)).status).toBe(403);
  });

  it("returns 409 for a suggestion already used", async () => {
    setup({ status: "adopted" });
    expect((await post("p1", body)).status).toBe(409);
  });

  it("dismisses your suggestion", async () => {
    setup();
    const res = await post("p1", body);
    expect(res.status).toBe(200);
    expect(callsOf("minutes_dissent_suggestions", "update")[0].args[0]).toEqual(
      { status: "dismissed" },
    );
  });

  it("puts it back when the review closed meanwhile", async () => {
    setup({ afterStatus: "sealing" });
    expect((await post("p1", body)).status).toBe(409);
    const updates = callsOf("minutes_dissent_suggestions", "update");
    expect(updates.map((u) => u.args[0])).toEqual([
      { status: "dismissed" },
      { status: "suggested" },
    ]);
  });
});
