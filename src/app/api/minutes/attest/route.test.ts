import { describe, it, expect, vi, beforeEach } from "vitest";
import { callsOf, ok, queue, resetQueues } from "@/test/supabase-queue-mock";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock(
  "@/lib/supabase-server",
  async () => (await import("@/test/supabase-queue-mock")).supabaseServerModule,
);

import { POST } from "./route";

const post = (userId: string | null, body: Record<string, unknown>) => {
  mockAuth.mockResolvedValue({ userId });
  return POST(
    new Request("http://localhost/api/minutes/attest", {
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
const review = (deadline = "2099-01-01T00:00:00Z", status = "open") =>
  ok({ id: "r1", meeting_id: "m1", status, deadline_at: deadline });
const owner = {
  user_id: "owner",
  display_name: "Sara",
  email: null,
  is_owner: true,
  done_at: null,
};
const ali = {
  user_id: "p1",
  display_name: "Ali",
  email: null,
  is_owner: false,
  done_at: null,
};
const aliLine = {
  id: "l1",
  position: 0,
  section: "key_point",
  text: "Cost is a concern",
  evidence: [{ quote: "Not sure", lineNumber: 2, speaker: "Ali" }],
  supported: true,
  speaker_labels: ["Ali"],
  action_item_id: null,
  assignee: null,
};
const saraKeyPoint = {
  ...aliLine,
  id: "l2",
  position: 1,
  evidence: [{ quote: "Vercel", lineNumber: 1, speaker: "Sara" }],
};
const decision = {
  ...saraKeyPoint,
  id: "l3",
  position: 2,
  section: "decision",
};
const aliClaim = {
  speaker_label: "ali",
  display_label: "Ali",
  user_id: "p1",
  claimed_by: "self",
};

function setup(
  opts: {
    who?: typeof owner;
    deadline?: string;
    attestations?: unknown[];
    afterStatus?: string;
  } = {},
) {
  queue("meetings", meeting);
  queue(
    "minutes_reviews",
    review(opts.deadline),
    ok({ status: opts.afterStatus ?? "open" }),
  );
  queue("minutes_attesters", ok(opts.who ?? ali), ok([owner, ali]));
  queue("minutes_lines", ok([aliLine, saraKeyPoint, decision]));
  queue("minutes_speaker_claims", ok([aliClaim]));
  queue("minutes_attestations", ok(opts.attestations ?? []));
}

describe("POST /api/minutes/attest", () => {
  beforeEach(() => {
    resetQueues();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns 401 when signed out and 400 for a bad action", async () => {
    expect(
      (await post(null, { meetingId: "m1", action: "confirm" })).status,
    ).toBe(401);
    expect(
      (await post("p1", { meetingId: "m1", action: "approve" })).status,
    ).toBe(400);
  });

  it("returns 403 to a caller who is not an attester", async () => {
    queue("meetings", meeting);
    queue("minutes_reviews", review());
    queue("minutes_attesters", ok(null));
    expect(
      (await post("x", { meetingId: "m1", action: "confirm", lineId: "l1" }))
        .status,
    ).toBe(403);
  });

  it("returns 409 when the review is not open", async () => {
    queue("meetings", meeting);
    queue("minutes_reviews", review(undefined, "sealed"));
    queue("minutes_attesters", ok(ali));
    expect(
      (await post("p1", { meetingId: "m1", action: "confirm", lineId: "l1" }))
        .status,
    ).toBe(409);
  });

  it("confirms your own line", async () => {
    setup();
    const res = await post("p1", {
      meetingId: "m1",
      action: "confirm",
      lineId: "l1",
    });
    expect(res.status).toBe(200);
    const upsert = callsOf("minutes_attestations", "upsert")[0]
      .args[0] as Record<string, unknown>;
    expect(upsert).toMatchObject({
      line_id: "l1",
      user_id: "p1",
      action: "confirm",
      note: null,
      late: false,
    });
  });

  it("refuses to confirm someone else's line", async () => {
    setup();
    expect(
      (await post("p1", { meetingId: "m1", action: "confirm", lineId: "l2" }))
        .status,
    ).toBe(422);
  });

  it("needs a note of 1 to 500 characters for a correction", async () => {
    setup();
    expect(
      (
        await post("p1", {
          meetingId: "m1",
          action: "correct",
          lineId: "l1",
          note: "  ",
        })
      ).status,
    ).toBe(422);
    resetQueues();
    setup();
    expect(
      (
        await post("p1", {
          meetingId: "m1",
          action: "correct",
          lineId: "l1",
          note: "x".repeat(501),
        })
      ).status,
    ).toBe(422);
  });

  it("allows a view on any decision but not on another person's key point", async () => {
    setup();
    expect(
      (
        await post("p1", {
          meetingId: "m1",
          action: "view",
          lineId: "l3",
          note: "I objected",
        })
      ).status,
    ).toBe(200);
    resetQueues();
    setup();
    expect(
      (
        await post("p1", {
          meetingId: "m1",
          action: "view",
          lineId: "l2",
          note: "Hm",
        })
      ).status,
    ).toBe(422);
  });

  it("flags an answer after the deadline as late", async () => {
    setup({ deadline: "2000-01-01T00:00:00Z" });
    await post("p1", { meetingId: "m1", action: "confirm", lineId: "l1" });
    const upsert = callsOf("minutes_attestations", "upsert")[0].args[0] as {
      late: boolean;
    };
    expect(upsert.late).toBe(true);
  });

  it("puts the old answer back when the review closed meanwhile", async () => {
    const prior = {
      line_id: "l1",
      user_id: "p1",
      action: "confirm",
      note: null,
      late: false,
    };
    setup({ attestations: [prior], afterStatus: "sealing" });
    const res = await post("p1", {
      meetingId: "m1",
      action: "correct",
      lineId: "l1",
      note: "Fix",
    });
    expect(res.status).toBe(409);
    const upserts = callsOf("minutes_attestations", "upsert");
    expect(upserts).toHaveLength(2);
    expect(upserts[1].args[0]).toEqual(prior);
  });

  it("blocks Finish while a line of yours has no answer, then finishes", async () => {
    setup();
    const blocked = await post("p1", { meetingId: "m1", action: "finish" });
    expect(blocked.status).toBe(409);
    resetQueues();
    setup({
      attestations: [
        {
          line_id: "l1",
          user_id: "p1",
          action: "confirm",
          note: null,
          late: false,
        },
      ],
    });
    queue("minutes_attesters", ok([{ user_id: "p1" }]));
    expect(
      (await post("p1", { meetingId: "m1", action: "finish" })).status,
    ).toBe(200);
  });

  it("adopts your suggestion as a view on its decision", async () => {
    setup();
    queue(
      "minutes_dissent_suggestions",
      ok([
        {
          id: "s1",
          speaker_label: "Ali",
          position: "Too costly",
          related_line_id: "l3",
          status: "suggested",
        },
      ]),
    );
    const res = await post("p1", {
      meetingId: "m1",
      action: "view",
      suggestionId: "s1",
    });
    expect(res.status).toBe(200);
    const upsert = callsOf("minutes_attestations", "upsert")[0].args[0] as {
      line_id: string;
      note: string;
    };
    expect(upsert).toMatchObject({ line_id: "l3", note: "Too costly" });
    expect(callsOf("minutes_dissent_suggestions", "update")[0].args[0]).toEqual(
      { status: "adopted" },
    );
  });

  it("refuses someone else's suggestion", async () => {
    setup({ who: owner });
    queue(
      "minutes_dissent_suggestions",
      ok([
        {
          id: "s1",
          speaker_label: "Ali",
          position: "Too costly",
          related_line_id: "l3",
          status: "suggested",
        },
      ]),
    );
    expect(
      (
        await post("owner", {
          meetingId: "m1",
          action: "view",
          suggestionId: "s1",
        })
      ).status,
    ).toBe(403);
  });
});
