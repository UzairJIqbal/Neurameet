import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lastSyncedAt } from "@/lib/project-cards";
import { taskKey } from "@/lib/tasks";
import type {
  GitHubLinkedPull,
  GitHubSummaryRepo,
  GitHubSummaryResponse,
  PrState,
} from "@/lib/github-types";

const PAGE_SIZE = 1000;
export const SUMMARY_PULLS_MAX = 100;

type LinkRow = {
  id: string;
  task_id: string;
  repo_id: number;
  repo_full_name: string;
  pr_number: number;
  pr_title: string;
  pr_url: string;
  pr_author_login: string | null;
  state: PrState;
  merged_at: string | null;
  reverted_at: string | null;
  tasks: { number: number } | { number: number }[] | null;
};

const LINK_COLUMNS =
  "id, task_id, repo_id, repo_full_name, pr_number, pr_title, pr_url, pr_author_login, state, merged_at, reverted_at, tasks!inner(project_id, number)";

// Every link in the project, read past the default row cap, newest first.
async function loadLinks(
  supabase: SupabaseClient,
  projectId: string,
): Promise<LinkRow[]> {
  const rows: LinkRow[] = [];
  for (;;) {
    const { data, error } = await supabase
      .from("task_links")
      .select(LINK_COLUMNS)
      .eq("tasks.project_id", projectId)
      .order("pr_updated_at", { ascending: false })
      .order("id", { ascending: true })
      .range(rows.length, rows.length + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as LinkRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

const numberOf = (row: LinkRow): number | null => {
  const task = Array.isArray(row.tasks) ? row.tasks[0] : row.tasks;
  return task?.number ?? null;
};

/** One row per PR, because a PR naming two tasks has two links. */
export function groupPulls(
  rows: LinkRow[],
  prefix: string,
): GitHubLinkedPull[] {
  const pulls = new Map<string, GitHubLinkedPull>();
  for (const row of rows) {
    const id = `${row.repo_id}#${row.pr_number}`;
    const pull = pulls.get(id) ?? {
      repoFullName: row.repo_full_name,
      number: row.pr_number,
      title: row.pr_title,
      url: row.pr_url,
      authorLogin: row.pr_author_login,
      state: row.state,
      mergedAt: row.merged_at,
      reverted: false,
      taskKeys: [],
    };
    pull.reverted = pull.reverted || row.reverted_at !== null;
    const number = numberOf(row);
    if (number !== null) pull.taskKeys.push(taskKey(prefix, number));
    pulls.set(id, pull);
  }
  return [...pulls.values()];
}

export async function loadGitHubSummary(
  supabase: SupabaseClient,
  projectId: string,
): Promise<GitHubSummaryResponse> {
  const [project, repos, links, synced] = await Promise.all([
    supabase
      .from("projects")
      .select("task_prefix")
      .eq("id", projectId)
      .maybeSingle(),
    supabase
      .from("github_repos")
      .select("repo_id, full_name, private, default_branch")
      .eq("project_id", projectId)
      .order("full_name", { ascending: true }),
    loadLinks(supabase, projectId),
    lastSyncedAt(supabase, projectId),
  ]);
  if (project.error) throw project.error;
  if (repos.error) throw repos.error;

  const prefix = (project.data as { task_prefix: string } | null)?.task_prefix;
  const pulls = groupPulls(links, prefix ?? "");
  const repoRows = (repos.data ?? []) as Array<{
    repo_id: number;
    full_name: string;
    private: boolean;
    default_branch: string;
  }>;
  return {
    repos: repoRows.map((r): GitHubSummaryRepo => ({
      repoId: r.repo_id,
      fullName: r.full_name,
      private: r.private,
      defaultBranch: r.default_branch,
    })),
    lastSyncedAt: synced,
    counts: {
      openPrs: pulls.filter((p) => p.state === "open" || p.state === "draft")
        .length,
      mergedPrs: pulls.filter((p) => p.state === "merged").length,
      linkedTasks: new Set(links.map((l) => l.task_id)).size,
    },
    pulls: pulls.slice(0, SUMMARY_PULLS_MAX),
    truncated: pulls.length > SUMMARY_PULLS_MAX,
  };
}
