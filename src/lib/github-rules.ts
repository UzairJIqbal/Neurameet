import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTaskPrefix } from "@/lib/project-select";
import {
  closingKeys,
  findKeys,
  isRevert,
  keyId,
  revertTarget,
} from "@/lib/github-keys";
import {
  installationRepos,
  installationToken,
  pull,
  recentPulls,
} from "@/lib/github";
import type {
  GitHubPull,
  GitHubSyncResult,
  PrSnapshot,
  PrState,
} from "@/lib/github-types";

// The one rule path for pull requests (spec 0004, W5). The webhook and Sync both
// call applyPrSnapshot, so a missed or repeated delivery ends in the same place.

const MAX_KEYS_PER_PR = 20;
// Tasks are looked up before the 20 valid keys are picked, so a body stuffed with
// keys cannot turn into one huge query.
const MAX_KEY_CANDIDATES = 200;
const PR_TITLE_MAX = 300;
export const SYNC_MAX_PRS = 100;
export const SYNC_MAX_MS = 45_000;

const HANDLED_PR_ACTIONS = new Set([
  "opened",
  "edited",
  "reopened",
  "ready_for_review",
  "converted_to_draft",
  "synchronize",
  "closed",
]);

export type LinkedRepo = {
  repo_id: number;
  project_id: string;
  full_name: string;
  default_branch: string;
};

export type SnapshotSource =
  { kind: "webhook"; action: string } | { kind: "sync" };

export type ApplyResult = {
  linked: number;
  moved: number;
  completed: number;
  reopened: number;
};

type LinkRow = {
  id: string;
  task_id: string;
  state: PrState;
  closes: boolean;
  from_fork: boolean;
  pr_updated_at: string;
};

// One link after this event. `previousState` is null for a new link.
type LinkChange = {
  id: string;
  taskId: string;
  previousState: PrState | null;
  state: PrState;
  closes: boolean;
  wasClosing: boolean;
  fromFork: boolean;
};

const LINK_COLUMNS = "id, task_id, state, closes, from_fork, pr_updated_at";

function snapshotFromPull(pr: GitHubPull, repoId: number): PrSnapshot {
  // `merged_at` is in both shapes; `merged` is only in some of them.
  const merged = Boolean(pr.merged_at);
  const state: PrState = merged
    ? "merged"
    : pr.state === "closed"
      ? "closed"
      : pr.draft
        ? "draft"
        : "open";
  return {
    repoId,
    number: pr.number,
    title: pr.title.slice(0, PR_TITLE_MAX),
    body: pr.body ?? null,
    url: pr.html_url,
    state,
    merged,
    mergedAt: pr.merged_at ?? null,
    mergeSha: merged ? (pr.merge_commit_sha ?? null) : null,
    baseRef: pr.base.ref,
    headRef: pr.head.ref,
    // A null head repo means the fork was deleted, so it counts as a fork.
    fromFork: pr.head.repo?.id !== repoId,
    updatedAt: pr.updated_at,
  };
}

export function snapshotFromWebhook(payload: {
  pull_request: GitHubPull;
  repository: { id: number };
}): PrSnapshot {
  return snapshotFromPull(payload.pull_request, payload.repository.id);
}

export function snapshotFromRest(pr: GitHubPull, repoId: number): PrSnapshot {
  return snapshotFromPull(pr, repoId);
}

const isNewer = (a: string, b: string): boolean =>
  new Date(a).getTime() > new Date(b).getTime();

async function loadLinks(
  supabase: SupabaseClient,
  repoId: number,
  prNumber: number,
): Promise<LinkRow[]> {
  const { data, error } = await supabase
    .from("task_links")
    .select(LINK_COLUMNS)
    .eq("repo_id", repoId)
    .eq("pr_number", prNumber);
  if (error) throw error;
  return (data ?? []) as LinkRow[];
}

