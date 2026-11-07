import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAuth, mockGetUserList, mockOffboard } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockGetUserList: vi.fn(),
  mockOffboard: vi.fn(async () => {}),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  clerkClient: async () => ({ users: { getUserList: mockGetUserList } }),
}));
vi.mock(
  "@/lib/supabase-server",
  async () => (await import("@/test/supabase-queue-mock")).supabaseServerModule,
);
vi.mock("@/lib/project-call-offboarding", () => ({
  removeFromLiveProjectCalls: mockOffboard,
}));

import {
  queue,
  ok,
  resetQueues,
  callsOf,
  calls,
} from "@/test/supabase-queue-mock";
import { POST as createProject, GET as listProjects } from "./route";
import {
  GET as getProject,
  PATCH as renameProject,
  DELETE as deleteProject,
} from "./[id]/route";
import { GET as listMembers } from "./[id]/members/route";
import {
  PATCH as changeRole,
  DELETE as removeMember,
} from "./[id]/members/[userId]/route";
import { POST as transfer } from "./[id]/transfer/route";

const P = "p1";
const idParams = { params: Promise.resolve({ id: P }) };
const memberParams = (userId: string) => ({
  params: Promise.resolve({ id: P, userId }),
});
const req = (body?: unknown, method = "POST") =>
  new Request("http://localhost/api/projects", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const signIn = (userId: string | null) =>
  mockAuth.mockResolvedValue({ userId });
const role = (r: string | null) =>
  queue("project_members", ok(r ? { role: r } : null));
const fail = (message: string) => ({ data: null, error: { message } });

beforeEach(() => {
  vi.clearAllMocks();
  resetQueues();
  signIn("u1");
});

describe("POST /api/projects", () => {
  it("creates a project through create_project", async () => {
    queue(
      "rpc:create_project",
      ok({
        id: P,
        name: "NeuraMeet Core",
        task_prefix: "NM",
        created_at: "2026-11-03",
      }),
    );
    const res = await createProject(
      req({ name: "  NeuraMeet Core ", taskPrefix: "NM" }),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).project).toMatchObject({
      id: P,
      role: "owner",
      taskPrefix: "NM",
    });
    expect(callsOf("rpc:create_project", "rpc")[0].args[0]).toEqual({
      p_name: "NeuraMeet Core",
      p_prefix: "NM",
      p_user: "u1",
    });
  });

  it.each([
    [{ name: "", taskPrefix: "NM" }],
    [{ name: "x".repeat(81), taskPrefix: "NM" }],
    [{ name: "Core", taskPrefix: "nm1" }],
    [{ name: "Core", taskPrefix: "ABCDEF" }],
    [{ name: "Core", taskPrefix: "NM", color: "#ff0000" }],
    [{ name: "Core", taskPrefix: "NM", icon: "skull" }],
    [{ name: "Core", taskPrefix: "NM", projectType: "game" }],
    [{ name: "Core", taskPrefix: "NM", description: "x".repeat(501) }],
  ])("rejects %j with 422 and creates nothing", async (body) => {
    const res = await createProject(req(body));
    expect(res.status).toBe(422);
    expect(calls).toHaveLength(0);
  });

  it("needs a signed in user", async () => {
    signIn(null);
    expect(
      (await createProject(req({ name: "A", taskPrefix: "AB" }))).status,
    ).toBe(401);
  });
});

