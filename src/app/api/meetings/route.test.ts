import { describe, it, expect, vi, beforeEach } from "vitest";
import { callsOf, ok, queue, resetQueues } from "@/test/supabase-queue-mock";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  clerkClient: async () => ({
    users: {
      getUserList: async () => ({
        data: [{ id: "u1", firstName: "Dana", lastName: "Khan", imageUrl: "" }],
      }),
    },
  }),
}));
vi.mock(
  "@/lib/supabase-server",
  async () => (await import("@/test/supabase-queue-mock")).supabaseServerModule,
);

import { GET } from "./route";

const list = (userId: string | null, query = "") => {
  mockAuth.mockResolvedValue({ userId });
  return GET(new Request(`http://localhost/api/meetings${query}`));
};
const row = (id: string, created_at: string, project_id: string | null) => ({
  id,
  title: id,
  status: "ended",
  started_at: null,
  ended_at: null,
  created_at,
  stream_call_id: `call_${id}`,
  project_id,
  meeting_insights: [],
});

describe("GET /api/meetings", () => {
  beforeEach(() => {
    resetQueues();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("rejects when not signed in", async () => {
    expect((await list(null)).status).toBe(401);
  });

  it("lists personal meetings only when the caller has no projects", async () => {
    queue("project_members", ok([]));
    queue("meetings", ok([row("m1", "2026-11-01", null)]));
    const body = await (await list("u1")).json();
    expect(body.meetings).toHaveLength(1);
    expect(body.meetings[0]).toMatchObject({
      id: "m1",
      projectId: null,
      role: null,
    });
    expect(callsOf("meetings", "in")).toHaveLength(0);
  });

  it("adds the meetings of active projects, newest first, deduped", async () => {
    queue("project_members", ok([{ project_id: "p1", role: "viewer" }]));
    queue(
      "meetings",
      ok([row("m1", "2026-11-01", null)]),
      ok([row("m2", "2026-11-02", "p1"), row("m1", "2026-11-01", null)]),
    );
    const body = await (await list("u1")).json();
    expect(body.meetings.map((m: { id: string }) => m.id)).toEqual([
      "m2",
      "m1",
    ]);
    expect(body.meetings[0]).toMatchObject({ projectId: "p1", role: "viewer" });
  });

  it("returns 404 for ?projectId= when the caller is not a member", async () => {
    queue("project_members", ok([]));
    expect((await list("u1", "?projectId=p9")).status).toBe(404);
  });

  it("narrows to one project with ?projectId=", async () => {
    queue("project_members", ok([{ project_id: "p1", role: "developer" }]));
    queue("meetings", ok([row("m2", "2026-11-02", "p1")]));
    const body = await (await list("u1", "?projectId=p1")).json();
    expect(body.meetings).toHaveLength(1);
    expect(body.meetings[0].projectId).toBe("p1");
  });

  describe("project list counts (AC-70d)", () => {
    const processed = {
      ...row("m2", "2026-11-02", "p1"),
      meeting_insights: [{ summary: "x".repeat(200) }],
    };

    it("adds the excerpt and counts, with proposals for a Developer", async () => {
      queue("project_members", ok([{ project_id: "p1", role: "developer" }]));
      queue("meetings", ok([processed]));
      queue("ledger_items", ok([{ meeting_id: "m2" }]));
      queue(
        "action_items",
        ok([
          { meeting_id: "m2", review_state: "proposed" },
          { meeting_id: "m2", review_state: "confirmed" },
          { meeting_id: "m2", review_state: "rejected" },
        ]),
      );
      const body = await (await list("u1", "?projectId=p1")).json();
      expect(body.meetings[0]).toMatchObject({
        decisionCount: 1,
        actionItemCount: 2,
        proposalCount: 1,
      });
      expect(body.meetings[0].summaryExcerpt).toHaveLength(163);
    });

    it("counts confirmed items only and omits proposals for a Viewer", async () => {
      queue("project_members", ok([{ project_id: "p1", role: "viewer" }]));
      queue("meetings", ok([processed]));
      queue("ledger_items", ok([]));
      queue(
        "action_items",
        ok([
          { meeting_id: "m2", review_state: "proposed" },
          { meeting_id: "m2", review_state: "confirmed" },
        ]),
      );
      const body = await (await list("u1", "?projectId=p1")).json();
      expect(body.meetings[0].actionItemCount).toBe(1);
      expect(body.meetings[0]).not.toHaveProperty("proposalCount");
    });
  });
});
