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
    new Request("http://localhost/api/minutes/claim", {
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
const openReview = ok({
  id: "r1",
  meeting_id: "m1",
  status: "open",
  deadline_at: "2099-01-01T00:00:00Z",
});
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
const raw = ok({
  raw_text: "Sara: We go with Vercel\nAli: Not sure\n10:30: noise",
});
const line = {
  id: "l1",
  position: 0,
  section: "decision",
  text: "Use Vercel",
  evidence: [{ quote: "Not sure", lineNumber: 2, speaker: "Ali" }],
  supported: true,
  speaker_labels: ["Ali"],
  action_item_id: null,
  assignee: null,
};

/** Access for `who`, then the review rows. */
function setup(
  who: typeof owner,
  claims: unknown[] = [],
  attestations: unknown[] = [],
) {
  queue("meetings", meeting);
  queue("minutes_reviews", openReview, ok({ status: "open" }));
  queue("minutes_attesters", ok(who), ok([owner, ali]));
  queue("transcripts", raw);
  queue("minutes_lines", ok([line]));
  queue("minutes_speaker_claims", ok(claims));
  queue("minutes_attestations", ok(attestations));
}

describe("POST /api/minutes/claim", () => {
  beforeEach(() => {
    resetQueues();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns 401 when signed out", async () => {
    expect(
      (
        await post(null, {
          meetingId: "m1",
          action: "claim",
          speakerLabel: "Ali",
        })
      ).status,
    ).toBe(401);
  });

  it("returns 403 to someone who is not an attester", async () => {
    queue("meetings", meeting);
    queue("minutes_reviews", openReview);
    queue("minutes_attesters", ok(null));
    expect(
      (
        await post("x", {
          meetingId: "m1",
          action: "claim",
          speakerLabel: "Ali",
        })
      ).status,
    ).toBe(403);
  });

  it("lets an attester claim a label by its key", async () => {
    setup(ali);
    const res = await post("p1", {
      meetingId: "m1",
      action: "claim",
      speakerLabel: "  ALI ",
    });
    expect(res.status).toBe(200);
    const insert = callsOf("minutes_speaker_claims", "insert")[0]
      .args[0] as Record<string, string>;
    expect(insert).toMatchObject({
      speaker_label: "ali",
      display_label: "Ali",
      user_id: "p1",
      claimed_by: "self",
    });
  });

  it("rejects a label that is not in the transcript, and timestamps", async () => {
    setup(ali);
    expect(
      (
        await post("p1", {
          meetingId: "m1",
          action: "claim",
          speakerLabel: "Bilal",
        })
      ).status,
    ).toBe(422);
    resetQueues();
    setup(ali);
    expect(
      (
        await post("p1", {
          meetingId: "m1",
          action: "claim",
          speakerLabel: "10:30",
        })
      ).status,
    ).toBe(422);
  });

  it("returns 409 for a label someone already holds", async () => {
    setup(ali, [
      {
        speaker_label: "ali",
        display_label: "Ali",
        user_id: "owner",
        claimed_by: "self",
      },
    ]);
    expect(
      (
        await post("p1", {
          meetingId: "m1",
          action: "claim",
          speakerLabel: "Ali",
        })
      ).status,
    ).toBe(409);
  });

  it("keeps assign and clear owner only", async () => {
    setup(ali);
    expect(
      (
        await post("p1", {
          meetingId: "m1",
          action: "assign",
          speakerLabel: "Ali",
          userId: "p1",
        })
      ).status,
    ).toBe(403);
  });

  it("returns 422 when the owner assigns to someone outside the review", async () => {
    setup(owner);
    expect(
      (
        await post("owner", {
          meetingId: "m1",
          action: "assign",
          speakerLabel: "Ali",
          userId: "nobody",
        })
      ).status,
    ).toBe(422);
  });

  it("refuses to clear a claim whose holder already answered", async () => {
    setup(
      owner,
      [
        {
          speaker_label: "ali",
          display_label: "Ali",
          user_id: "p1",
          claimed_by: "self",
        },
      ],
      [
        {
          line_id: "l1",
          user_id: "p1",
          action: "confirm",
          note: null,
          late: false,
        },
      ],
    );
    const res = await post("owner", {
      meetingId: "m1",
      action: "clear",
      speakerLabel: "Ali",
    });
    expect(res.status).toBe(409);
    expect(callsOf("minutes_speaker_claims", "delete")).toHaveLength(0);
  });

  it("undoes the claim when the review closed meanwhile", async () => {
    queue("meetings", meeting);
    queue("minutes_reviews", openReview, ok({ status: "sealing" }));
    queue("minutes_attesters", ok(ali), ok([owner, ali]));
    queue("transcripts", raw);
    queue("minutes_lines", ok([line]));
    queue("minutes_speaker_claims", ok([]));
    queue("minutes_attestations", ok([]));
    const res = await post("p1", {
      meetingId: "m1",
      action: "claim",
      speakerLabel: "Ali",
    });
    expect(res.status).toBe(409);
    expect(callsOf("minutes_speaker_claims", "delete")).toHaveLength(1);
  });

  it("puts a finished holder back to pending when the new label has unanswered lines", async () => {
    const doneAli = { ...ali, done_at: "2026-11-02T10:00:00Z" };
    queue("meetings", meeting);
    queue("minutes_reviews", openReview, ok({ status: "open" }));
    queue("minutes_attesters", ok(owner), ok([owner, doneAli]));
    queue("transcripts", raw);
    queue("minutes_lines", ok([line]));
    queue("minutes_speaker_claims", ok([]));
    queue("minutes_attestations", ok([]));
    const res = await post("owner", {
      meetingId: "m1",
      action: "assign",
      speakerLabel: "Ali",
      userId: "p1",
    });
    expect(res.status).toBe(200);
    const update = callsOf("minutes_attesters", "update");
    expect(update).toHaveLength(1);
    expect(update[0].args[0]).toEqual({ done_at: null });
  });
});
