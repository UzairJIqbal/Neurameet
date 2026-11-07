import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAuth, mockGetUserList, github } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockGetUserList: vi.fn(async () => ({ data: [] as unknown[] })),
  github: { installationToken: vi.fn(), pullCommits: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  clerkClient: async () => ({ users: { getUserList: mockGetUserList } }),
}));
vi.mock(
  "@/lib/supabase-server",
  async () => (await import("@/test/supabase-queue-mock")).supabaseServerModule,
);
vi.mock("@/lib/github", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/github")>()),
  installationToken: github.installationToken,
  pullCommits: github.pullCommits,
}));

import {
  calls,
  callsOf,
  ok,
  queue,
  resetQueues,
} from "@/test/supabase-queue-mock";
import { POST as addComment } from "./[id]/comments/route";
import { DELETE as deleteComment } from "./[id]/comments/[commentId]/route";
import { GET as getCommits } from "./[id]/commits/route";

const T = "t1";
const C = "11111111-1111-4111-8111-111111111111";
const P = "p1";

const params = () => ({ params: Promise.resolve({ id: T }) });
const commentParams = (commentId = C) => ({
  params: Promise.resolve({ id: T, commentId }),
});
const post = (body: unknown) =>
  new Request("http://localhost/api/x", {
    method: "POST",
    body: JSON.stringify(body),
  });
const role = (r: string) => queue("project_members", ok({ role: r }));
const taskHead = () => queue("tasks", ok({ project_id: P }));
const commentRow = (over = {}) => ({
  id: C,
  author_id: "u1",
  body: "Looks good",
  created_at: "2026-11-07T10:00:00Z",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  resetQueues();
  mockAuth.mockResolvedValue({ userId: "u1" });
  mockGetUserList.mockResolvedValue({ data: [] });
});

describe("POST /api/tasks/[id]/comments", () => {
  it("lets a Developer comment, and sends the text only to the RPC", async () => {
    taskHead();
    role("developer");
    queue("rpc:add_task_comment", ok(commentRow()));
    const res = await addComment(post({ body: "  Looks good  " }), params());
    expect(res.status).toBe(201);
    const { comment } = await res.json();
    expect(comment.body).toBe("Looks good");
    const rpc = calls.find((c) => c.table === "rpc:add_task_comment");
    expect(rpc).toBeTruthy();
    expect(callsOf("task_events", "insert")).toEqual([]);
  });

  it("shows a name Clerk no longer knows as Former member", async () => {
    taskHead();
    role("developer");
    queue("rpc:add_task_comment", ok(commentRow()));
    const res = await addComment(post({ body: "Hi" }), params());
    expect((await res.json()).comment.authorName).toBe("Former member");
  });

  it("refuses a Viewer", async () => {
    taskHead();
    role("viewer");
    const res = await addComment(post({ body: "Hi" }), params());
    expect(res.status).toBe(403);
    expect(calls.some((c) => c.table === "rpc:add_task_comment")).toBe(false);
  });

  it.each([
    ["empty", "   "],
    ["over the limit", "x".repeat(2001)],
    ["not text", 5],
  ])("refuses a comment that is %s", async (_name, body) => {
    const res = await addComment(post({ body }), params());
    expect(res.status).toBe(422);
  });

  it("answers 404 for a task that isn't there", async () => {
    queue("tasks", ok(null));
    const res = await addComment(post({ body: "Hi" }), params());
    expect(res.status).toBe(404);
  });

  it("answers 401 when signed out", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const res = await addComment(post({ body: "Hi" }), params());
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/tasks/[id]/comments/[commentId]", () => {
  const stored = (authorId: string) =>
    queue("task_comments", ok({ id: C, author_id: authorId, project_id: P }));
  const remove = (commentId?: string) =>
    deleteComment(
      new Request("http://localhost/api/x", { method: "DELETE" }),
      commentParams(commentId),
    );

  it("lets the author delete", async () => {
    stored("u1");
    role("developer");
    expect((await remove()).status).toBe(200);
    expect(callsOf("task_comments", "delete")).toHaveLength(1);
  });

  it("refuses another Developer", async () => {
    stored("u2");
    role("developer");
    expect((await remove()).status).toBe(403);
    expect(callsOf("task_comments", "delete")).toEqual([]);
  });

  it("lets an Admin delete anyone's", async () => {
    stored("u2");
    role("admin");
    expect((await remove()).status).toBe(200);
  });

  it("refuses an author who is now a Viewer", async () => {
    stored("u1");
    role("viewer");
    expect((await remove()).status).toBe(403);
  });

  it("answers 404 for a bad id or a missing comment", async () => {
    expect((await remove("nope")).status).toBe(404);
    queue("task_comments", ok(null));
    expect((await remove()).status).toBe(404);
  });
});

describe("GET /api/tasks/[id]/commits", () => {
  const link = () => queue("task_links", ok([{ repo_id: 100, pr_number: 7 }]));
  const repo = () => {
    queue(
      "github_repos",
      ok([{ repo_id: 100, full_name: "acme/app", installation_id: 9 }]),
    );
    queue("github_installations", ok([{ installation_id: 9 }]));
  };
  const read = () =>
    getCommits(new Request("http://localhost/api/x"), params());

  it("returns the short sha, first line, login, and a built URL, and stores nothing", async () => {
    taskHead();
    role("developer");
    link();
    repo();
    github.installationToken.mockResolvedValue("tok");
    github.pullCommits.mockResolvedValue([
      {
        sha: "abcdef1234567890",
        commit: { message: "Fix login\n\nLong body" },
        author: { login: "dev1" },
      },
      { sha: "1234567abcdef", commit: { message: "Tidy" }, author: null },
    ]);
    const res = await read();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      pullRequests: [
        {
          repoFullName: "acme/app",
          prNumber: 7,
          commits: [
            {
              sha: "abcdef1",
              message: "Fix login",
              authorLogin: "dev1",
              url: "https://github.com/acme/app/commit/abcdef1234567890",
            },
            {
              sha: "1234567",
              message: "Tidy",
              authorLogin: null,
              url: "https://github.com/acme/app/commit/1234567abcdef",
            },
          ],
        },
      ],
    });
    const writes = calls.filter((c) =>
      ["insert", "update", "upsert", "delete"].includes(c.method),
    );
    expect(writes).toEqual([]);
  });

  it("refuses a Viewer before reading GitHub", async () => {
    taskHead();
    role("viewer");
    expect((await read()).status).toBe(403);
    expect(github.pullCommits).not.toHaveBeenCalled();
  });

  it("answers 404 for a task that isn't there", async () => {
    queue("tasks", ok(null));
    expect((await read()).status).toBe(404);
  });

  it("answers 502 when GitHub fails", async () => {
    taskHead();
    role("developer");
    link();
    repo();
    github.installationToken.mockResolvedValue("tok");
    github.pullCommits.mockRejectedValue(new Error("403"));
    expect((await read()).status).toBe(502);
  });

  it("skips a repo that is no longer linked", async () => {
    taskHead();
    role("developer");
    link();
    queue("github_repos", ok([]));
    const res = await read();
    expect(await res.json()).toEqual({ pullRequests: [] });
    expect(github.pullCommits).not.toHaveBeenCalled();
  });
});