// Step 2: a merged revert into the default branch of this same repo.
async function applyRevert(
  supabase: SupabaseClient,
  repo: LinkedRepo,
  pr: PrSnapshot,
  result: ApplyResult,
): Promise<void> {
  const target = revertTarget(pr.body);
  if (!target || !pr.merged || pr.baseRef !== repo.default_branch) return;
  if (target.repo.toLowerCase() !== repo.full_name.toLowerCase()) return;
  const merged = (
    await loadLinks(supabase, repo.repo_id, target.number)
  ).filter((link) => link.state === "merged");
  for (const link of merged) {
    const { data, error } = await supabase.rpc("apply_merge_revert", {
      p_link: link.id,
      p_by_pr: pr.number,
    });
    if (error) throw error;
    if (data === "reopened") result.reopened++;
  }
}

// Step 4: this project's keys that name a real task, the first 20 only.
async function resolveTasks(
  supabase: SupabaseClient,
  repo: LinkedRepo,
  pr: PrSnapshot,
): Promise<Array<{ taskId: string; closes: boolean }>> {
  const body = pr.body ?? "";
  const prefix = await getTaskPrefix(supabase, repo.project_id);
  const seen = new Set<string>();
  const refs = [
    ...findKeys(pr.title),
    ...findKeys(body),
    ...findKeys(pr.headRef, { ignoreCase: true }),
  ]
    .filter((ref) => {
      if (ref.prefix !== prefix || seen.has(keyId(ref))) return false;
      seen.add(keyId(ref));
      return true;
    })
    .slice(0, MAX_KEY_CANDIDATES);
  if (refs.length === 0) return [];

  const { data, error } = await supabase
    .from("tasks")
    .select("id, number")
    .eq("project_id", repo.project_id)
    .in(
      "number",
      refs.map((ref) => ref.number),
    );
  if (error) throw error;
  const taskByNumber = new Map(
    ((data ?? []) as Array<{ id: string; number: number }>).map((t) => [
      t.number,
      t.id,
    ]),
  );
  const closing = new Set(
    [...closingKeys(pr.title), ...closingKeys(body)].map(keyId),
  );
  return refs
    .filter((ref) => taskByNumber.has(ref.number))
    .slice(0, MAX_KEYS_PER_PR)
    .map((ref) => ({
      taskId: taskByNumber.get(ref.number) as string,
      closes: closing.has(keyId(ref)),
    }));
}

async function writeLinkEvent(
  supabase: SupabaseClient,
  projectId: string,
  change: LinkChange,
): Promise<void> {
  const { error } = await supabase.from("task_events").insert({
    task_id: change.taskId,
    project_id: projectId,
    actor_id: null,
    kind: change.previousState === null ? "pr_linked" : "pr_state_changed",
    detail: { source: "github", taskLinkId: change.id, state: change.state },
  });
  if (error) throw error;
}