describe("POST /api/projects details", () => {
  const created = {
    id: P,
    name: "Core",
    task_prefix: "NM",
    created_at: "2026-11-03",
  };

  it("gives a name only project the defaults, with no second write", async () => {
    queue("rpc:create_project", ok(created));
    const res = await createProject(req({ name: "Core", taskPrefix: "NM" }));
    expect((await res.json()).project).toMatchObject({
      status: "active",
      projectType: "other",
      icon: "folder",
      color: "primary",
      description: null,
    });
    expect(callsOf("projects", "update")).toHaveLength(0);
  });

  it("stores the details and never takes a status", async () => {
    queue("rpc:create_project", ok(created));
    const res = await createProject(
      req({
        name: "Core",
        taskPrefix: "NM",
        description: " Web work ",
        projectType: "web",
        icon: "rocket",
        color: "warning",
        status: "completed",
      }),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).project).toMatchObject({
      status: "active",
      projectType: "web",
      icon: "rocket",
      color: "warning",
      description: "Web work",
    });
    expect(callsOf("projects", "update")[0].args[0]).toEqual({
      description: "Web work",
      project_type: "web",
      icon: "rocket",
      color: "warning",
    });
  });

  it("still returns 201 with the defaults when the details fail", async () => {
    queue("rpc:create_project", ok(created));
    queue("projects", { data: null, error: { message: "boom" } });
    const res = await createProject(
      req({ name: "Core", taskPrefix: "NM", icon: "rocket" }),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).project.icon).toBe("folder");
  });
});

describe("GET /api/projects", () => {
  const membership = {
    role: "developer",
    projects: {
      id: P,
      name: "Core",
      task_prefix: "NM",
      created_at: "2026-11-01",
      updated_at: "2026-11-02",
      description: "The core",
      status: "planning",
      project_type: "web",
      icon: "code",
      color: "success",
    },
  };
  const members = [
    { project_id: P, user_id: "o1", role: "owner", joined_at: "2026-11-01" },
    {
      project_id: P,
      user_id: "u1",
      role: "developer",
      joined_at: "2026-11-02",
    },
    { project_id: P, user_id: "u2", role: "viewer", joined_at: "2026-11-03" },
  ];

  it("lists your active projects as cards, one query per concern", async () => {
    queue("project_members", ok([membership]), ok(members));
    queue(
      "rpc:project_task_counts",
      ok([
        { project_id: P, status: "todo", total: "3", overdue: "1" },
        { project_id: P, status: "completed", total: "1", overdue: "0" },
      ]),
    );
    queue(
      "github_repos",
      ok([
        {
          project_id: P,
          full_name: "acme/secret",
          private: true,
          linked_at: "2026-11-01",
        },
      ]),
    );
    queue(
      "meetings",
      ok([
        { project_id: P, title: "Soonest", started_at: "2026-12-01T10:00:00Z" },
        { project_id: P, title: "Later", started_at: "2026-12-02T10:00:00Z" },
      ]),
    );
    const res = await listProjects();
    expect(res.status).toBe(200);
    expect((await res.json()).projects).toMatchObject([
      {
        id: P,
        name: "Core",
        taskPrefix: "NM",
        role: "developer",
        memberCount: 3,
        createdAt: "2026-11-01",
        status: "planning",
        projectType: "web",
        icon: "code",
        color: "success",
        repo: { connected: true, name: "acme/secret" },
        taskTotal: 4,
        taskCompleted: 1,
        nextMeeting: { title: "Soonest" },
      },
    ]);
    expect(callsOf("project_members", "is")[0].args).toEqual([
      "removed_at",
      null,
    ]);
    expect(callsOf("rpc:project_task_counts", "rpc")).toHaveLength(1);
  });

  it("hides a private repo name from a Viewer's card", async () => {
    queue(
      "project_members",
      ok([{ ...membership, role: "viewer" }]),
      ok(members),
    );
    queue(
      "github_repos",
      ok([
        {
          project_id: P,
          full_name: "acme/secret",
          private: true,
          linked_at: "2026-11-01",
        },
      ]),
    );
    const res = await listProjects();
    const body = await res.json();
    expect(body.projects[0].repo).toEqual({ connected: true, name: null });
    expect(JSON.stringify(body)).not.toContain("acme/secret");
  });

  it("returns an empty list without counting anything", async () => {
    queue("project_members", ok([]));
    const res = await listProjects();
    expect((await res.json()).projects).toEqual([]);
    expect(callsOf("rpc:project_task_counts", "rpc")).toHaveLength(0);
  });
});

