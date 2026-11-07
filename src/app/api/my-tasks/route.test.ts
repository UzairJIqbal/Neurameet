import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  calls,
  callsOf,
  ok,
  queue,
  resetQueues,
} from "@/test/supabase-queue-mock";

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock(
  "@/lib/supabase-server",
  async () => (await import("@/test/supabase-queue-mock")).supabaseServerModule,
);

import { auth } from "@clerk/nextjs/server";
import { GET } from "./route";

const PROJECT_A = "11111111-1111-4111-8111-111111111111";
const PROJECT_B = "22222222-2222-4222-8222-222222222222";

const row = (id: string, projectId: string, status = "todo") => ({
  id,
  project_id: projectId,
  number: 7,
  title: `Task ${id}`,
  description: null,
  status,
  priority: "high",
  position: 1,
  assignee_id: "me",
  due_date: "2026-11-10",
  source_meeting_id: null,
  completion_kind: null,
  completed_at: null,
  version: 1,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
  quote: "should never travel",
});

const prLink = (taskId: string) => ({
  task_id: taskId,
  repo_full_name: "acme/app",
  pr_number: 12,
  pr_url: "https://github.com/acme/app/pull/12",
  state: "open",
  reverted_at: null,
});

const signedIn = () =>
  vi.mocked(auth).mockResolvedValue({ userId: "me" } as never);

describe("GET /api/my-tasks", () => {
  beforeEach(() => {
    resetQueues();
    signedIn();
  });

  it("returns 401 when signed out", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as never);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns nothing and reads no tasks once you were removed", async () => {
    queue("project_members", ok([]));
    const res = await GET();
    const body = await res.json();
    expect(body.tasks).toEqual([]);
    expect(body.truncated).toBe(false);
    expect(callsOf("tasks", "select")).toHaveLength(0);
  });

  it("reads active memberships only, and only those projects' tasks", async () => {
    queue(
      "project_members",
      ok([{ project_id: PROJECT_A, role: "developer" }]),
    );
    queue(
      "projects",
      ok([{ id: PROJECT_A, name: "Alpha", task_prefix: "AL" }]),
    );
    queue("tasks", ok([]), ok([]));
    await GET();
    expect(callsOf("project_members", "is")[0]?.args).toEqual([
      "removed_at",
      null,
    ]);
    const scopes = callsOf("tasks", "in");
    expect(scopes.length).toBe(2);
    for (const scope of scopes) {
      expect(scope.args).toEqual(["project_id", [PROJECT_A]]);
    }
    for (const eq of callsOf("tasks", "eq").filter(
      (c) => c.args[0] === "assignee_id",
    )) {
      expect(eq.args[1]).toBe("me");
    }
  });

  it("ignores a role it does not know", async () => {
    queue("project_members", ok([{ project_id: PROJECT_A, role: "member" }]));
    const body = await (await GET()).json();
    expect(body.tasks).toEqual([]);
    expect(callsOf("projects", "select")).toHaveLength(0);
  });

  it("orders open tasks by due date with nulls last, capped at 200", async () => {
    queue("project_members", ok([{ project_id: PROJECT_A, role: "owner" }]));
    queue(
      "projects",
      ok([{ id: PROJECT_A, name: "Alpha", task_prefix: "AL" }]),
    );
    queue("tasks", ok([]), ok([]));
    await GET();
    expect(callsOf("tasks", "order")[0]?.args).toEqual([
      "due_date",
      { ascending: true, nullsFirst: false },
    ]);
    expect(callsOf("tasks", "limit").map((c) => c.args[0])).toEqual([200, 50]);
  });

  it("says more exist past the cap", async () => {
    queue("project_members", ok([{ project_id: PROJECT_A, role: "owner" }]));
    queue(
      "projects",
      ok([{ id: PROJECT_A, name: "Alpha", task_prefix: "AL" }]),
    );
    queue("tasks", { ...ok([row("t1", PROJECT_A)]), count: 201 }, ok([]));
    const body = await (await GET()).json();
    expect(body.truncated).toBe(true);
    expect(body.tasks[0].key).toBe("AL-7");
    expect(body.tasks[0].projectName).toBe("Alpha");
  });

  it("gives PR refs per project: never in a project where you are a Viewer", async () => {
    queue(
      "project_members",
      ok([
        { project_id: PROJECT_A, role: "viewer" },
        { project_id: PROJECT_B, role: "developer" },
      ]),
    );
    queue(
      "projects",
      ok([
        { id: PROJECT_A, name: "Alpha", task_prefix: "AL" },
        { id: PROJECT_B, name: "Beta", task_prefix: "BE" },
      ]),
    );
    queue(
      "tasks",
      ok([row("hidden", PROJECT_A), row("shown", PROJECT_B)]),
      ok([]),
    );
    queue("task_links", ok([prLink("shown")]));
    const body = await (await GET()).json();
    const hidden = body.tasks.find((t: { id: string }) => t.id === "hidden");
    const shown = body.tasks.find((t: { id: string }) => t.id === "shown");
    expect(hidden.prRefs).toBeUndefined();
    expect(hidden.commentCount).toBeUndefined();
    expect(shown.prRefs[0].prNumber).toBe(12);
    const linkScope = callsOf("task_links", "in")[0]?.args;
    expect(linkScope).toEqual(["task_id", ["shown"]]);
  });

  it("never sends a quote or evidence, whatever the role", async () => {
    queue("project_members", ok([{ project_id: PROJECT_A, role: "owner" }]));
    queue(
      "projects",
      ok([{ id: PROJECT_A, name: "Alpha", task_prefix: "AL" }]),
    );
    queue("tasks", ok([row("t1", PROJECT_A)]), ok([]));
    const raw = await (await GET()).text();
    expect(raw).not.toContain("should never travel");
    expect(calls.length).toBeGreaterThan(0);
  });

  it("answers 500 without details when a read fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    queue("project_members", {
      data: null,
      error: { message: "secret detail" },
    });
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("secret detail");
  });
});