// A merged link is final: only a merged snapshot may refresh its title (AC-48d).
async function refreshMergedLink(
  supabase: SupabaseClient,
  repo: LinkedRepo,
  pr: PrSnapshot,
  link: LinkRow,
): Promise<LinkChange> {
  if (pr.merged) {
    const { error } = await supabase
      .from("task_links")
      .update({
        repo_full_name: repo.full_name,
        pr_title: pr.title,
        pr_url: pr.url,
        pr_updated_at: pr.updatedAt,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", link.id);
    if (error) throw error;
  }
  return {
    id: link.id,
    taskId: link.task_id,
    previousState: "merged",
    state: "merged",
    closes: link.closes,
    wasClosing: link.closes,
    fromFork: link.from_fork,
  };
}

async function refreshOpenLink(
  supabase: SupabaseClient,
  repo: LinkedRepo,
  pr: PrSnapshot,
  link: LinkRow,
  closes: boolean,
): Promise<LinkChange> {
  // Conditional, so a slower older event can never overwrite a newer one.
  const { data, error } = await supabase
    .from("task_links")
    .update({
      repo_full_name: repo.full_name,
      pr_title: pr.title,
      pr_url: pr.url,
      state: pr.state,
      closes,
      from_fork: pr.fromFork,
      base_ref: pr.baseRef,
      merge_sha: pr.mergeSha,
      merged_at: pr.mergedAt,
      pr_updated_at: pr.updatedAt,
      last_synced_at: new Date().toISOString(),
    })
    .eq("id", link.id)
    .neq("state", "merged")
    .lte("pr_updated_at", pr.updatedAt)
    .select("id");
  if (error) throw error;
  const applied = ((data ?? []) as unknown[]).length > 0;
  return {
    id: link.id,
    taskId: link.task_id,
    previousState: link.state,
    state: applied ? pr.state : link.state,
    closes: applied ? closes : link.closes,
    wasClosing: link.closes,
    fromFork: pr.fromFork,
  };
}

async function insertLink(
  supabase: SupabaseClient,
  repo: LinkedRepo,
  pr: PrSnapshot,
  taskId: string,
  closes: boolean,
): Promise<LinkChange | null> {
  const { data, error } = await supabase
    .from("task_links")
    .upsert(
      {
        task_id: taskId,
        repo_id: repo.repo_id,
        repo_full_name: repo.full_name,
        pr_number: pr.number,
        pr_title: pr.title,
        pr_url: pr.url,
        state: pr.state,
        closes,
        from_fork: pr.fromFork,
        base_ref: pr.baseRef,
        merge_sha: pr.mergeSha,
        merged_at: pr.mergedAt,
        pr_updated_at: pr.updatedAt,
      },
      { onConflict: "task_id,repo_id,pr_number", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw error;
  const inserted = ((data ?? []) as Array<{ id: string }>)[0];
  // A parallel run inserted it first, and that run writes the event and the move.
  if (!inserted) return null;
  return {
    id: inserted.id,
    taskId,
    previousState: null,
    state: pr.state,
    closes,
    wasClosing: false,
    fromFork: pr.fromFork,
  };
}

// Step 5: create and refresh links. A key gone from the text keeps its link but
// stops closing (AC-48c). Once a PR is merged it gains no new links, so editing a
// key into an old PR completes nothing, through a webhook or through Sync.
async function writeLinks(
  supabase: SupabaseClient,
  repo: LinkedRepo,
  pr: PrSnapshot,
  links: LinkRow[],
  targets: Array<{ taskId: string; closes: boolean }>,
): Promise<LinkChange[]> {
  const closesByTask = new Map(targets.map((t) => [t.taskId, t.closes]));
  const existingTasks = new Set(links.map((l) => l.task_id));
  const alreadyMerged = links.some((l) => l.state === "merged");
  const changes: LinkChange[] = [];

  for (const link of links) {
    const change =
      link.state === "merged"
        ? await refreshMergedLink(supabase, repo, pr, link)
        : await refreshOpenLink(
            supabase,
            repo,
            pr,
            link,
            closesByTask.get(link.task_id) ?? false,
          );
    changes.push(change);
    if (change.state !== change.previousState) {
      await writeLinkEvent(supabase, repo.project_id, change);
    }
  }

  if (alreadyMerged) return changes;

  for (const target of targets) {
    if (existingTasks.has(target.taskId)) continue;
    const change = await insertLink(
      supabase,
      repo,
      pr,
      target.taskId,
      target.closes,
    );
    if (!change) continue;
    changes.push(change);
    await writeLinkEvent(supabase, repo.project_id, change);
  }
  return changes;
}

async function hasOtherActivePr(
  supabase: SupabaseClient,
  change: LinkChange,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("task_links")
    .select("id")
    .eq("task_id", change.taskId)
    .neq("id", change.id)
    .eq("from_fork", false)
    .in("state", ["open", "draft"])
    .limit(1);
  if (error) throw error;
  return ((data ?? []) as unknown[]).length > 0;
}

// Step 6: only a new link or a changed state moves a card, so a `synchronize` or a
// Sync never undoes a person's move. Fork PRs move nothing. A closed PR moves a card
// back only when it was seen open before, for the same reason.
async function moveFor(
  supabase: SupabaseClient,
  change: LinkChange,
): Promise<{ from: string[]; to: string } | null> {
  if (change.fromFork || change.state === change.previousState) return null;
  if (change.state === "draft") return { from: ["todo"], to: "in_progress" };
  if (change.state === "open") {
    return { from: ["todo", "in_progress"], to: "in_review" };
  }
  if (change.state !== "closed" || change.previousState === null) return null;
  if (await hasOtherActivePr(supabase, change)) return null;
  return { from: ["in_review"], to: "in_progress" };
}

async function fireMoves(
  supabase: SupabaseClient,
  changes: LinkChange[],
  result: ApplyResult,
): Promise<void> {
  for (const change of changes) {
    const move = await moveFor(supabase, change);
    if (!move) continue;
    const { data, error } = await supabase.rpc("apply_github_move", {
      p_task: change.taskId,
      p_from: move.from,
      p_to: move.to,
      p_link: change.id,
    });
    if (error) throw error;
    if (data === "moved") result.moved++;
  }
}

// Step 7: safe to repeat, so a redelivery after a crash finishes the job. Tasks that
// just lost a closing link are included, since it may have been the last one blocking.
async function completeTasks(
  supabase: SupabaseClient,
  changes: LinkChange[],
  result: ApplyResult,
): Promise<void> {
  const taskIds = new Set(
    changes.filter((c) => c.closes || c.wasClosing).map((c) => c.taskId),
  );
  for (const taskId of taskIds) {
    const { data, error } = await supabase.rpc("apply_merge_completion", {
      p_task: taskId,
    });
    if (error) throw error;
    if (data === "completed") result.completed++;
  }
}

export async function applyPrSnapshot(
  supabase: SupabaseClient,
  repo: LinkedRepo,
  pr: PrSnapshot,
  source: SnapshotSource,
): Promise<ApplyResult> {
  const result: ApplyResult = {
    linked: 0,
    moved: 0,
    completed: 0,
    reopened: 0,
  };

  const links = await loadLinks(supabase, repo.repo_id, pr.number);
  if (links.some((link) => isNewer(link.pr_updated_at, pr.updatedAt))) {
    return result;
  }

  const revert = isRevert(pr.title, pr.body);
  if (revert) await applyRevert(supabase, repo, pr, result);

  const isEdit = source.kind === "webhook" && source.action === "edited";
  if (isEdit && (pr.merged || links.some((link) => link.state === "merged"))) {
    const { error } = await supabase
      .from("task_links")
      .update({ pr_title: pr.title, pr_updated_at: pr.updatedAt })
      .eq("repo_id", repo.repo_id)
      .eq("pr_number", pr.number)
      .eq("state", "merged");
    if (error) throw error;
    return result;
  }

  // A revert names no keys, even though its title repeats "Closes NM-42" (AC-48b).
  const targets = revert ? [] : await resolveTasks(supabase, repo, pr);
  const changes = await writeLinks(supabase, repo, pr, links, targets);
  result.linked = changes.filter((c) => c.previousState === null).length;
  await fireMoves(supabase, changes, result);
  await completeTasks(supabase, changes, result);
  return result;
}

type RepoRow = LinkedRepo & { installation_id: number };

async function loadPayloadRepo(
  supabase: SupabaseClient,
  repoId: number,
): Promise<RepoRow | null> {
  const { data, error } = await supabase
    .from("github_repos")
    .select("repo_id, project_id, full_name, default_branch, installation_id")
    .eq("repo_id", repoId)
    .maybeSingle();
  if (error) throw error;
  const repo = (data as RepoRow | null) ?? null;
  if (!repo) return null;
  const live = await liveInstallationIds(supabase, [repo.installation_id]);
  return live.has(repo.installation_id) ? repo : null;
}

async function liveInstallationIds(
  supabase: SupabaseClient,
  ids: number[],
): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const { data, error } = await supabase
    .from("github_installations")
    .select("installation_id")
    .in("installation_id", ids)
    .is("deleted_at", null)
    .is("suspended_at", null);
  if (error) throw error;
  return new Set(
    ((data ?? []) as Array<{ installation_id: number }>).map(
      (row) => row.installation_id,
    ),
  );
}

export type WebhookPayload = {
  action?: string;
  installation?: { id?: number };
  pull_request?: GitHubPull;
  repository?: { id: number; full_name: string; default_branch: string };
  repositories_removed?: Array<{ id: number }>;
};

async function handlePullRequest(
  supabase: SupabaseClient,
  payload: WebhookPayload,
): Promise<"processed" | "ignored"> {
  const { action, pull_request: pr, repository } = payload;
  if (!action || !HANDLED_PR_ACTIONS.has(action) || !pr || !repository) {
    return "ignored";
  }
  const row = await loadPayloadRepo(supabase, repository.id);
  if (!row) return "ignored";

  const repo: LinkedRepo = {
    repo_id: row.repo_id,
    project_id: row.project_id,
    full_name: repository.full_name,
    default_branch: repository.default_branch,
  };
  const { error } = await supabase
    .from("github_repos")
    .update({
      full_name: repo.full_name,
      default_branch: repo.default_branch,
    })
    .eq("repo_id", repo.repo_id);
  if (error) throw error;

  await applyPrSnapshot(
    supabase,
    repo,
    snapshotFromWebhook({ pull_request: pr, repository }),
    { kind: "webhook", action },
  );
  return "processed";
}

async function setInstallationField(
  supabase: SupabaseClient,
  installationId: number,
  fields: Record<string, string | null>,
): Promise<void> {
  const { error } = await supabase
    .from("github_installations")
    .update(fields)
    .eq("installation_id", installationId);
  if (error) throw error;
}

// `created` is ignored, because the callback writes that row with its proof.
async function handleInstallation(
  supabase: SupabaseClient,
  payload: WebhookPayload,
): Promise<"processed" | "ignored"> {
  const id = payload.installation?.id;
  if (!id) return "ignored";
  const now = new Date().toISOString();
  if (payload.action === "deleted") {
    await setInstallationField(supabase, id, { deleted_at: now });
    const { error } = await supabase
      .from("github_repos")
      .delete()
      .eq("installation_id", id);
    if (error) throw error;
    return "processed";
  }
  if (payload.action === "suspend") {
    await setInstallationField(supabase, id, { suspended_at: now });
    return "processed";
  }
  if (payload.action === "unsuspend") {
    await setInstallationField(supabase, id, { suspended_at: null });
    return "processed";
  }
  return "ignored";
}

async function handleInstallationRepos(
  supabase: SupabaseClient,
  payload: WebhookPayload,
): Promise<"processed" | "ignored"> {
  const removed = (payload.repositories_removed ?? []).map((r) => r.id);
  if (payload.action !== "removed" || removed.length === 0) return "ignored";
  const { error } = await supabase
    .from("github_repos")
    .delete()
    .in("repo_id", removed);
  if (error) throw error;
  return "processed";
}

/** Runs one verified delivery. `ping` and anything unhandled come back `ignored`. */
export function handleGitHubEvent(
  supabase: SupabaseClient,
  event: string,
  payload: WebhookPayload,
): Promise<"processed" | "ignored"> {
  if (event === "pull_request") return handlePullRequest(supabase, payload);
  if (event === "installation") return handleInstallation(supabase, payload);
  if (event === "installation_repositories") {
    return handleInstallationRepos(supabase, payload);
  }
  return Promise.resolve("ignored");
}

type SyncRun = {
  supabase: SupabaseClient;
  result: GitHubSyncResult;
  seen: Set<string>;
  now: () => number;
  startedAt: number;
};

const prId = (repoId: number, number: number): string => `${repoId}#${number}`;

// True when a limit says to stop, which also marks the run as cut short.
function outOfBudget(run: SyncRun): boolean {
  if (
    run.result.prsRead < SYNC_MAX_PRS &&
    run.now() - run.startedAt < SYNC_MAX_MS
  ) {
    return false;
  }
  run.result.partial = true;
  return true;
}

async function syncSnapshot(
  run: SyncRun,
  repo: LinkedRepo,
  pr: GitHubPull,
): Promise<void> {
  try {
    const applied = await applyPrSnapshot(
      run.supabase,
      repo,
      snapshotFromRest(pr, repo.repo_id),
      { kind: "sync" },
    );
    run.result.linked += applied.linked;
    run.result.moved += applied.moved;
    run.result.completed += applied.completed;
    run.result.reopened += applied.reopened;
  } catch (err) {
    run.result.failed++;
    console.error("[github] sync of a PR failed:", err);
  }
}

// Refreshes name and default branch, and returns the repos still readable.
async function refreshInstallationRepos(
  run: SyncRun,
  repos: RepoRow[],
  installationId: number,
  token: string,
): Promise<LinkedRepo[]> {
  const listing = await installationRepos(installationId, token);
  const byId = new Map(listing.map((r) => [r.id, r]));
  const fresh: LinkedRepo[] = [];
  for (const repo of repos) {
    const seen = byId.get(repo.repo_id);
    if (!seen) continue;
    const { error } = await run.supabase
      .from("github_repos")
      .update({
        full_name: seen.full_name,
        default_branch: seen.default_branch,
      })
      .eq("repo_id", repo.repo_id);
    if (error) throw error;
    fresh.push({
      repo_id: repo.repo_id,
      project_id: repo.project_id,
      full_name: seen.full_name,
      default_branch: seen.default_branch,
    });
  }
  return fresh;
}

async function syncRecentPulls(
  run: SyncRun,
  repo: LinkedRepo,
  token: string,
): Promise<void> {
  if (outOfBudget(run)) return;
  let pulls: GitHubPull[];
  try {
    pulls = await recentPulls(repo.full_name, token);
  } catch (err) {
    run.result.failed++;
    console.error("[github] sync could not list PRs:", err);
    return;
  }
  // Oldest first: a revert must land after the PR it reverts, or a PR never seen
  // before would be linked and completed after its own revert was skipped.
  for (const pr of [...pulls].reverse()) {
    if (outOfBudget(run)) return;
    run.result.prsRead++;
    run.seen.add(prId(repo.repo_id, pr.number));
    await syncSnapshot(run, repo, pr);
  }
}

async function syncOpenLinks(
  run: SyncRun,
  repos: Array<{ repo: LinkedRepo; token: string }>,
): Promise<void> {
  if (repos.length === 0 || run.result.partial) return;
  const byRepo = new Map(repos.map((r) => [r.repo.repo_id, r]));
  const { data, error } = await run.supabase
    .from("task_links")
    .select("repo_id, pr_number")
    .in("repo_id", [...byRepo.keys()])
    .in("state", ["open", "draft"])
    .order("last_synced_at", { ascending: true })
    .limit(SYNC_MAX_PRS * 3);
  if (error) throw error;

  for (const link of (data ?? []) as Array<{
    repo_id: number;
    pr_number: number;
  }>) {
    const id = prId(link.repo_id, link.pr_number);
    const target = byRepo.get(link.repo_id);
    if (run.seen.has(id) || !target) continue;
    if (outOfBudget(run)) return;
    run.seen.add(id);
    run.result.prsRead++;
    try {
      const pr = await pull(
        target.repo.full_name,
        link.pr_number,
        target.token,
      );
      await syncSnapshot(run, target.repo, pr);
    } catch (err) {
      run.result.failed++;
      console.error("[github] sync could not read a PR:", err);
      // Move it to the back of the queue, so one dead PR cannot hog every run.
      await run.supabase
        .from("task_links")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("repo_id", link.repo_id)
        .eq("pr_number", link.pr_number);
    }
  }
}

/** Reads each linked repo again and applies the same rules as the webhook (AC-54). */
export async function syncProject(
  supabase: SupabaseClient,
  projectId: string,
  now: () => number = Date.now,
): Promise<GitHubSyncResult> {
  const run: SyncRun = {
    supabase,
    now,
    startedAt: now(),
    seen: new Set(),
    result: {
      repos: 0,
      prsRead: 0,
      linked: 0,
      moved: 0,
      completed: 0,
      reopened: 0,
      failed: 0,
      partial: false,
    },
  };

  const { data, error } = await supabase
    .from("github_repos")
    .select("repo_id, project_id, full_name, default_branch, installation_id")
    .eq("project_id", projectId);
  if (error) throw error;
  const rows = (data ?? []) as RepoRow[];
  const live = await liveInstallationIds(supabase, [
    ...new Set(rows.map((r) => r.installation_id)),
  ]);

  const repos: Array<{ repo: LinkedRepo; token: string }> = [];
  for (const installationId of live) {
    try {
      const token = await installationToken(installationId);
      const fresh = await refreshInstallationRepos(
        run,
        rows.filter((r) => r.installation_id === installationId),
        installationId,
        token,
      );
      repos.push(...fresh.map((repo) => ({ repo, token })));
    } catch (err) {
      run.result.failed++;
      console.error("[github] sync could not read an installation:", err);
    }
  }
  run.result.repos = repos.length;

  for (const { repo, token } of repos) {
    await syncRecentPulls(run, repo, token);
  }
  await syncOpenLinks(run, repos);
  return run.result;
}