describe("GET /api/projects/[id]", () => {
  const row = {
    id: P,
    name: "Core",
    task_prefix: "NM",
    created_at: "2026-11-01",
  };

  it("returns the project to a member with counts", async () => {
    role("viewer");
    queue("projects", ok(row));
    queue(
      "project_members",
      ok([
        { project_id: P, user_id: "o1", role: "owner", joined_at: "1" },
        { project_id: P, user_id: "u1", role: "viewer", joined_at: "2" },
      ]),
    );
    queue("meetings", { data: null, error: null, count: 2 });
    const res = await getProject(req(undefined, "GET"), idParams);
    expect(res.status).toBe(200);
    expect((await res.json()).project).toMatchObject({
      role: "viewer",
      memberCount: 2,
      meetingCount: 2,
      status: "active",
      linkedPrCount: null,
      github: { connected: false, repos: [] },
    });
  });

  it("gives a Viewer public repos only, and connected stays true", async () => {
    role("viewer");
    queue("projects", ok(row));
    queue(
      "github_repos",
      ok([
        { project_id: P, full_name: "a/secret", private: true, linked_at: "1" },
        { project_id: P, full_name: "a/open", private: false, linked_at: "2" },
      ]),
    );
    const res = await getProject(req(undefined, "GET"), idParams);
    const body = await res.json();
    expect(body.project.github.connected).toBe(true);
    expect(body.project.github.repos).toEqual([
      { fullName: "a/open", private: false },
    ]);
    expect(JSON.stringify(body)).not.toContain("a/secret");
  });

  it("blanks only the task counts when they fail", async () => {
    role("owner");
    queue("projects", ok(row));
    queue("rpc:project_task_counts", {
      data: null,
      error: { message: "boom" },
    });
    queue("meetings", { data: null, error: null, count: 2 });
    const res = await getProject(req(undefined, "GET"), idParams);
    expect(res.status).toBe(200);
    expect((await res.json()).project).toMatchObject({
      taskTotals: null,
      meetingCount: 2,
    });
  });

  it("returns 404 to a non member or removed member", async () => {
    role(null);
    const res = await getProject(req(undefined, "GET"), idParams);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });
});

describe("PATCH /api/projects/[id]", () => {
  it("renames for the owner", async () => {
    role("owner");
    const res = await renameProject(
      req({ name: "New name" }, "PATCH"),
      idParams,
    );
    expect(res.status).toBe(200);
    expect(callsOf("projects", "update")[0].args[0]).toMatchObject({
      name: "New name",
    });
  });

  it("updates only the details you send", async () => {
    role("owner");
    const res = await renameProject(
      req({ status: "on_hold", color: "tertiary" }, "PATCH"),
      idParams,
    );
    expect(res.status).toBe(200);
    const update = callsOf("projects", "update")[0].args[0];
    expect(update).toMatchObject({ status: "on_hold", color: "tertiary" });
    expect(update).not.toHaveProperty("name");
  });

  it.each([
    [{ status: "paused" }],
    [{ color: "#123456" }],
    [{ icon: "skull" }],
    [{}],
  ])("rejects %j with 422", async (body) => {
    role("owner");
    const res = await renameProject(req(body, "PATCH"), idParams);
    expect(res.status).toBe(422);
    expect(callsOf("projects", "update")).toHaveLength(0);
  });

  it("refuses a prefix change with 422", async () => {
    role("owner");
    const res = await renameProject(
      req({ name: "X", taskPrefix: "XY" }, "PATCH"),
      idParams,
    );
    expect(res.status).toBe(422);
    expect(callsOf("projects", "update")).toHaveLength(0);
  });

  it("refuses an admin with 403", async () => {
    role("admin");
    expect(
      (await renameProject(req({ name: "X" }, "PATCH"), idParams)).status,
    ).toBe(403);
  });
});

