import { describe, it, expect, vi, beforeEach } from "vitest";
import { callsOf, ok, queue, resetQueues } from "@/test/supabase-queue-mock";

const { mockAuth, mockSendReviewOpen, mockGetUser } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockSendReviewOpen: vi.fn(),
  mockGetUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  clerkClient: async () => ({ users: { getUser: mockGetUser } }),
}));
vi.mock(
  "@/lib/supabase-server",
  async () => (await import("@/test/supabase-queue-mock")).supabaseServerModule,
);
vi.mock("@/lib/email", () => ({ sendReviewOpenEmail: mockSendReviewOpen }));

import { POST } from "./route";

const post = (userId: string | null, body: Record<string, unknown>) => {
  mockAuth.mockResolvedValue({ userId });
  return POST(
    new Request("http://localhost/api/minutes/review", {
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
const draft = {
  version: 1,
  lines: [
    {
      section: "decision",
      text: "Use Vercel",
      evidence: [
        { quote: "We go with Vercel", lineNumber: 1, speaker: "Sara" },
      ],
      supported: true,
      speakerLabels: ["Sara"],
      actionItemId: null,
      assignee: null,
    },
  ],
  dissentSuggestions: [
    {
      speakerLabel: "Ali",
      topic: "Hosting",
      position: "Worried about cost",
      quote: "not sure",
      lineNumber: 2,
      relatedDecisionIndex: 0,
    },
  ],
  coverage: { lastLine: 2, totalLines: 2 },
};

describe("POST /api/minutes/review", () => {
  beforeEach(() => {
    resetQueues();
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockGetUser.mockResolvedValue({
      firstName: "Owner",
      lastName: null,
      primaryEmailAddress: { emailAddress: "o@example.com" },
    });
  });

  it("returns 401 when signed out", async () => {
    expect((await post(null, { meetingId: "m1", action: "open" })).status).toBe(
      401,
    );
  });

  it("returns 400 for an unknown action", async () => {
    expect(
      (await post("owner", { meetingId: "m1", action: "nope" })).status,
    ).toBe(400);
  });

  it("returns 404 to a stranger and 403 to a participant", async () => {
    queue("meetings", meeting, meeting);
    queue("attendance_events", ok([]), ok([{ user_id: "p1" }]));
    expect(
      (await post("stranger", { meetingId: "m1", action: "open" })).status,
    ).toBe(404);
    expect((await post("p1", { meetingId: "m1", action: "open" })).status).toBe(
      403,
    );
  });

  it("rejects a deadline other than 3 or 7", async () => {
    queue("meetings", meeting);
    expect(
      (
        await post("owner", {
          meetingId: "m1",
          action: "open",
          deadlineDays: 5,
        })
      ).status,
    ).toBe(422);
  });

  it("returns 409 when a review already exists", async () => {
    queue("meetings", meeting);
    queue("minutes_reviews", ok({ id: "r1", status: "open" }));
    expect(
      (await post("owner", { meetingId: "m1", action: "open" })).status,
    ).toBe(409);
  });

  it("returns 409 when there is no draft", async () => {
    queue("meetings", meeting);
    queue("meeting_insights", ok({ minutes_draft: null }));
    queue("transcripts", ok({ raw_text: "Sara: hi", source: "upload" }));
    const res = await post("owner", { meetingId: "m1", action: "open" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Process the meeting first" });
  });

  it("opens a review, freezes attesters without guests, and emails the others", async () => {
    queue("meetings", meeting);
    queue("minutes_reviews", ok(null), ok({ id: "r1" }));
    queue("meeting_insights", ok({ minutes_draft: draft }));
    queue(
      "transcripts",
      ok({
        raw_text: "Sara: We go with Vercel\nAli: not sure",
        source: "upload",
      }),
    );
    queue(
      "attendance_events",
      ok([
        {
          user_id: "p1",
          participant_name: "Ali",
          participant_email: "ali@example.com",
        },
        {
          user_id: "guest-x",
          participant_name: "Guest",
          participant_email: null,
        },
        { user_id: "owner", participant_name: "Sara", participant_email: null },
      ]),
    );
    queue(
      "minutes_lines",
      ok([{ id: "l1", position: 0, section: "decision" }]),
    );

    const res = await post("owner", {
      meetingId: "m1",
      action: "open",
      deadlineDays: 3,
    });
    expect(res.status).toBe(200);
    expect((await res.json()).reviewId).toBe("r1");

    const attesters = callsOf("minutes_attesters", "insert")[0]
      .args[0] as Array<{ user_id: string; is_owner: boolean }>;
    expect(attesters.map((a) => a.user_id)).toEqual(["owner", "p1"]);
    expect(attesters[0].is_owner).toBe(true);

    const suggestions = callsOf("minutes_dissent_suggestions", "insert")[0]
      .args[0] as Array<{ related_line_id: string }>;
    expect(suggestions[0].related_line_id).toBe("l1");

    expect(mockSendReviewOpen).toHaveBeenCalledTimes(1);
    expect(mockSendReviewOpen.mock.calls[0][0].to).toBe("o@example.com");
  });

  it("deletes the half made review when copying fails", async () => {
    queue("meetings", meeting);
    queue("minutes_reviews", ok(null), ok({ id: "r1" }));
    queue("meeting_insights", ok({ minutes_draft: draft }));
    queue("transcripts", ok({ raw_text: "Sara: hi", source: "upload" }));
    queue("attendance_events", ok([]));
    queue("minutes_lines", { data: null, error: { message: "boom" } });
    const res = await post("owner", { meetingId: "m1", action: "open" });
    expect(res.status).toBe(500);
    expect(callsOf("minutes_reviews", "delete")).toHaveLength(1);
    expect(mockSendReviewOpen).not.toHaveBeenCalled();
  });

  it("cancels an open review and refuses a sealed one", async () => {
    queue("meetings", meeting, meeting);
    queue(
      "minutes_reviews",
      ok({ id: "r1", status: "open" }),
      ok([{ id: "r1" }]),
      ok({ id: "r1", status: "sealed" }),
    );
    expect(
      (await post("owner", { meetingId: "m1", action: "cancel" })).status,
    ).toBe(200);
    const sealed = await post("owner", { meetingId: "m1", action: "cancel" });
    expect(sealed.status).toBe(409);
    expect(await sealed.json()).toEqual({
      error: "Sealed minutes can't be cancelled",
    });
  });

  describe("project meeting (manage need)", () => {
    const projectMeeting = ok({
      id: "m1",
      user_id: "creator",
      project_id: "p1",
      title: "Weekly",
      started_at: "2026-11-02T09:00:00Z",
      created_at: null,
    });

    const openAs = (userId: string) =>
      post(userId, { meetingId: "m1", action: "cancel" });

    it("returns 404 to a non member", async () => {
      queue("meetings", projectMeeting);
      queue("project_members", ok(null));
      const res = await openAs("stranger");
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Meeting not found" });
    });

    it("returns 403 to a Viewer and to a Developer", async () => {
      queue("meetings", projectMeeting, projectMeeting);
      queue(
        "project_members",
        ok({ role: "viewer" }),
        ok({ role: "developer" }),
      );
      const viewer = await openAs("v1");
      expect(viewer.status).toBe(403);
      expect(await viewer.json()).toEqual({ error: "Not authorized" });
      expect((await openAs("d1")).status).toBe(403);
    });

    it("lets an Admin who did not create the meeting cancel the review", async () => {
      queue("meetings", projectMeeting);
      queue("project_members", ok({ role: "admin" }));
      queue(
        "minutes_reviews",
        ok({ id: "r1", status: "open" }),
        ok([{ id: "r1" }]),
      );
      const res = await openAs("a1");
      expect(res.status).toBe(200);
      expect(callsOf("minutes_reviews", "delete")).toHaveLength(1);
    });
  });
});
