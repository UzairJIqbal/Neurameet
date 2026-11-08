/* eslint-disable prettier/prettier */
"use client";

import { SkeletonCard } from "@/components/ui/skeleton";
import React, { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { relativeTime } from "@/lib/chatHistory";
import { ConfirmDelete } from "@/components/ui/confirm-delete";
import { LoadError } from "@/components/ui/load-error";
import {
  getGitHubSummary,
  syncGitHub,
  unlinkGitHubRepo,
} from "@/lib/project-client";
import {
  PR_STATE_LABELS,
  syncSummary,
  type GitHubLinkedPull,
  type GitHubSummaryRepo,
  type GitHubSummaryResponse,
  type PrState,
} from "@/lib/github-types";
import type { ProjectFull } from "@/lib/project-types";
import GitHubTab from "./GitHubTab";
import { useCardLoad } from "./useCardLoad";

const SUB_VIEWS = ["overview", "pulls", "settings"] as const;
type SubView = (typeof SUB_VIEWS)[number];
const SUB_VIEW_LABELS: Record<SubView, string> = {
  overview: "Overview",
  pulls: "Pull Requests",
  settings: "Settings",
};

const OVERVIEW_ROWS = 5;
const secondaryButton =
  "rounded-full border border-surface-variant px-3 py-1.5 text-body-md text-on-surface hover:bg-surface-container-low disabled:opacity-50";
const badge = "rounded-full px-2 py-0.5 text-xs font-medium";
const HEAD =
  "px-3 py-2 text-left text-label-caps uppercase tracking-wider text-on-surface-variant";
const CELL = "px-3 py-2 align-top text-body-md text-on-surface-variant";

const STATE_STYLES: Record<PrState, string> = {
  draft: "bg-secondary-container text-on-secondary-container",
  open: "bg-success-container text-on-success-container",
  closed: "bg-error-container text-on-error-container",
  merged: "bg-primary-container/15 text-primary-container",
};

const AUTOMATION_RULES = [
  "A pull request links to a task when its title, body, or branch names the task key.",
  "A draft pull request moves a To Do task to In Progress. A ready one moves it to In Review.",
  "A pull request closed without merging moves the task back to In Progress when no other open one is linked.",
  'Merging a pull request that says "Closes" before the key into the default branch completes the task.',
  "A merge never marks a promise kept. It adds a suggestion, and an Owner or Admin confirms it.",
  "A revert reopens a task that its pull request completed.",
  "A pull request from a fork links to the task, and moves or blocks nothing until it is merged.",
  "GitHub never deletes a task or changes its title or assignee.",
];

const WEBHOOK_EVENTS = [
  {
    name: "pull_request",
    detail: "Links pull requests, moves tasks, and completes them.",
  },
  {
    name: "installation",
    detail: "Stops processing when the App is removed or suspended.",
  },
  {
    name: "installation_repositories",
    detail: "Unlinks a repository the App can no longer reach.",
  },
];

const errorText = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

const syncLabel = (iso: string | null) => {
  if (!iso) return "Not synced yet";
  const age = relativeTime(new Date(iso).getTime());
  return age === "now" ? "Synced just now" : `Synced ${age} ago`;
};

const mergeStatus = (pull: GitHubLinkedPull) => {
  if (pull.reverted) return "Reverted";
  if (!pull.mergedAt) return "Not merged";
  const date = new Date(pull.mergedAt).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
  return `Merged ${date}`;
};

const RepoCard = ({
  repo,
  lastSyncedAt,
  canDisconnect,
  onDisconnect,
}: {
  repo: GitHubSummaryRepo;
  lastSyncedAt: string | null;
  canDisconnect: boolean;
  onDisconnect: (repo: GitHubSummaryRepo) => Promise<void>;
}) => (
  <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="break-all font-label-mono text-label-mono text-on-surface">
          {repo.fullName}
        </span>
        <span
          className={`${badge} bg-surface-container-low text-on-surface-variant`}
        >
          {repo.private ? "Private" : "Public"}
        </span>
      </div>
      <span className="text-xs text-on-surface-variant">
        Default branch {repo.defaultBranch} · {syncLabel(lastSyncedAt)}
      </span>
    </div>
    {canDisconnect && (
      <ConfirmDelete
        onConfirm={() => onDisconnect(repo)}
        label="Disconnect"
        confirmLabel="Yes, disconnect"
        warning="New pull requests stop linking. Links already on tasks stay."
      />
    )}
  </li>
);

const StatCard = ({ label, value }: { label: string; value: number }) => (
  <div className="flex flex-col gap-1 rounded-card bg-surface-container-lowest p-4 shadow-card">
    <span className="text-xs text-on-surface-variant">{label}</span>
    <span className="text-headline-sm text-on-surface">{value}</span>
  </div>
);

const PullTable = ({ pulls }: { pulls: GitHubLinkedPull[] }) => (
  <div className="overflow-x-auto rounded-lg border border-surface-variant bg-surface-container-lowest">
    <table className="w-full min-w-[48rem]">
      <thead className="border-b border-surface-variant">
        <tr>
          <th className={HEAD}>Pull request</th>
          <th className={HEAD}>Author</th>
          <th className={HEAD}>State</th>
          <th className={HEAD}>Merge status</th>
          <th className={HEAD}>Task</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-surface-variant">
        {pulls.map((pull) => (
          <tr key={`${pull.repoFullName}#${pull.number}`}>
            <td className={CELL}>
              <a
                href={pull.url}
                target="_blank"
                rel="noopener noreferrer"
                className="break-words text-on-surface hover:text-primary"
              >
                #{pull.number} {pull.title}
              </a>
              <div className="break-all font-label-mono text-label-mono">
                {pull.repoFullName}
              </div>
            </td>
            <td className={CELL}>{pull.authorLogin}</td>
            <td className={CELL}>
              <span className={`${badge} ${STATE_STYLES[pull.state]}`}>
                {PR_STATE_LABELS[pull.state]}
              </span>
            </td>
            <td className={CELL}>{mergeStatus(pull)}</td>
            <td className={`${CELL} font-label-mono text-label-mono`}>
              {pull.taskKeys.join(", ")}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const NO_PULLS =
  "No pull requests are linked yet. Pushing commits alone does not sync. Open a pull request that names a task key to link it.";

const PullsNote = ({ data }: { data: GitHubSummaryResponse }) => (
  <p className="text-xs text-on-surface-variant">
    Only pull requests linked to tasks are shown
    {data.truncated ? `, the latest ${data.pulls.length}` : ""}.
  </p>
);

const AutomationSettings = () => (
  <div className="flex flex-col gap-4 rounded-card bg-surface-container-lowest p-5 shadow-card">
    <div className="flex flex-col gap-2">
      <h3 className="text-body-lg font-medium text-on-surface">
        Automation rules
      </h3>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-body-md text-on-surface-variant">
        {AUTOMATION_RULES.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
    </div>
    <div className="flex flex-col gap-2">
      <h3 className="text-body-lg font-medium text-on-surface">
        Webhook events
      </h3>
      <ul className="flex flex-col gap-1 text-body-md text-on-surface-variant">
        {WEBHOOK_EVENTS.map((event) => (
          <li key={event.name}>
            <span className="font-label-mono text-label-mono text-on-surface">
              {event.name}
            </span>{" "}
            {event.detail}
          </li>
        ))}
      </ul>
    </div>
  </div>
);

type Props = { project: ProjectFull; reloadKey: number; onChanged: () => void };

// AC-70i: linked repos and linked PRs for Developers and up. The Owner's connect
// flow stays in GitHubTab, shown when nothing is linked and behind a button.
const GitHubPanel = ({ project, reloadKey, onChanged }: Props) => {
  const searchParams = useSearchParams();
  const isOwner = project.role === "owner";
  const canSync = isOwner || project.role === "admin";
  const connected = project.github.connected;
  // Back from GitHub, the install result shows inside the connect flow.
  const [managing, setManaging] = useState(
    () => isOwner && searchParams.has("github"),
  );
  const [view, setView] = useState<SubView>("overview");
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(
    (signal: AbortSignal) => getGitHubSummary(project.id, signal),
    // reloadKey refetches after a change made in the header or below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project.id, reloadKey],
  );
  const summary = useCardLoad(load, connected);

  const runSync = async () => {
    setSyncing(true);
    try {
      toast.success(syncSummary(await syncGitHub(project.id)));
      onChanged();
    } catch (err) {
      toast.error(errorText(err, "Failed to sync with GitHub"));
    } finally {
      setSyncing(false);
    }
  };

  const disconnect = async (repo: GitHubSummaryRepo) => {
    try {
      await unlinkGitHubRepo(project.id, repo.repoId);
      toast.success(`Disconnected ${repo.fullName}`);
      onChanged();
    } catch (err) {
      toast.error(errorText(err, "Failed to disconnect the repository"));
    }
  };

  if (!connected && !isOwner) {
    return (
      <div className="flex flex-col gap-2 rounded-card bg-surface-container-lowest p-5 shadow-card">
        <p className="text-body-md text-on-surface">GitHub is not connected.</p>
        <p className="text-body-md text-on-surface-variant">
          The project Owner connects it.
        </p>
      </div>
    );
  }
  if (!connected)
    return (
      <GitHubTab project={project} connected={false} onChanged={onChanged} />
    );

  const { data } = summary;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {canSync && (
          <button
            type="button"
            disabled={syncing}
            onClick={runSync}
            className={secondaryButton}
          >
            {syncing ? "Syncing..." : "Sync now"}
          </button>
        )}
        {isOwner && (
          <button
            type="button"
            onClick={() => setManaging((open) => !open)}
            className={secondaryButton}
          >
            {managing ? "Hide repositories" : "Manage repositories"}
          </button>
        )}
      </div>

      {managing && <GitHubTab project={project} onChanged={onChanged} />}

      {!data && summary.failed && (
        <LoadError
          compact
          message="We couldn't load the GitHub summary."
          onRetry={summary.retry}
        />
      )}
      {!data && !summary.failed && <SkeletonCard />}

      {data && (
        <>
          <ul className="divide-y divide-surface-variant rounded-lg border border-surface-variant bg-surface-container-lowest">
            {data.repos.map((repo) => (
              <RepoCard
                key={repo.repoId}
                repo={repo}
                lastSyncedAt={data.lastSyncedAt}
                canDisconnect={isOwner}
                onDisconnect={disconnect}
              />
            ))}
          </ul>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard label="Open linked PRs" value={data.counts.openPrs} />
            <StatCard label="Merged linked PRs" value={data.counts.mergedPrs} />
            <StatCard label="Linked tasks" value={data.counts.linkedTasks} />
          </div>

          <nav
            role="tablist"
            aria-label="GitHub views"
            className="flex gap-1 overflow-x-auto border-b border-surface-variant"
          >
            {SUB_VIEWS.map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={key === view}
                onClick={() => setView(key)}
                className={
                  key === view
                    ? "whitespace-nowrap border-b-2 border-primary px-3 py-2 text-body-md font-medium text-primary"
                    : "whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-body-md text-on-surface-variant hover:text-on-surface"
                }
              >
                {SUB_VIEW_LABELS[key]}
              </button>
            ))}
          </nav>

          {view === "settings" && <AutomationSettings />}
          {view !== "settings" && data.pulls.length === 0 && (
            <p className="text-body-md text-on-surface-variant">{NO_PULLS}</p>
          )}
          {view !== "settings" && data.pulls.length > 0 && (
            <>
              <PullTable
                pulls={
                  view === "overview"
                    ? data.pulls.slice(0, OVERVIEW_ROWS)
                    : data.pulls
                }
              />
              <PullsNote data={data} />
            </>
          )}
        </>
      )}
    </div>
  );
};

export default GitHubPanel;
