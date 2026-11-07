import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { notify, projectAdminIds } = vi.hoisted(() => ({
  notify: vi.fn(async () => 1),
  projectAdminIds: vi.fn(async () => ["owner", "admin"]),
}));
vi.mock("@/lib/notifications", () => ({ notify, projectAdminIds }));
const findUserIdsByInviteEmail = vi.hoisted(() => vi.fn());
vi.mock("@/lib/invitations", () => ({ findUserIdsByInviteEmail }));

import { client, queue, ok, resetQueues } from "@/test/supabase-queue-mock";
import {
  notifyJoinApproved,
  notifyJoinRequest,
  notifyKeptSuggestions,
  notifyMemberJoined,
  notifyProjectInvitation,
  notifyMemberRoleChanged,
  notifyMergeCompleted,
  notifyProposalsReady,
  notifyPrReviewRequested,
  notifyRevertReopened,
  notifyTaskAssigned,
} from "./notification-events";
import type { SupabaseClient } from "@supabase/supabase-js";

const supabase = client as unknown as SupabaseClient;

const taskRow = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  project_id: "p1",
  number: 7,
  title: "Fix login",
  assignee_id: "user_a",
  completion_evidence: "https://github.com/o/r/pull/9",
  ...over,
});

const queueTask = (over: Record<string, unknown> = {}) => {
  queue("tasks", ok(taskRow(over)));
  queue("projects", ok({ task_prefix: "NM" }));
};

const sent = () => notify.mock.calls.map((c) => (c as unknown[])[1]);

beforeEach(() => {
  resetQueues();
  notify.mockClear();
  projectAdminIds.mockClear();
});

describe("notifyTaskAssigned", () => {
  it("writes the spec's title, body, link, and key", async () => {
    queueTask();
    await notifyTaskAssigned(supabase, "t1", 3, "user_b");
    expect(sent()).toEqual([
      {
        userIds: ["user_a"],
        projectId: "p1",
        kind: "task_assigned",
        title: "You were assigned NM-7",
        body: "Fix login",
        link: "/projects/p1?tab=tasks&task=t1",
        dedupeKey: "task_assigned:t1:3",
      },
    ]);
  });

  it("stays quiet when you assign yourself", async () => {
    queueTask();
    await notifyTaskAssigned(supabase, "t1", 1, "user_a");
    expect(notify).not.toHaveBeenCalled();
  });

  it("stays quiet with no assignee", async () => {
    queueTask({ assignee_id: null });
    await notifyTaskAssigned(supabase, "t1", 1, "user_b");
    expect(notify).not.toHaveBeenCalled();
  });

  it("never throws when a read fails", async () => {
    queue("tasks", { data: null, error: new Error("down") });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      notifyTaskAssigned(supabase, "t1", 1, "user_b"),
    ).resolves.toBeUndefined();
    errorLog.mockRestore();
  });
});

