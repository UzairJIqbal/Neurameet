import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAuth, gh, mockSync } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  gh: {
    installUrls: vi.fn(),
    installationRepos: vi.fn(),
  },
  mockSync: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock(
  "@/lib/supabase-server",
  async () => (await import("@/test/supabase-queue-mock")).supabaseServerModule,
);
vi.mock("@/lib/github", () => gh);
vi.mock("@/lib/github-rules", () => ({ syncProject: mockSync }));

import { callsOf, ok, queue, resetQueues } from "@/test/supabase-queue-mock";
import { GET as listRepos, POST as linkRepo } from "./repos/route";
import { DELETE as unlinkRepo } from "./repos/[repoId]/route";
import { POST as sync } from "./sync/route";

const P = "p1";
const params = { params: Promise.resolve({ id: P }) };
const repoParams = (repoId: string) => ({
  params: Promise.resolve({ id: P, repoId }),
});
const url = `http://localhost/api/projects/${P}/github/repos`;
const post = (body: unknown) =>
  new Request(url, { method: "POST", body: JSON.stringify(body) });

const role = (r: string | null) =>
  queue("project_members", ok(r ? { role: r } : null));

const LISTED = {
  id: 100,
  full_name: "acme/app",
  default_branch: "main",
  private: true,
};

/** The claimed, live installation the caller can reach. */
const usable = (ids: number[] = [1]) => {
  queue(
    "github_installation_claims",
    ok(ids.map((id) => ({ installation_id: id }))),
  );
  queue("github_repos", ok([]));
  queue(
    "github_installations",
    ok(ids.map((id) => ({ installation_id: id, account_login: "acme" }))),
  );
  gh.installationRepos.mockResolvedValue([LISTED]);
};

beforeEach(() => {
  vi.clearAllMocks();
  resetQueues();
  mockAuth.mockResolvedValue({ userId: "u1" });
  gh.installUrls.mockReturnValue({
    installUrl: "https://github.com/apps/x/installations/new?state=s",
    authorizeUrl: "https://github.com/login/oauth/authorize?state=s",
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET github/repos", () => {
  it("is Owner only", async () => {
    role("admin");
    expect((await listRepos(new Request(url), params)).status).toBe(403);
    role(null);
    expect((await listRepos(new Request(url), params)).status).toBe(404);
    expect(gh.installationRepos).not.toHaveBeenCalled();
  });

  it("says 503 when the App is not configured", async () => {
    role("owner");
    gh.installUrls.mockImplementation(() => {
      throw new Error("missing");
    });
    expect((await listRepos(new Request(url), params)).status).toBe(503);
  });
});

describe("POST github/repos", () => {
  it("needs a repo id before anything else", async () => {
    expect((await linkRepo(post({}), params)).status).toBe(422);
    expect((await linkRepo(post({ repoId: "100" }), params)).status).toBe(422);
    expect(callsOf("project_members", "select")).toEqual([]);
  });

  it("is Owner only", async () => {
    role("admin");
    expect((await linkRepo(post({ repoId: 100 }), params)).status).toBe(403);
    expect(callsOf("github_repos", "insert")).toEqual([]);
  });

  it("refuses a repo your installations can't see", async () => {
    role("owner");
    usable();
    const res = await linkRepo(post({ repoId: 999 }), params);
    expect(res.status).toBe(422);
    expect(callsOf("github_repos", "insert")).toEqual([]);
  });

  it("refuses a repo linked to another project", async () => {
    role("owner");
    usable();
    queue("github_repos", ok({ project_id: "p2" }));
    expect((await linkRepo(post({ repoId: 100 }), params)).status).toBe(409);
    expect(callsOf("github_repos", "insert")).toEqual([]);
  });

  it("answers 409 when a parallel link wins the race", async () => {
    role("owner");
    usable();
    queue("github_repos", ok(null), {
      data: null,
      error: { code: "23505", message: "dup" },
    });
    expect((await linkRepo(post({ repoId: 100 }), params)).status).toBe(409);
  });

  it("links the repo with the name GitHub gave, and writes the audit row", async () => {
    role("owner");
    usable();
    queue("github_repos", ok(null));
    const res = await linkRepo(post({ repoId: 100 }), params);
    expect(res.status).toBe(201);
    expect(callsOf("github_repos", "insert")[0].args[0]).toMatchObject({
      repo_id: 100,
      project_id: P,
      installation_id: 1,
      full_name: "acme/app",
      default_branch: "main",
    });
    expect(callsOf("audit_log", "insert")[0].args[0]).toMatchObject({
      action: "repo.linked",
    });
  });
});

describe("DELETE github/repos/[repoId]", () => {
  it("is Owner only and audited, and leaves old links alone", async () => {
    role("admin");
    expect((await unlinkRepo(new Request(url), repoParams("100"))).status).toBe(
      403,
    );

    role("owner");
    queue("github_repos", ok([{ repo_id: 100 }]));
    expect((await unlinkRepo(new Request(url), repoParams("100"))).status).toBe(
      200,
    );
    expect(callsOf("audit_log", "insert")[0].args[0]).toMatchObject({
      action: "repo.unlinked",
    });
    expect(callsOf("task_links", "delete")).toEqual([]);
  });

  it("answers 404 for a repo not linked here or a bad id", async () => {
    role("owner");
    queue("github_repos", ok([]));
    expect((await unlinkRepo(new Request(url), repoParams("100"))).status).toBe(
      404,
    );
    expect((await unlinkRepo(new Request(url), repoParams("abc"))).status).toBe(
      404,
    );
  });
});

describe("POST github/sync", () => {
  const RESULT = {
    repos: 1,
    prsRead: 100,
    linked: 0,
    moved: 0,
    completed: 0,
    reopened: 0,
    failed: 0,
    partial: true,
  };

  it("is for an Owner or Admin", async () => {
    role("developer");
    expect((await sync(new Request(url), params)).status).toBe(403);
    expect(mockSync).not.toHaveBeenCalled();
  });

  it("answers 429 within a minute of the last sync", async () => {
    role("admin");
    queue("audit_log", ok({ created_at: new Date().toISOString() }));
    expect((await sync(new Request(url), params)).status).toBe(429);
    expect(mockSync).not.toHaveBeenCalled();
  });

  it("audits first, then returns the summary with partial", async () => {
    role("owner");
    queue(
      "audit_log",
      ok({ created_at: new Date(Date.now() - 120_000).toISOString() }),
    );
    mockSync.mockResolvedValue(RESULT);
    const res = await sync(new Request(url), params);
    expect(res.status).toBe(200);
    expect((await res.json()).partial).toBe(true);
    expect(callsOf("audit_log", "insert")[0].args[0]).toMatchObject({
      action: "github.synced",
    });
  });

  it("does not sync when the audit row fails, so the limit can't be skipped", async () => {
    role("owner");
    queue("audit_log", ok(null), { data: null, error: { message: "down" } });
    expect((await sync(new Request(url), params)).status).toBe(500);
    expect(mockSync).not.toHaveBeenCalled();
  });
});
