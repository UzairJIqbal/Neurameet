// GitHub shapes for the routes and the UI (no server-only imports).

export type PrState = "draft" | "open" | "closed" | "merged";

/** One PR, built the same way from a webhook payload or a REST response. */
export interface PrSnapshot {
  repoId: number;
  number: number;
  title: string;
  body: string | null;
  url: string;
  state: PrState;
  merged: boolean;
  mergedAt: string | null;
  mergeSha: string | null;
  baseRef: string;
  headRef: string;
  fromFork: boolean;
  updatedAt: string;
  authorLogin: string | null;
}

/** The PR fields read from GitHub. A deleted fork leaves `head.repo` null. */
export interface GitHubPull {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: string;
  draft?: boolean;
  merged_at: string | null;
  merge_commit_sha: string | null;
  updated_at: string;
  user?: { login?: string } | null;
  base: { ref: string; repo?: { id: number } | null };
  head: { ref: string; repo?: { id: number } | null };
}

export interface GitHubRepoListing {
  id: number;
  full_name: string;
  default_branch: string;
  private: boolean;
}

export interface GitHubInstallationListing {
  id: number;
  account: { login?: string; type?: string } | null;
}

/** `other` never names the other project. */
export type RepoLinkState = "this" | "other" | "none";

export interface GitHubRepoChoice {
  repoId: number;
  fullName: string;
  private: boolean;
  installationId: number;
  accountLogin: string;
  link: RepoLinkState;
}

export interface GitHubReposResponse {
  repos: GitHubRepoChoice[];
  installUrl: string;
  authorizeUrl: string;
}

export interface GitHubSyncResult {
  repos: number;
  prsRead: number;
  linked: number;
  moved: number;
  completed: number;
  reopened: number;
  failed: number;
  partial: boolean;
}

/** Viewers get only `id`, `state`, `merged`, and `reverted` (AC-55). */
export interface TaskPrLink {
  id: string;
  state: PrState;
  merged: boolean;
  reverted: boolean;
  repoFullName?: string;
  prNumber?: number;
  prTitle?: string;
  prUrl?: string;
}

/** One PR linked to tasks in this project. A PR naming two tasks is one row. */
export interface GitHubLinkedPull {
  repoFullName: string;
  number: number;
  title: string;
  url: string;
  authorLogin: string | null;
  state: PrState;
  mergedAt: string | null;
  reverted: boolean;
  taskKeys: string[];
}

export interface GitHubSummaryRepo {
  repoId: number;
  fullName: string;
  private: boolean;
  defaultBranch: string;
}

/** Counts and rows cover only PRs linked to tasks (AC-70i). */
export interface GitHubSummaryResponse {
  repos: GitHubSummaryRepo[];
  lastSyncedAt: string | null;
  counts: { openPrs: number; mergedPrs: number; linkedTasks: number };
  /** The most recently updated, capped; `counts` cover every linked PR. */
  pulls: GitHubLinkedPull[];
  truncated: boolean;
}

export const PR_STATE_LABELS: Record<PrState, string> = {
  draft: "Draft",
  open: "Open",
  closed: "Closed",
  merged: "Merged",
};

/** The toast after a Sync, in the header menu and on the GitHub tab. */
export const syncSummary = (result: GitHubSyncResult): string => {
  if (result.repos === 0)
    return "No repositories are linked to this project yet.";
  const parts = [
    `Read ${result.prsRead} PR${result.prsRead === 1 ? "" : "s"}`,
    `${result.linked} linked`,
    `${result.moved} moved`,
    `${result.completed} completed`,
    `${result.reopened} reopened`,
  ];
  if (result.failed > 0) parts.push(`${result.failed} failed`);
  return `${parts.join(", ")}.${result.partial ? " Run it again for the rest." : ""}`;
};
