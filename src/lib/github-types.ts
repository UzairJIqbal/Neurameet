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

export const PR_STATE_LABELS: Record<PrState, string> = {
  draft: "Draft",
  open: "Open",
  closed: "Closed",
  merged: "Merged",
};