describe("DELETE /api/projects/[id]", () => {
  const project = {
    id: P,
    name: "Core",
    task_prefix: "NM",
    created_at: "2026-11-01",
  };

  it("needs the exact name", async () => {
    role("owner");
    queue("projects", ok(project));
    const res = await deleteProject(
      req({ confirmName: "core" }, "DELETE"),
      idParams,
    );
    expect(res.status).toBe(422);
    expect(callsOf("projects", "delete")).toHaveLength(0);
  });

  it("returns 409 when a project meeting has sealed minutes", async () => {
    role("owner");
    queue("projects", ok(project));
    queue("meetings", ok([{ id: "m1" }]));
    queue("minutes_seals", ok([{ id: "s1" }]));
    const res = await deleteProject(
      req({ confirmName: "Core" }, "DELETE"),
      idParams,
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "Sealed minutes can't be deleted",
    });
    expect(callsOf("meetings", "delete")).toHaveLength(0);
  });

  it("deletes meetings, then the project, then writes the audit row", async () => {
    role("owner");
    queue("projects", ok(project));
    queue("meetings", ok([{ id: "m1" }, { id: "m2" }]));
    queue("minutes_seals", ok([]));
    const res = await deleteProject(
      req({ confirmName: "Core" }, "DELETE"),
      idParams,
    );
    expect(res.status).toBe(200);
    expect(callsOf("meetings", "delete")).toHaveLength(1);
    expect(callsOf("projects", "delete")).toHaveLength(1);
    expect(callsOf("audit_log", "insert")[0].args[0]).toMatchObject({
      action: "project.deleted",
    });
  });

  it("refuses a developer with 403", async () => {
    role("developer");
    expect(
      (await deleteProject(req({ confirmName: "Core" }, "DELETE"), idParams))
        .status,
    ).toBe(403);
  });
});

describe("GET /api/projects/[id]/members", () => {
  it("lists members with Clerk names and falls back to Unknown member", async () => {
    role("developer");
    queue(
      "project_members",
      ok([
        { user_id: "u2", role: "viewer", joined_at: "2026-11-02" },
        { user_id: "u1", role: "owner", joined_at: "2026-11-01" },
      ]),
    );
    queue("tasks", ok([{ assignee_id: "u1" }, { assignee_id: "u1" }]));
    queue("user_settings", ok([{ user_id: "u1", github_login: "ada-k" }]));
    mockGetUserList.mockResolvedValue({
      data: [
        {
          id: "u1",
          imageUrl: "https://img/ada.png",
          firstName: "Ada",
          lastName: "Khan",
          username: null,
          primaryEmailAddress: { emailAddress: "ada@x.io" },
        },
      ],
    });
    const res = await listMembers(req(undefined, "GET"), idParams);
    const body = await res.json();
    expect(body.myRole).toBe("developer");
    expect(body.members).toEqual([
      {
        userId: "u1",
        role: "owner",
        joinedAt: "2026-11-01",
        name: "Ada Khan",
        email: "ada@x.io",
        imageUrl: "https://img/ada.png",
        githubLogin: "ada-k",
        openTaskCount: 2,
      },
      {
        userId: "u2",
        role: "viewer",
        joinedAt: "2026-11-02",
        name: "Unknown member",
        email: null,
        imageUrl: null,
        githubLogin: null,
        openTaskCount: 0,
      },
    ]);
  });

  it("shows Unknown member when Clerk fails", async () => {
    role("owner");
    queue(
      "project_members",
      ok([{ user_id: "u1", role: "owner", joined_at: "2026-11-01" }]),
    );
    mockGetUserList.mockRejectedValue(new Error("down"));
    const body = await (
      await listMembers(req(undefined, "GET"), idParams)
    ).json();
    expect(body.members[0]).toMatchObject({
      name: "Unknown member",
      email: null,
    });
  });

  it("returns 404 to an outsider", async () => {
    role(null);
    expect((await listMembers(req(undefined, "GET"), idParams)).status).toBe(
      404,
    );
  });
});

