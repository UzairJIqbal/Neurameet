import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAuth, mockGetUserList, mockEmbedTexts } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockGetUserList: vi.fn(async () => ({ data: [] })),
  mockEmbedTexts: vi.fn(async () => [[0.1, 0.2]]),
}));

vi.mock("server-only", () => ({}));
// after() throws outside a request; the notices it runs are tested on their own.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: () => {},
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  clerkClient: async () => ({ users: { getUserList: mockGetUserList } }),
}));
vi.mock(
  "@/lib/supabase-server",
  async () => (await import("@/test/supabase-queue-mock")).supabaseServerModule,
);
vi.mock("@/agent/embed", () => ({ embedTexts: mockEmbedTexts }));

import {
  queue,
  ok,
  resetQueues,
  callsOf,
  calls,
} from "@/test/supabase-queue-mock";
import { HIDDEN_COLUMNS, viewerLeaks } from "@/test/viewer-walk";
import { GET as getTask, PATCH as patchTask } from "./[id]/route";
import {
  GET as listTasks,
  POST as createTask,
} from "../projects/[id]/tasks/route";
import { GET as listProposals } from "../projects/[id]/proposals/route";
import { POST as reviewProposal } from "../proposals/[id]/review/route";
import { POST as moveMeeting } from "../meetings/[id]/project/route";

