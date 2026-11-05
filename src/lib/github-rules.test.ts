import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GitHubPull } from "@/lib/github-types";

const gh = vi.hoisted(() => ({
  installationToken: vi.fn(),
  installationRepos: vi.fn(),
  recentPulls: vi.fn(),
  pull: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: vi.fn() }));
vi.mock("@/lib/github", () => gh);

import {
  calls,
  callsOf,
  client,
  ok,
  queue,
  resetQueues,
} from "@/test/supabase-queue-mock";
import {
  SYNC_MAX_MS,
  applyPrSnapshot,
  handleGitHubEvent,
  snapshotFromRest,
  snapshotFromWebhook,
  syncProject,
  type LinkedRepo,
  type SnapshotSource,
} from "./github-rules";

// The SQL functions decide the task's fate; these tests prove when they are
// called and what they are told. Their own behavior runs against Supabase.

const db = client as unknown as SupabaseClient;
const REPO_ID = 100;
const REPO: LinkedRepo = {
  repo_id: REPO_ID,
  project_id: "p1",
  full_name: "acme/app",
  default_branch: "main",
};
const T0 = "2026-11-05T10:00:00Z";
const T1 = "2026-11-05T11:00:00Z";

const pr = (over: Partial<GitHubPull> = {}): GitHubPull => ({
  number: 7,
  title: "Fix login",
  body: "Closes NM-1",
  html_url: "https://github.com/acme/app/pull/7",
  state: "open",
  draft: false,
  merged_at: null,
  merge_commit_sha: null,
  base: { ref: "main" },
  head: { ref: "feature", repo: { id: REPO_ID } },
  updated_at: T1,
  ...over,
});

const merged = (over: Partial<GitHubPull> = {}) =>
  pr({ state: "closed", merged_at: T1, merge_commit_sha: "abc", ...over });

const link = (over: Record<string, unknown> = {}) => ({
  id: "l1",
  task_id: "t1",
  state: "open",
  closes: true,
  from_fork: false,
  pr_updated_at: T0,
  ...over,
});

const apply = (
  value: GitHubPull,
  source: SnapshotSource = { kind: "webhook", action: "opened" },
) => applyPrSnapshot(db, REPO, snapshotFromRest(value, REPO_ID), source);

/** The project's prefix and the tasks its keys resolve to. */
const tasksExist = (...numbers: number[]) => {
  queue("projects", ok({ task_prefix: "NM" }));
  queue("tasks", ok(numbers.map((n) => ({ id: `t${n}`, number: n }))));
};

/** A PR with no links yet: the load, then the upsert that returns the new id. */
const newLink = (...numbers: number[]) => {
  queue("task_links", ok([]));
  tasksExist(...numbers);
  for (const n of numbers) queue("task_links", ok([{ id: `l${n}` }]));
};

const rpcArgs = (name: string) =>
  callsOf(`rpc:${name}`, "rpc").map(
    (c) => c.args[0] as Record<string, unknown>,
  );
const upserts = () =>
  callsOf("task_links", "upsert").map(
    (c) => c.args[0] as Record<string, unknown>,
  );