describe("PATCH /api/projects/[id]/members/[userId]", () => {
  it("lets the owner make a developer an admin and audits it", async () => {
    role("owner");
    role("developer");
    const res = await changeRole(
      req({ role: "admin" }, "PATCH"),
      memberParams("u2"),
    );
    expect(res.status).toBe(200);
    expect(callsOf("project_members", "update")[0].args[0]).toEqual({
      role: "admin",
    });
    expect(callsOf("audit_log", "insert")[0].args[0]).toMatchObject({
      action: "member.role_changed",
      detail: { from: "developer", to: "admin" },
    });
  });

  it("returns 409 for your own role", async () => {
    role("owner");
    expect(
      (await changeRole(req({ role: "viewer" }, "PATCH"), memberParams("u1")))
        .status,
    ).toBe(409);
  });

  it("returns 409 when the target is the owner", async () => {
    role("admin");
    role("owner");
    expect(
      (await changeRole(req({ role: "viewer" }, "PATCH"), memberParams("u2")))
        .status,
    ).toBe(409);
  });

  it("returns 403 when an admin grants admin", async () => {
    role("admin");
    role("developer");
    expect(
      (await changeRole(req({ role: "admin" }, "PATCH"), memberParams("u2")))
        .status,
    ).toBe(403);
    expect(callsOf("project_members", "update")).toHaveLength(0);
  });

  it("returns 403 to a developer", async () => {
    role("developer");
    expect(
      (await changeRole(req({ role: "viewer" }, "PATCH"), memberParams("u2")))
        .status,
    ).toBe(403);
  });

  it("rejects owner as a role with 422", async () => {
    role("owner");
    expect(
      (await changeRole(req({ role: "owner" }, "PATCH"), memberParams("u2")))
        .status,
    ).toBe(422);
  });
});

describe("DELETE /api/projects/[id]/members/[userId]", () => {
  it("lets a viewer leave", async () => {
    role("viewer");
    const res = await removeMember(
      req(undefined, "DELETE"),
      memberParams("u1"),
    );
    expect(res.status).toBe(200);
    expect(callsOf("rpc:remove_project_member", "rpc")[0].args[0]).toEqual({
      p_project: P,
      p_user: "u1",
      p_actor: "u1",
      p_actor_role: "viewer",
    });
    expect(mockOffboard).toHaveBeenCalledWith(expect.anything(), P, "u1");
  });

  it("removes a member from live project calls after the removal is saved", async () => {
    role("admin");
    role("developer");
    const res = await removeMember(
      req(undefined, "DELETE"),
      memberParams("u2"),
    );
    expect(res.status).toBe(200);
    expect(mockOffboard).toHaveBeenCalledWith(expect.anything(), P, "u2");
  });

  it("never takes anyone out of calls when the removal fails", async () => {
    role("admin");
    role("admin");
    queue("rpc:remove_project_member", fail("not_removable"));
    await removeMember(req(undefined, "DELETE"), memberParams("u2"));
    expect(mockOffboard).not.toHaveBeenCalled();
  });

  it("refuses the owner leaving with 409", async () => {
    role("owner");
    const res = await removeMember(
      req(undefined, "DELETE"),
      memberParams("u1"),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Transfer ownership first" });
  });

  it("maps not_removable to 403", async () => {
    role("admin");
    role("admin");
    queue("rpc:remove_project_member", fail("not_removable"));
    expect(
      (await removeMember(req(undefined, "DELETE"), memberParams("u2"))).status,
    ).toBe(403);
  });

  it("returns 403 when a developer removes someone", async () => {
    role("developer");
    expect(
      (await removeMember(req(undefined, "DELETE"), memberParams("u2"))).status,
    ).toBe(403);
  });
});

describe("POST /api/projects/[id]/transfer", () => {
  it("transfers to an admin", async () => {
    role("owner");
    const res = await transfer(req({ userId: "u2" }), idParams);
    expect(res.status).toBe(200);
    expect(callsOf("rpc:transfer_project_ownership", "rpc")[0].args[0]).toEqual(
      {
        p_project: P,
        p_from: "u1",
        p_to: "u2",
      },
    );
  });

  it("returns 409 when the target is not an admin", async () => {
    role("owner");
    queue("rpc:transfer_project_ownership", fail("target_not_admin"));
    expect((await transfer(req({ userId: "u2" }), idParams)).status).toBe(409);
  });

  it("returns 403 to an admin", async () => {
    role("admin");
    expect((await transfer(req({ userId: "u2" }), idParams)).status).toBe(403);
  });
});