const P = "p1";
const T = "t1";
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (body?: unknown, url = "http://localhost/api/x", method = "POST") =>
  new Request(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const role = (r: string | null) =>
  queue("project_members", ok(r ? { role: r } : null));
const fail = (message: string) => ({ data: null, error: { message } });

const head = (over: Record<string, unknown> = {}) => ({
  id: T,
  project_id: P,
  status: "todo",
  assignee_id: null,
  version: 2,
  position: 1,
  ...over,
});
const taskRow = (over: Record<string, unknown> = {}) => ({
  id: T,
  project_id: P,
  number: 7,
  title: "Fix login",
  description: null,
  status: "todo",
  position: 1,
  assignee_id: null,
  due_date: null,
  source_meeting_id: null,
  completion_kind: null,
  completed_at: null,
  version: 3,
  created_at: "2026-11-03",
  updated_at: "2026-11-03",
  ...over,
});
/** readTask: the row, then the project's prefix. */
const queueReadTask = (over: Record<string, unknown> = {}) => {
  queue("tasks", ok(taskRow(over)));
  queue("projects", ok({ task_prefix: "NM" }));
};

beforeEach(() => {
  vi.clearAllMocks();
  resetQueues();
  mockAuth.mockResolvedValue({ userId: "u1" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("PATCH /api/tasks/[id]", () => {
  const patch = (body: unknown) =>
    patchTask(req(body, undefined, "PATCH"), params(T));

  it("needs ifVersion", async () => {
    const res = await patch({ status: "in_progress" });
    expect(res.status).toBe(422);
  });

  it("refuses a Viewer with 403", async () => {
    queue("tasks", ok(head()));
    role("viewer");
    const res = await patch({ status: "in_progress", ifVersion: 2 });
    expect(res.status).toBe(403);
    expect(callsOf("rpc:update_task", "rpc")).toHaveLength(0);
  });

  it("refuses a Developer moving someone else's task", async () => {
    queue("tasks", ok(head({ assignee_id: "u2" })));
    role("developer");
    const res = await patch({ status: "in_progress", ifVersion: 2 });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(
      "You can only change your own or unassigned tasks",
    );
  });

  it("returns 409 with the fresh task when the version is stale", async () => {
    queue("tasks", ok(head({ version: 3 })));
    role("developer");
    queueReadTask();
    const res = await patch({ status: "in_progress", ifVersion: 2 });
    expect(res.status).toBe(409);
    expect((await res.json()).task).toMatchObject({ key: "NM-7", version: 3 });
    expect(callsOf("rpc:update_task", "rpc")).toHaveLength(0);
  });

  it("needs evidence to complete a task", async () => {
    queue("tasks", ok(head()));
    role("developer");
    const res = await patch({
      status: "completed",
      ifVersion: 2,
      completionEvidence: "  ",
    });
    expect(res.status).toBe(422);
  });

  it("maps a stale rpc to 409", async () => {
    queue("tasks", ok(head()));
    role("admin");
    queue("rpc:update_task", fail("stale"));
    queueReadTask();
    const res = await patch({ status: "blocked", ifVersion: 2 });
    expect(res.status).toBe(409);
  });

  it("updates and renumbers the column when the drop is too tight", async () => {
    queue("tasks", ok(head()));
    role("developer");
    queue("rpc:update_task", ok(null));
    // renumberIfTight: head again, then the neighbours below and above.
    queue(
      "tasks",
      ok(head({ position: 1.0000001 })),
      ok([{ position: 1 }]),
      ok([]),
    );
    queueReadTask({ status: "in_progress", version: 3 });
    const res = await patch({
      status: "in_progress",
      position: 1.0000001,
      ifVersion: 2,
    });
    expect(res.status).toBe(200);
    expect((await res.json()).task.status).toBe("in_progress");
    expect(callsOf("rpc:update_task", "rpc")[0].args[0]).toMatchObject({
      p_task: T,
      p_actor: "u1",
      p_if_version: 2,
      p_patch: { status: "in_progress", position: 1.0000001 },
    });
    expect(callsOf("rpc:renumber_task_column", "rpc")).toHaveLength(1);
  });

  it("does not renumber when the gap is wide", async () => {
    queue("tasks", ok(head()));
    role("developer");
    queue(
      "tasks",
      ok(head({ position: 1.5 })),
      ok([{ position: 1 }]),
      ok([{ position: 2 }]),
    );
    queueReadTask();
    const res = await patch({ position: 1.5, ifVersion: 2 });
    expect(res.status).toBe(200);
    expect(callsOf("rpc:renumber_task_column", "rpc")).toHaveLength(0);
  });

  it("returns 404 to a non member", async () => {
    queue("tasks", ok(head()));
    role(null);
    const res = await patch({ status: "blocked", ifVersion: 2 });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/tasks/[id]", () => {
  // The Outcome card's own read of the task, typed by hand with no source.
  const queueOutcomeTask = () =>
    queue("tasks", ok({ project_id: P, source_action_item_id: null }));

  it("hides the quote from a Viewer's Proof Chain and events", async () => {
    queue("tasks", ok(head()));
    role("viewer");
    queueReadTask({ source_meeting_id: "m1" });
    queueOutcomeTask();
    queue(
      "task_events",
      ok([
        {
          id: "e1",
          kind: "created",
          actor_id: "u1",
          from_value: null,
          to_value: null,
          detail: { quote: "I will fix it" },
          created_at: "2026-11-03",
        },
      ]),
    );
    queue("meetings", ok({ title: "Standup" }));
    const res = await getTask(req(undefined, undefined, "GET"), params(T));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.proofChain).toEqual({
      meetingId: "m1",
      meetingTitle: "Standup",
    });
    expect(body.events[0].detail).toEqual({});
    expect(callsOf("tasks", "select")[1].args[0]).not.toMatch(/quote/);
  });

  const COMMENT = {
    id: "c1",
    author_id: "gone",
    body: "Looks good",
    created_at: "2026-11-05",
  };
  const COMMENTED = {
    id: "e2",
    kind: "commented",
    actor_id: "u1",
    from_value: null,
    to_value: null,
    detail: {},
    created_at: "2026-11-05",
  };

  it("gives a Developer the comments, with a removed author as Former member", async () => {
    queue("tasks", ok(head()));
    role("developer");
    queueReadTask();
    queueOutcomeTask();
    queue("task_events", ok([COMMENTED]));
    queue("task_comments", ok([COMMENT]));
    const body = await (
      await getTask(req(undefined, undefined, "GET"), params(T))
    ).json();
    expect(body.comments).toEqual([
      {
        id: "c1",
        authorId: "gone",
        authorName: "Former member",
        body: "Looks good",
        createdAt: "2026-11-05",
      },
    ]);
    expect(body.commentsTruncated).toBe(false);
    expect(body.projectId).toBe(P);
  });

  it("says when older comments were left out", async () => {
    queue("tasks", ok(head()));
    role("developer");
    queueReadTask();
    queueOutcomeTask();
    queue("task_events", ok([]));
    queue(
      "task_comments",
      ok(Array.from({ length: 51 }, (_, i) => ({ ...COMMENT, id: `c${i}` }))),
    );
    const body = await (
      await getTask(req(undefined, undefined, "GET"), params(T))
    ).json();
    expect(body.comments).toHaveLength(50);
    expect(body.commentsTruncated).toBe(true);
  });

  it("never gives a Viewer comments, the flag, or a commented event", async () => {
    queue("tasks", ok(head()));
    role("viewer");
    queueReadTask();
    queueOutcomeTask();
    queue("task_events", ok([COMMENTED]));
    const body = await (
      await getTask(req(undefined, undefined, "GET"), params(T))
    ).json();
    expect(body).not.toHaveProperty("comments");
    expect(body).not.toHaveProperty("commentsTruncated");
    expect(body.events).toEqual([]);
    expect(callsOf("task_comments", "select")).toEqual([]);
  });

  const LINK = {
    id: "l1",
    state: "merged",
    merged_at: "2026-11-03",
    reverted_at: null,
    repo_full_name: "acme/secret",
    pr_number: 7,
    pr_title: "Secret title",
    pr_url: "https://github.com/acme/secret/pull/7",
  };

  it("gives a Viewer the PR state only, even from a wider row", async () => {
    queue("tasks", ok(head()));
    role("viewer");
    queueReadTask({ completion_kind: "merge" });
    queueOutcomeTask();
    queue("task_events", ok([]));
    queue("task_links", ok([LINK]));
    const res = await getTask(req(undefined, undefined, "GET"), params(T));
    const body = await res.json();
    expect(body.prLinks).toEqual([
      { id: "l1", state: "merged", merged: true, reverted: false },
    ]);
    expect(callsOf("task_links", "select")[0].args[0]).not.toMatch(
      /repo_full_name|pr_title|pr_url|pr_number/,
    );
    expect(callsOf("tasks", "select")[1].args[0]).not.toMatch(
      /completion_evidence/,
    );
    expect(JSON.stringify(body)).not.toMatch(/secret/i);
  });

  it("passes the Viewer walk with an outcome, and never reads a hidden column", async () => {
    queue("tasks", ok(head()));
    role("viewer");
    queueReadTask({
      completion_kind: "merge",
      source_action_item_id: "a1",
      source_meeting_id: "m1",
    });
    queue("tasks", ok({ project_id: P, source_action_item_id: "a1" }));
    queue("task_events", ok([]));
    queue("task_links", ok([LINK]));
    queue("action_items", ok([]));
    queue(
      "task_links",
      ok([
        {
          task_id: T,
          state: "merged",
          closes: true,
          base_ref: "main",
          repo_id: 1,
          merged_at: "2026-11-03",
          reverted_at: null,
        },
      ]),
    );
    queue("github_repos", ok([{ repo_id: 1, default_branch: "main" }]));
    const body = await (
      await getTask(req(undefined, undefined, "GET"), params(T))
    ).json();
    expect(viewerLeaks(body)).toEqual([]);
    expect(body.outcome).toMatchObject({
      said: { state: "hidden" },
      shipped: { state: "merged" },
    });
    for (const table of ["tasks", "task_links"]) {
      for (const call of callsOf(table, "select").slice(
        table === "tasks" ? 1 : 0,
      )) {
        expect(String(call.args[0])).not.toMatch(HIDDEN_COLUMNS);
      }
    }
  });

  it("gives a Developer the repo, number, title, and link", async () => {
    queue("tasks", ok(head()));
    role("developer");
    queueReadTask();
    queueOutcomeTask();
    queue("task_events", ok([]));
    queue("task_links", ok([LINK]));
    const res = await getTask(req(undefined, undefined, "GET"), params(T));
    expect((await res.json()).prLinks[0]).toEqual({
      id: "l1",
      state: "merged",
      merged: true,
      reverted: false,
      repoFullName: "acme/secret",
      prNumber: 7,
      prTitle: "Secret title",
      prUrl: "https://github.com/acme/secret/pull/7",
    });
  });
});

describe("GET /api/projects/[id]/tasks", () => {
  const list = (q = "") =>
    listTasks(req(undefined, `http://localhost/x${q}`, "GET"), params(P));

  it("returns every column and flags a truncated one", async () => {
    role("developer");
    queue("projects", ok({ task_prefix: "NM" }));
    queue(
      "tasks",
      { data: [taskRow()], error: null, count: 250 },
      ok([]),
      ok([]),
      ok([]),
      ok([]),
    );
    const res = await list();
    const body = await res.json();
    expect(body.tasks).toHaveLength(1);
    expect(body.truncated).toEqual({ todo: 250 });
  });

  it("searches by task key", async () => {
    role("viewer");
    queue("projects", ok({ task_prefix: "NM" }));
    await list("?q=nm-12&assigneeId=none");
    const eqs = callsOf("tasks", "eq").map((c) => c.args);
    expect(eqs).toContainEqual(["number", 12]);
    expect(callsOf("tasks", "is").map((c) => c.args)).toContainEqual([
      "assignee_id",
      null,
    ]);
    expect(callsOf("tasks", "ilike")).toHaveLength(0);
  });

  it("escapes wildcards in a title search", async () => {
    role("developer");
    queue("projects", ok({ task_prefix: "NM" }));
    await list("?q=50%25_off");
    expect(callsOf("tasks", "ilike")[0].args).toEqual([
      "title",
      "%50\\%\\_off%",
    ]);
  });

  it("returns 404 to an outsider", async () => {
    role(null);
    expect((await list()).status).toBe(404);
  });
});

describe("POST /api/projects/[id]/tasks", () => {
  const create = (body: unknown) => createTask(req(body), params(P));

  it("refuses a Viewer with 403", async () => {
    role("viewer");
    expect((await create({ title: "Fix" })).status).toBe(403);
  });

  it("refuses an assignee who is not a member", async () => {
    role("developer");
    queue("project_members", ok([{ user_id: "u1" }]));
    expect((await create({ title: "Fix", assigneeId: "u9" })).status).toBe(422);
  });

  it("creates the task with its title vector", async () => {
    role("developer");
    queue("rpc:create_project_task", ok({ id: T }));
    queueReadTask();
    const res = await create({ title: "  Fix login ", dueDate: "2026-11-10" });
    expect(res.status).toBe(201);
    expect((await res.json()).task.key).toBe("NM-7");
    expect(callsOf("rpc:create_project_task", "rpc")[0].args[0]).toMatchObject({
      p_project: P,
      p_title: "Fix login",
      p_due: "2026-11-10",
      p_embedding: [0.1, 0.2],
      p_actor: "u1",
    });
  });
});

describe("GET /api/projects/[id]/proposals", () => {
  const list = () => listProposals(req(undefined, undefined, "GET"), params(P));

  it("refuses a Viewer with 403", async () => {
    role("viewer");
    expect((await list()).status).toBe(403);
  });

  it("shows a Developer read only proposals with a live duplicate", async () => {
    role("developer");
    queue(
      "meetings",
      ok([{ id: "m1", title: "Standup", started_at: "2026-11-02" }]),
    );
    queue(
      "action_items",
      ok([
        {
          id: "a1",
          meeting_id: "m1",
          title: "Fix login",
          assignee: "Ali",
          due_date: null,
          quote: "I will fix login",
          quote_speaker: "Ali",
          quote_line: 3,
          quote_verified: true,
          proposed_assignee_id: "u9",
          duplicate_of_task_id: T,
          duplicate_score: 0.91,
        },
      ]),
    );
    queue("project_members", ok([{ user_id: "u1" }]));
    queue("projects", ok({ task_prefix: "NM" }));
    queue("tasks", ok([{ id: T, number: 7, title: "Login bug" }]));
    const body = await (await list()).json();
    expect(body.canReview).toBe(false);
    expect(body.proposals[0]).toMatchObject({
      meetingTitle: "Standup",
      proposedAssigneeId: null,
      duplicate: { taskId: T, key: "NM-7", score: 0.91 },
    });
    expect(callsOf("action_items", "select")[0].args[0]).not.toMatch(
      /embedding/,
    );
  });
});

describe("task priority and board fields", () => {
  const board = (url = "http://localhost/api/x") =>
    listTasks(req(undefined, url, "GET"), params(P));
  const queueEmptyColumns = (rows: Record<string, unknown>[] = []) => {
    queue("projects", ok({ task_prefix: "NM" }));
    queue(
      "tasks",
      ok(rows),
      ok([]),
      ok([]),
      ok([]),
      ok([]),
      ok([{ id: T, task_comments: [{ count: 2 }] }]),
    );
  };

  it("refuses a bad priority or status filter with 422", async () => {
    role("viewer");
    expect((await board("http://localhost/api/x?priority=soon")).status).toBe(
      422,
    );
    role("viewer");
    expect((await board("http://localhost/api/x?status=later")).status).toBe(
      422,
    );
  });

  it("filters on priority inside the query", async () => {
    role("developer");
    queueEmptyColumns();
    const res = await board("http://localhost/api/x?priority=high");
    expect(res.status).toBe(200);
    expect(
      callsOf("tasks", "eq").some(
        (call) => call.args[0] === "priority" && call.args[1] === "high",
      ),
    ).toBe(true);
  });

  it("gives a Developer comment counts and PR refs, a Viewer neither", async () => {
    role("developer");
    queueEmptyColumns([taskRow()]);
    queue(
      "task_links",
      ok([
        {
          task_id: T,
          repo_full_name: "acme/app",
          pr_number: 7,
          pr_url: "https://github.com/acme/app/pull/7",
          state: "merged",
          reverted_at: null,
        },
      ]),
    );
    const dev = await (await board()).json();
    expect(dev.tasks[0].commentCount).toBe(2);
    expect(dev.tasks[0].prRefs[0].prNumber).toBe(7);

    resetQueues();
    role("viewer");
    queueEmptyColumns([taskRow()]);
    const viewer = await (await board()).json();
    expect(viewer.tasks[0]).not.toHaveProperty("commentCount");
    expect(viewer.tasks[0]).not.toHaveProperty("prRefs");
  });

  it("saves a chosen priority on create and refuses a bad one", async () => {
    role("developer");
    queue("rpc:create_project_task", ok({ id: T }));
    queue("tasks", ok(null));
    queueReadTask({ priority: "low" });
    const res = await createTask(
      req({ title: "New", priority: "low" }),
      params(P),
    );
    expect((await res.json()).task.priority).toBe("low");
    expect(callsOf("tasks", "update")[0].args[0]).toEqual({ priority: "low" });

    role("developer");
    expect(
      (await createTask(req({ title: "New", priority: "soon" }), params(P)))
        .status,
    ).toBe(422);
  });

  it("refuses a bad priority on PATCH", async () => {
    const res = await patchTask(
      req(
        { priority: "soon", ifVersion: 2 },
        "http://localhost/api/x",
        "PATCH",
      ),
      params(T),
    );
    expect(res.status).toBe(422);
  });
});

describe("POST /api/proposals/[id]/review", () => {
  const review = (body: unknown) => reviewProposal(req(body), params("a1"));
  const proposal = () => {
    queue(
      "action_items",
      ok({ id: "a1", title: "Fix login", meeting_id: "m1" }),
    );
    queue("meetings", ok({ project_id: P }));
  };

  it("refuses a Developer with 403", async () => {
    proposal();
    role("developer");
    expect((await review({ decision: "reject" })).status).toBe(403);
  });

  it("returns 404 for a personal meeting's item", async () => {
    queue(
      "action_items",
      ok({ id: "a1", title: "Fix login", meeting_id: "m1" }),
    );
    queue("meetings", ok({ project_id: null }));
    expect((await review({ decision: "reject" })).status).toBe(404);
  });

  it("maps already_decided to 409 and quote_unverified to 422", async () => {
    proposal();
    role("admin");
    queue("rpc:review_proposal", fail("already_decided"));
    expect((await review({ decision: "reject" })).status).toBe(409);

    proposal();
    role("admin");
    queue("rpc:review_proposal", fail("quote_unverified"));
    expect((await review({ decision: "confirm" })).status).toBe(422);
  });

  it("needs a target to merge", async () => {
    expect((await review({ decision: "merge" })).status).toBe(422);
  });

  it("confirms with an edited title and returns the task", async () => {
    proposal();
    role("owner");
    queue("rpc:review_proposal", ok({ taskId: T }));
    queueReadTask();
    const res = await review({
      decision: "confirm",
      title: "Fix the login bug",
      assigneeId: "u2",
    });
    expect((await res.json()).task.key).toBe("NM-7");
    expect(callsOf("rpc:review_proposal", "rpc")[0].args[0]).toMatchObject({
      p_item: "a1",
      p_decision: "confirm",
      p_title: "Fix the login bug",
      p_assignee: "u2",
      p_assignee_given: true,
      p_embedding: [0.1, 0.2],
      p_confirm_without_quote: false,
    });
  });

  it("sets a chosen priority on the new task, and refuses an unknown one", async () => {
    proposal();
    role("owner");
    queue("rpc:review_proposal", ok({ taskId: T }));
    queue("tasks", ok(null));
    queueReadTask({ priority: "urgent" });
    const res = await review({ decision: "confirm", priority: "urgent" });
    expect((await res.json()).task.priority).toBe("urgent");
    expect(callsOf("tasks", "update")[0].args[0]).toEqual({
      priority: "urgent",
    });

    expect(
      (await review({ decision: "confirm", priority: "soon" })).status,
    ).toBe(422);
  });

  it("leaves a task at Medium without a write when no priority is chosen", async () => {
    proposal();
    role("owner");
    queue("rpc:review_proposal", ok({ taskId: T }));
    queueReadTask();
    await review({ decision: "confirm" });
    expect(callsOf("tasks", "update")).toHaveLength(0);
  });

  it("reuses the stored vector when the title is unchanged", async () => {
    proposal();
    role("owner");
    queue("rpc:review_proposal", ok({ taskId: T }));
    queueReadTask();
    await review({ decision: "confirm", title: "Fix login" });
    expect(mockEmbedTexts).not.toHaveBeenCalled();
    expect(callsOf("rpc:review_proposal", "rpc")[0].args[0]).toMatchObject({
      p_embedding: null,
      p_assignee_given: false,
    });
  });
});

describe("POST /api/meetings/[id]/project", () => {
  const move = (body: unknown) => moveMeeting(req(body), params("m1"));
  const meeting = (over: Record<string, unknown> = {}) =>
    queue(
      "meetings",
      ok({ id: "m1", user_id: "u1", project_id: null, ...over }),
    );

  it("needs a project", async () => {
    expect((await move({})).status).toBe(422);
  });

  it("returns 404 when you did not create the meeting", async () => {
    meeting({ user_id: "u2" });
    expect((await move({ projectId: P })).status).toBe(404);
  });

  it("returns 409 for a meeting already in a project", async () => {
    meeting({ project_id: "p0" });
    expect((await move({ projectId: P })).status).toBe(409);
  });

  it("refuses a Viewer of the target with 403", async () => {
    meeting();
    role("viewer");
    expect((await move({ projectId: P })).status).toBe(403);
  });

  it("returns 409 under a minutes review", async () => {
    meeting();
    role("developer");
    queue("rpc:move_meeting_to_project", fail("minutes_review"));
    expect((await move({ projectId: P })).status).toBe(409);
  });

  it("moves the meeting", async () => {
    meeting();
    role("developer");
    const res = await move({ projectId: P });
    expect(await res.json()).toEqual({ meetingId: "m1", projectId: P });
    expect(callsOf("rpc:move_meeting_to_project", "rpc")[0].args[0]).toEqual({
      p_meeting: "m1",
      p_project: P,
      p_actor: "u1",
    });
    expect(
      calls.some((c) => c.table === "meetings" && c.method === "update"),
    ).toBe(false);
  });
});