const linkUpdates = () =>
  callsOf("task_links", "update").map(
    (c) => c.args[0] as Record<string, unknown>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  resetQueues();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("snapshots", () => {
  it("builds the same snapshot from a webhook and from REST", () => {
    const value = merged();
    expect(
      snapshotFromWebhook({ pull_request: value, repository: { id: REPO_ID } }),
    ).toEqual(snapshotFromRest(value, REPO_ID));
  });

  it("derives the state, and cuts a long title", () => {
    expect(snapshotFromRest(pr({ draft: true }), REPO_ID).state).toBe("draft");
    expect(snapshotFromRest(pr({ state: "closed" }), REPO_ID).state).toBe(
      "closed",
    );
    const done = snapshotFromRest(merged(), REPO_ID);
    expect(done).toMatchObject({
      state: "merged",
      merged: true,
      mergeSha: "abc",
    });
    expect(
      snapshotFromRest(pr({ title: "x".repeat(400) }), REPO_ID).title,
    ).toHaveLength(300);
  });

  it("treats another repo or a deleted fork as a fork", () => {
    const other = pr({ head: { ref: "f", repo: { id: 999 } } });
    const gone = pr({ head: { ref: "f", repo: null } });
    expect(snapshotFromRest(other, REPO_ID).fromFork).toBe(true);
    expect(snapshotFromRest(gone, REPO_ID).fromFork).toBe(true);
    expect(snapshotFromRest(pr(), REPO_ID).fromFork).toBe(false);
  });
});

describe("linking and completion", () => {
  it("links a merged closing PR and asks SQL to complete the task, even when closed arrives first", async () => {
    newLink(1);
    queue("rpc:apply_merge_completion", ok("completed"));

    const result = await apply(merged(), { kind: "webhook", action: "closed" });

    expect(result).toEqual({ linked: 1, moved: 0, completed: 1, reopened: 0 });
    expect(upserts()[0]).toMatchObject({
      task_id: "t1",
      repo_id: REPO_ID,
      pr_number: 7,
      state: "merged",
      closes: true,
      from_fork: false,
      base_ref: "main",
      merge_sha: "abc",
    });
    expect(rpcArgs("apply_merge_completion")).toEqual([{ p_task: "t1" }]);
    expect(rpcArgs("apply_github_move")).toEqual([]);
  });

  it("writes a GitHub event that names no repo or PR", async () => {
    newLink(1);
    await apply(merged());
    expect(callsOf("task_events", "insert")[0].args[0]).toEqual({
      task_id: "t1",
      project_id: "p1",
      actor_id: null,
      kind: "pr_linked",
      detail: { source: "github", taskLinkId: "l1", state: "merged" },
    });
  });

  it("hands a merge into another branch to SQL with its base, so SQL can refuse it", async () => {
    newLink(1);
    queue("rpc:apply_merge_completion", ok("not_ready"));
    const result = await apply(merged({ base: { ref: "develop" } }));
    expect(upserts()[0]).toMatchObject({ base_ref: "develop", closes: true });
    expect(result.completed).toBe(0);
  });

  it("only links when no closing word is present", async () => {
    newLink(1);
    await apply(merged({ body: "See NM-1" }));
    expect(upserts()[0]).toMatchObject({ closes: false, state: "merged" });
    expect(rpcArgs("apply_merge_completion")).toEqual([]);
  });

  it("links a key in a lower case branch but never closes through it", async () => {
    newLink(1);
    await apply(
      merged({
        title: "Work",
        body: null,
        head: { ref: "nm-1-fix", repo: { id: REPO_ID } },
      }),
    );
    expect(upserts()[0]).toMatchObject({ task_id: "t1", closes: false });
    expect(rpcArgs("apply_merge_completion")).toEqual([]);
  });

  it("ignores another project's prefix without looking up tasks", async () => {
    queue("task_links", ok([]));
    queue("projects", ok({ task_prefix: "NM" }));
    const result = await apply(merged({ body: "Closes AB-1" }));
    expect(result.linked).toBe(0);
    expect(calls.filter((c) => c.table === "tasks")).toEqual([]);
    expect(upserts()).toEqual([]);
  });

  it("skips a key with no task", async () => {
    queue("task_links", ok([]));
    tasksExist();
    await apply(merged({ body: "Closes NM-404" }));
    expect(upserts()).toEqual([]);
  });

  it("links at most 20 tasks from one PR", async () => {
    const numbers = Array.from({ length: 25 }, (_, i) => i + 1);
    queue("task_links", ok([]));
    tasksExist(...numbers);
    for (const n of numbers) queue("task_links", ok([{ id: `l${n}` }]));
    const result = await apply(
      pr({ body: numbers.map((n) => `NM-${n}`).join(" ") }),
    );
    expect(result.linked).toBe(20);
  });

  it("leaves a link alone when a parallel run inserted it first", async () => {
    queue("task_links", ok([]));
    tasksExist(1);
    queue("task_links", ok([]));
    const result = await apply(pr());
    expect(result).toEqual({ linked: 0, moved: 0, completed: 0, reopened: 0 });
    expect(callsOf("task_events", "insert")).toEqual([]);
  });
});

describe("stale and edited PRs", () => {
  it("keeps the link but stops closing when the key leaves the text, and rechecks the task", async () => {
    queue("task_links", ok([link()]));
    queue("projects", ok({ task_prefix: "NM" }));
    queue("task_links", ok([{ id: "l1" }]));
    queue("rpc:apply_merge_completion", ok("completed"));

    const result = await apply(pr({ body: "No keys now" }), {
      kind: "webhook",
      action: "edited",
    });

    expect(linkUpdates()[0]).toMatchObject({ closes: false, state: "open" });
    expect(callsOf("task_links", "delete")).toEqual([]);
    expect(rpcArgs("apply_merge_completion")).toEqual([{ p_task: "t1" }]);
    expect(result.completed).toBe(1);
  });

  it("drops an event older than the stored one", async () => {
    queue("task_links", ok([link({ pr_updated_at: T1 })]));
    const result = await apply(pr({ updated_at: T0, state: "closed" }));
    expect(result).toEqual({ linked: 0, moved: 0, completed: 0, reopened: 0 });
    expect(linkUpdates()).toEqual([]);
    expect(rpcArgs("apply_merge_completion")).toEqual([]);
  });

  it("guards the write itself, so a slower event changes nothing", async () => {
    queue("task_links", ok([link({ state: "draft" })]));
    tasksExist(1);
    queue("task_links", ok([]));

    await apply(pr());

    const filters = callsOf("task_links", "lte");
    expect(filters[0].args).toEqual(["pr_updated_at", T1]);
    expect(callsOf("task_links", "neq")[0].args).toEqual(["state", "merged"]);
    expect(callsOf("task_events", "insert")).toEqual([]);
    expect(rpcArgs("apply_github_move")).toEqual([]);
  });
});

describe("merged is final", () => {
  const mergedLink = (over: Record<string, unknown> = {}) =>
    link({ state: "merged", ...over });

  it("an edit on a merged PR changes the title only and links nothing", async () => {
    queue("task_links", ok([mergedLink()]));
    const result = await apply(
      merged({ title: "New title", body: "Closes NM-9" }),
      {
        kind: "webhook",
        action: "edited",
      },
    );
    expect(linkUpdates()).toEqual([
      { pr_title: "New title", pr_updated_at: T1 },
    ]);
    expect(calls.filter((c) => c.table === "tasks")).toEqual([]);
    expect(upserts()).toEqual([]);
    expect(rpcArgs("apply_merge_completion")).toEqual([]);
    expect(result.completed).toBe(0);
  });

  it("an edit on a merged PR with no links creates none", async () => {
    queue("task_links", ok([]));
    await apply(merged({ body: "Closes NM-9" }), {
      kind: "webhook",
      action: "edited",
    });
    expect(upserts()).toEqual([]);
  });

  it("an older opened event in the same second leaves it merged", async () => {
    queue("task_links", ok([mergedLink({ pr_updated_at: T1 })]));
    tasksExist(1);
    await apply(pr());
    expect(linkUpdates()).toEqual([]);
    expect(rpcArgs("apply_github_move")).toEqual([]);
  });

  it("Sync adds no new link to a PR already merged", async () => {
    queue("task_links", ok([mergedLink()]));
    tasksExist(1, 9);
    queue("task_links", ok(null));
    await apply(merged({ body: "Closes NM-1, closes NM-9" }), { kind: "sync" });
    expect(upserts()).toEqual([]);
    expect(linkUpdates()[0]).not.toHaveProperty("closes");
    expect(linkUpdates()[0]).not.toHaveProperty("state");
  });
});

describe("reverts", () => {
  const revert = (over: Partial<GitHubPull> = {}) =>
    merged({
      number: 8,
      title: 'Revert "Closes NM-1"',
      body: "Reverts acme/app#7",
      ...over,
    });

  const targetLoaded = () => {
    queue("task_links", ok([]));
    queue(
      "task_links",
      ok([
        link({ id: "l7", state: "merged" }),
        link({ id: "l7b", state: "open" }),
      ]),
    );
  };

  it("reverts only the target's merged links and never links the revert itself", async () => {
    targetLoaded();
    queue("rpc:apply_merge_revert", ok("reopened"));
    const result = await apply(revert());
    expect(rpcArgs("apply_merge_revert")).toEqual([
      { p_link: "l7", p_by_pr: 8 },
    ]);
    expect(result.reopened).toBe(1);
    expect(upserts()).toEqual([]);
    expect(rpcArgs("apply_merge_completion")).toEqual([]);
  });

  it("does not count a revert of a PR that did not complete the task", async () => {
    targetLoaded();
    queue("rpc:apply_merge_revert", ok("flagged"));
    const result = await apply(revert());
    expect(result.reopened).toBe(0);
  });

  it.each([
    ["merged into another branch", { base: { ref: "develop" } }],
    ["naming another repo", { body: "Reverts other/app#7" }],
    [
      "not merged yet",
      { state: "open", merged_at: null, merge_commit_sha: null },
    ],
    ["with a title but no target", { body: null }],
  ])("does nothing when %s", async (_name, over) => {
    queue("task_links", ok([]));
    await apply(revert(over as Partial<GitHubPull>));
    expect(rpcArgs("apply_merge_revert")).toEqual([]);
    expect(upserts()).toEqual([]);
    expect(rpcArgs("apply_merge_completion")).toEqual([]);
  });
});

describe("status moves", () => {
  it("a new draft moves todo to in progress", async () => {
    newLink(1);
    queue("rpc:apply_github_move", ok("moved"));
    const result = await apply(pr({ draft: true }));
    expect(rpcArgs("apply_github_move")).toEqual([
      { p_task: "t1", p_from: ["todo"], p_to: "in_progress", p_link: "l1" },
    ]);
    expect(result.moved).toBe(1);
  });

  it("a ready PR moves todo or in progress to in review", async () => {
    newLink(1);
    await apply(pr());
    expect(rpcArgs("apply_github_move")[0]).toMatchObject({
      p_from: ["todo", "in_progress"],
      p_to: "in_review",
    });
  });

  it("a push with no state change moves nothing, so a person's move stays", async () => {
    queue("task_links", ok([link()]));
    tasksExist(1);
    queue("task_links", ok([{ id: "l1" }]));
    await apply(pr(), { kind: "webhook", action: "synchronize" });
    expect(rpcArgs("apply_github_move")).toEqual([]);
    expect(callsOf("task_events", "insert")).toEqual([]);
  });

  it("closing without merge moves in review back when no other PR is active", async () => {
    queue("task_links", ok([link({ closes: false })]));
    tasksExist(1);
    queue("task_links", ok([{ id: "l1" }]));
    queue("task_links", ok([]));
    await apply(pr({ state: "closed", body: "See NM-1" }));
    expect(rpcArgs("apply_github_move")[0]).toMatchObject({
      p_from: ["in_review"],
      p_to: "in_progress",
    });
  });

  it("closing leaves the card when another PR is still active", async () => {
    queue("task_links", ok([link({ closes: false })]));
    tasksExist(1);
    queue("task_links", ok([{ id: "l1" }]));
    queue("task_links", ok([{ id: "l2" }]));
    await apply(pr({ state: "closed", body: "See NM-1" }));
    expect(rpcArgs("apply_github_move")).toEqual([]);
  });

  it("a PR first seen closed moves nothing", async () => {
    newLink(1);
    await apply(pr({ state: "closed", body: "See NM-1" }));
    expect(rpcArgs("apply_github_move")).toEqual([]);
  });

  it("a fork links but moves nothing, and only completes once merged", async () => {
    const fork = { ref: "f", repo: { id: 999 } };
    newLink(1);
    await apply(pr({ head: fork }));
    expect(upserts()[0]).toMatchObject({ from_fork: true });
    expect(rpcArgs("apply_github_move")).toEqual([]);

    resetQueues();
    newLink(1);
    queue("rpc:apply_merge_completion", ok("completed"));
    const result = await apply(merged({ head: fork }));
    expect(result.completed).toBe(1);
    expect(rpcArgs("apply_github_move")).toEqual([]);
  });
});

describe("handleGitHubEvent", () => {
  const repository = {
    id: REPO_ID,
    full_name: "acme/renamed",
    default_branch: "trunk",
  };
  const row = {
    repo_id: REPO_ID,
    project_id: "p1",
    full_name: "acme/app",
    default_branch: "main",
    installation_id: 1,
  };

  it("ignores ping, unhandled actions, and repos that are not linked", async () => {
    expect(await handleGitHubEvent(db, "ping", {})).toBe("ignored");
    expect(
      await handleGitHubEvent(db, "pull_request", {
        action: "labeled",
        pull_request: pr(),
        repository,
      }),
    ).toBe("ignored");
    queue("github_repos", ok(null));
    expect(
      await handleGitHubEvent(db, "pull_request", {
        action: "opened",
        pull_request: pr(),
        repository,
      }),
    ).toBe("ignored");
    expect(calls.filter((c) => c.table === "task_links")).toEqual([]);
  });

  it("stops processing for a deleted or suspended installation", async () => {
    queue("github_repos", ok(row));
    queue("github_installations", ok([]));
    expect(
      await handleGitHubEvent(db, "pull_request", {
        action: "opened",
        pull_request: pr(),
        repository,
      }),
    ).toBe("ignored");
    expect(calls.filter((c) => c.table === "task_links")).toEqual([]);
  });

  it("takes a new name and default branch from the payload", async () => {
    queue("github_repos", ok(row));
    queue("github_installations", ok([{ installation_id: 1 }]));
    queue("task_links", ok([]));
    expect(
      await handleGitHubEvent(db, "pull_request", {
        action: "opened",
        pull_request: pr({ body: null }),
        repository,
      }),
    ).toBe("processed");
    expect(callsOf("github_repos", "update")[0].args[0]).toEqual({
      full_name: "acme/renamed",
      default_branch: "trunk",
    });
  });

  it("marks a deleted installation and unlinks its repos", async () => {
    const status = await handleGitHubEvent(db, "installation", {
      action: "deleted",
      installation: { id: 1 },
    });
    expect(status).toBe("processed");
    expect(callsOf("github_installations", "update")[0].args[0]).toHaveProperty(
      "deleted_at",
    );
    expect(callsOf("github_repos", "delete")).toHaveLength(1);
    expect(callsOf("github_repos", "eq")[0].args).toEqual([
      "installation_id",
      1,
    ]);
  });

  it("sets and clears suspended_at, and ignores created", async () => {
    await handleGitHubEvent(db, "installation", {
      action: "suspend",
      installation: { id: 1 },
    });
    await handleGitHubEvent(db, "installation", {
      action: "unsuspend",
      installation: { id: 1 },
    });
    const updates = callsOf("github_installations", "update").map(
      (c) => c.args[0] as Record<string, unknown>,
    );
    expect(updates[0].suspended_at).toEqual(expect.any(String));
    expect(updates[1]).toEqual({ suspended_at: null });
    expect(
      await handleGitHubEvent(db, "installation", {
        action: "created",
        installation: { id: 1 },
      }),
    ).toBe("ignored");
  });

  it("unlinks repos removed from an installation", async () => {
    expect(
      await handleGitHubEvent(db, "installation_repositories", {
        action: "removed",
        repositories_removed: [{ id: REPO_ID }],
      }),
    ).toBe("processed");
    expect(callsOf("github_repos", "in")[0].args).toEqual([
      "repo_id",
      [REPO_ID],
    ]);
  });
});

describe("syncProject", () => {
  const repoRow = (id: number) => ({
    repo_id: id,
    project_id: "p1",
    full_name: `acme/r${id}`,
    default_branch: "main",
    installation_id: 1,
  });
  const listing = (id: number) => ({
    id,
    full_name: `acme/r${id}`,
    default_branch: "main",
    private: false,
  });

  const repos = (...ids: number[]) => {
    queue("github_repos", ok(ids.map(repoRow)));
    queue("github_installations", ok([{ installation_id: 1 }]));
    gh.installationToken.mockResolvedValue("tok");
    gh.installationRepos.mockResolvedValue(ids.map(listing));
  };

  it("links and completes a merged PR no webhook ever delivered", async () => {
    repos(REPO_ID);
    gh.recentPulls.mockResolvedValue([merged()]);
    newLink(1);
    queue("rpc:apply_merge_completion", ok("completed"));
    queue("task_links", ok([]));

    const result = await syncProject(db, "p1");

    expect(result).toEqual({
      repos: 1,
      prsRead: 1,
      linked: 1,
      moved: 0,
      completed: 1,
      reopened: 0,
      failed: 0,
      partial: false,
    });
  });

  it("reads oldest first, so a revert lands after the PR it reverts", async () => {
    repos(REPO_ID);
    gh.recentPulls.mockResolvedValue([
      pr({ number: 8, body: null }),
      pr({ number: 5, body: null }),
    ]);
    await syncProject(db, "p1");
    const numbers = callsOf("task_links", "eq")
      .filter((c) => c.args[0] === "pr_number")
      .map((c) => c.args[1]);
    expect(numbers).toEqual([5, 8]);
  });

  it("leaves the 101st PR for the next run and says so", async () => {
    repos(1, 2, 3, 4);
    gh.recentPulls.mockImplementation(async () =>
      Array.from({ length: 30 }, (_, i) => pr({ number: i + 1, body: null })),
    );
    const result = await syncProject(db, "p1");
    expect(result.prsRead).toBe(100);
    expect(result.partial).toBe(true);
    expect(gh.pull).not.toHaveBeenCalled();
  });

  it("stops at the time limit", async () => {
    repos(REPO_ID);
    gh.recentPulls.mockResolvedValue([pr({ body: null })]);
    const now = vi.fn().mockReturnValueOnce(0).mockReturnValue(SYNC_MAX_MS);
    const result = await syncProject(db, "p1", now);
    expect(result).toMatchObject({ prsRead: 0, partial: true });
    expect(gh.recentPulls).not.toHaveBeenCalled();
  });

  it("rereads an open link outside the recent list", async () => {
    repos(REPO_ID);
    gh.recentPulls.mockResolvedValue([]);
    queue("task_links", ok([{ repo_id: REPO_ID, pr_number: 3 }]));
    gh.pull.mockResolvedValue(pr({ number: 3, body: null }));
    const result = await syncProject(db, "p1");
    expect(gh.pull).toHaveBeenCalledWith(`acme/r${REPO_ID}`, 3, "tok");
    expect(result.prsRead).toBe(1);
  });

  it("moves a dead PR to the back of the queue and carries on", async () => {
    repos(REPO_ID);
    gh.recentPulls.mockResolvedValue([]);
    queue(
      "task_links",
      ok([
        { repo_id: REPO_ID, pr_number: 3 },
        { repo_id: REPO_ID, pr_number: 4 },
      ]),
    );
    gh.pull
      .mockRejectedValueOnce(new Error("gone"))
      .mockResolvedValue(pr({ number: 4, body: null }));
    const result = await syncProject(db, "p1");
    expect(result).toMatchObject({ prsRead: 2, failed: 1 });
    expect(linkUpdates()[0]).toHaveProperty("last_synced_at");
  });

  it("counts a failed installation, and skips a repo GitHub no longer lists", async () => {
    repos(REPO_ID, 200);
    gh.installationRepos.mockResolvedValue([listing(200)]);
    gh.recentPulls.mockResolvedValue([]);
    const result = await syncProject(db, "p1");
    expect(result.repos).toBe(1);

    resetQueues();
    repos(REPO_ID);
    gh.installationToken.mockRejectedValue(new Error("nope"));
    const failed = await syncProject(db, "p1");
    expect(failed).toMatchObject({ repos: 0, failed: 1 });
  });
});