describe("notifyProposalsReady", () => {
  const input = {
    projectId: "p1",
    meetingId: "m1",
    meetingTitle: "Sprint sync",
    count: 3,
    processedAt: "2026-11-07T10:00:00.000Z",
  };

  it("tells the Owner and Admins, keyed on the processing time", async () => {
    await notifyProposalsReady(supabase, input);
    expect(sent()[0]).toMatchObject({
      userIds: ["owner", "admin"],
      title: "3 task proposals to review",
      body: "Sprint sync",
      link: "/projects/p1?tab=tasks",
      dedupeKey: "proposals_ready:m1:2026-11-07T10:00:00.000Z",
    });
  });

  it("writes nothing when no proposal was written", async () => {
    await notifyProposalsReady(supabase, { ...input, count: 0 });
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("join notices", () => {
  it("tells the Owner and Admins about a request", async () => {
    queue("projects", ok({ name: "Apollo" }));
    await notifyJoinRequest(supabase, {
      projectId: "p1",
      requestId: "r1",
      name: "Sana",
    });
    expect(sent()[0]).toMatchObject({
      userIds: ["owner", "admin"],
      kind: "join_request",
      title: "Sana asked to join Apollo",
      body: "Review it on the Members tab.",
      link: "/projects/p1?tab=members",
      dedupeKey: "join_request:r1",
    });
  });

  it("tells the requester about an approval", async () => {
    queue("projects", ok({ name: "Apollo" }));
    await notifyJoinApproved(supabase, {
      projectId: "p1",
      requestId: "r1",
      userId: "user_a",
      role: "developer",
    });
    expect(sent()[0]).toMatchObject({
      userIds: ["user_a"],
      kind: "join_approved",
      title: "You joined Apollo",
      body: "Your role is developer.",
      link: "/projects/p1",
      dedupeKey: "join_approved:r1",
    });
  });
});

describe("notifyMergeCompleted", () => {
  it("keys on the merge sha of the completing PR", async () => {
    queueTask();
    queue("task_links", ok([{ merge_sha: "abc123", pr_number: 9 }]));
    await notifyMergeCompleted(supabase, "t1");
    expect(sent()[0]).toMatchObject({
      userIds: ["user_a"],
      kind: "task_completed_by_merge",
      title: "NM-7 completed by a merge",
      dedupeKey: "task_completed_by_merge:t1:abc123",
    });
  });

  it("falls back to the PR number when the sha is null", async () => {
    queueTask();
    queue("task_links", ok([{ merge_sha: null, pr_number: 9 }]));
    await notifyMergeCompleted(supabase, "t1");
    expect(sent()[0]).toMatchObject({
      dedupeKey: "task_completed_by_merge:t1:9",
    });
  });

  it("stays quiet on an unassigned task", async () => {
    queueTask({ assignee_id: null });
    await notifyMergeCompleted(supabase, "t1");
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("notifyRevertReopened", () => {
  it("keys on the revert PR", async () => {
    queueTask();
    await notifyRevertReopened(supabase, "t1", 12);
    expect(sent()[0]).toMatchObject({
      userIds: ["user_a"],
      kind: "task_reopened_by_revert",
      title: "NM-7 reopened by a revert",
      dedupeKey: "task_reopened_by_revert:t1:12",
    });
  });
});

describe("notifyKeptSuggestions", () => {
  it("sends one notice per suggested ledger link", async () => {
    queue("task_links", ok([{ id: "l1" }]));
    queue("ledger_links", ok([{ id: "k1" }, { id: "k2" }]));
    queueTask();
    await notifyKeptSuggestions(supabase, "t1");
    expect(sent().map((n) => (n as { dedupeKey: string }).dedupeKey)).toEqual([
      "kept_suggestion:k1",
      "kept_suggestion:k2",
    ]);
    expect(sent()[0]).toMatchObject({
      userIds: ["owner", "admin"],
      title: "A merge may keep a promise",
      body: "NM-7: check it in Decisions and Promises.",
      link: "/projects/p1?tab=promises",
    });
  });

  it("does nothing without a suggested link", async () => {
    queue("task_links", ok([{ id: "l1" }]));
    queue("ledger_links", ok([]));
    await notifyKeptSuggestions(supabase, "t1");
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("notifyPrReviewRequested (AC-71b)", () => {
  const input = {
    projectId: "p1",
    repoId: 100,
    repoFullName: "acme/app",
    prNumber: 9,
    githubUserId: 7,
  };

  it("does nothing for a GitHub account nobody linked", async () => {
    await notifyPrReviewRequested(supabase, input);
    expect(notify).not.toHaveBeenCalled();
  });

  it("does nothing for a Viewer", async () => {
    queue("user_settings", ok({ user_id: "u1" }));
    queue("project_members", ok({ role: "viewer" }));
    await notifyPrReviewRequested(supabase, input);
    expect(notify).not.toHaveBeenCalled();
  });

  it("tells a linked Developer, in app only", async () => {
    queue("user_settings", ok({ user_id: "u1" }));
    queue("project_members", ok({ role: "developer" }));
    await notifyPrReviewRequested(supabase, input);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(sent()[0]).toMatchObject({
      userIds: ["u1"],
      kind: "pr_review_requested",
      body: "acme/app #9",
      link: "/projects/p1?tab=github",
      dedupeKey: "pr_review:100:9:7",
      email: false,
    });
  });
});

describe("notifyMemberRoleChanged", () => {
  it("tells only the member, with no email", async () => {
    queue("projects", ok({ name: "Apollo" }));
    await notifyMemberRoleChanged(supabase, {
      projectId: "p1",
      userId: "u2",
      role: "admin",
      auditId: "a1",
    });
    expect(sent()[0]).toMatchObject({
      userIds: ["u2"],
      kind: "member_role_changed",
      email: false,
    });
  });
});

describe("notifyMemberJoined", () => {
  const joined = (over: Record<string, unknown> = {}) =>
    notifyMemberJoined(supabase, {
      projectId: "p1",
      userId: "u2",
      name: "Bilal",
      role: "developer",
      actorId: "u2",
      ...over,
    });

  it("tells the Owner and Admins, with no email", async () => {
    queue("projects", ok({ name: "Apollo" }));
    queue("project_members", ok({ joined_at: "2026-11-07T00:00:00Z" }));
    await joined();
    expect(sent()[0]).toMatchObject({
      userIds: ["owner", "admin"],
      kind: "member_joined",
      email: false,
    });
  });

  it("skips the person who approved", async () => {
    queue("projects", ok({ name: "Apollo" }));
    queue("project_members", ok({ joined_at: "2026-11-07T00:00:00Z" }));
    await joined({ actorId: "admin" });
    expect(sent()[0]).toMatchObject({ userIds: ["owner"] });
  });
});

describe("notifyProjectInvitation", () => {
  const input = {
    projectId: "p1",
    invitationId: "i1",
    email: "b@x.com",
    role: "developer" as const,
  };

  it("tells people with that email, in app only, skipping members", async () => {
    queue("projects", ok({ name: "Core" }));
    findUserIdsByInviteEmail.mockResolvedValue(["u2", "u3"]);
    queue("project_members", ok([{ user_id: "u3" }]));
    await notifyProjectInvitation(client as unknown as SupabaseClient, input);
    expect(notify).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userIds: ["u2"],
        kind: "project_invitation",
        title: "You were invited to Core",
        body: "Your role would be Developer.",
        link: "/projects",
        dedupeKey: "project_invitation:i1",
        email: false,
      }),
    );
  });

  it("sends nothing when nobody has that email yet", async () => {
    queue("projects", ok({ name: "Core" }));
    findUserIdsByInviteEmail.mockResolvedValue([]);
    await notifyProjectInvitation(client as unknown as SupabaseClient, input);
    expect(notify).not.toHaveBeenCalled();
  });

  it("never throws when the lookup fails", async () => {
    queue("projects", ok({ name: "Core" }));
    findUserIdsByInviteEmail.mockRejectedValue(new Error("clerk down"));
    await expect(
      notifyProjectInvitation(client as unknown as SupabaseClient, input),
    ).resolves.toBeUndefined();
  });
});
