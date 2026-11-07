/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { LoaderOne } from "@/components/ui/loader";
import { LoadError } from "@/components/ui/load-error";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { linkGitHubRepo, listGitHubRepos, unlinkGitHubRepo } from "@/lib/project-client";
import type { ProjectDetail } from "@/lib/project-types";
import type { GitHubRepoChoice, GitHubReposResponse } from "@/lib/github-types";

const primaryButton =
  "inline-flex items-center gap-2 rounded-lg bg-primary-container px-4 py-2 text-body-md text-on-primary hover:bg-primary disabled:opacity-50";
const secondaryButton =
  "rounded-lg border border-surface-variant px-4 py-2 text-body-md text-on-surface hover:bg-surface-container-low disabled:opacity-50";
const badge =
  "rounded-full bg-primary-container/15 px-2 py-0.5 text-label-caps uppercase tracking-wider text-primary-container";

const errorText = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

type Outcome = { kind: "success" | "error"; text: string };

// What the callback's ?github= code means for the person reading it (AC-43a).
const OUTCOMES: Record<string, Outcome> = {
  connected: { kind: "success", text: "GitHub is connected. Pick a repository to link." },
  not_yours: { kind: "error", text: "That GitHub installation isn't on your account, so nothing was saved." },
  requested: { kind: "success", text: "Sent to your organization owner. Come back here once they approve it." },
  failed: { kind: "error", text: "We couldn't connect GitHub. Please try again." },
};

const RepoRow = ({
  repo,
  busy,
  onLink,
  onUnlink,
}: {
  repo: GitHubRepoChoice;
  busy: boolean;
  onLink: () => void;
  onUnlink: () => void;
}) => (
  <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="break-all font-mono text-label-mono text-on-surface">{repo.fullName}</span>
      {repo.private && <span className={badge}>Private</span>}
    </div>
    {repo.link === "this" && (
      <button type="button" disabled={busy} onClick={onUnlink} className={secondaryButton}>
        Unlink
      </button>
    )}
    {repo.link === "none" && (
      <button type="button" disabled={busy} onClick={onLink} className={primaryButton}>
        Link
      </button>
    )}
    {repo.link === "other" && (
      <span className="text-body-md text-on-surface-variant">Linked to another project</span>
    )}
  </li>
);

// Owner only: connect the GitHub App and choose which repos feed this project.
const GitHubTab = ({
  project,
  connected = true,
  onChanged,
}: {
  project: ProjectDetail;
  connected?: boolean;
  onChanged?: () => void;
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [data, setData] = useState<GitHubReposResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [retryNonce, setRetryNonce] = useState(0);
  const [busyRepo, setBusyRepo] = useState<number | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const { timedOut } = useLoadingTimeout(isLoading, { timeoutMs: 12000, retryNonce });

  const outcomeCode = searchParams.get("github");

  // Show the callback's result once, then drop it so a refresh doesn't repeat it.
  useEffect(() => {
    if (!outcomeCode) return;
    const outcome = OUTCOMES[outcomeCode];
    if (outcome) {
      // A fixed id, so React's double run of effects in dev shows one toast.
      if (outcome.kind === "success") toast.success(outcome.text, { id: "github-outcome" });
      else toast.error(outcome.text, { id: "github-outcome" });
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete("github");
    router.replace(`${pathname}?${params.toString()}`);
  }, [outcomeCode, pathname, router, searchParams]);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    const load = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);
        setData(await listGitHubRepos(project.id, controller.signal));
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("Failed to load GitHub repositories:", err);
        setLoadError(errorText(err, "We couldn't load your repositories."));
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [project.id, retryNonce]);

  useEffect(() => {
    if (timedOut) controllerRef.current?.abort();
  }, [timedOut]);

  const reload = () => setRetryNonce((k) => k + 1);

  const change = async (repo: GitHubRepoChoice, action: "link" | "unlink") => {
    setBusyRepo(repo.repoId);
    try {
      if (action === "link") await linkGitHubRepo(project.id, repo.repoId);
      else await unlinkGitHubRepo(project.id, repo.repoId);
      toast.success(action === "link" ? `Linked ${repo.fullName}` : `Unlinked ${repo.fullName}`);
      reload();
      onChanged?.();
    } catch (err) {
      toast.error(errorText(err, `Failed to ${action} the repository`));
    } finally {
      setBusyRepo(null);
    }
  };

  if (timedOut) return <LoadError message="We couldn't load your repositories." onRetry={reload} />;
  if (isLoading && !data) return <LoaderOne />;
  if (loadError || !data) {
    return <LoadError message={loadError ?? "We couldn't load your repositories."} onRetry={reload} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-xl border border-surface-variant bg-surface-container-lowest p-6">
        {!connected && <p className="text-body-md text-on-surface">GitHub is not connected.</p>}
        <h2 className="text-headline-sm font-semibold text-on-surface">Connect GitHub</h2>
        <p className="text-body-md text-on-surface-variant">
          Name a task key like {project.taskPrefix}-12 in a pull request and the task follows it. Merging a PR with
          &quot;Closes {project.taskPrefix}-12&quot; into the default branch completes the task.
        </p>
        <div className="flex flex-wrap gap-3">
          <a href={data.installUrl} className={primaryButton}>
            Install the GitHub App
          </a>
          <a href={data.authorizeUrl} className={secondaryButton}>
            I already installed it
          </a>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-headline-sm font-semibold text-on-surface">Repositories</h2>
        {data.repos.length === 0 ? (
          <p className="text-body-md text-on-surface-variant">
            No repositories yet. Install the App, or choose &quot;I already installed it&quot; if it is on your account.
          </p>
        ) : (
          <ul className="divide-y divide-surface-variant rounded-xl border border-surface-variant bg-surface-container-lowest">
            {data.repos.map((repo) => (
              <RepoRow
                key={repo.repoId}
                repo={repo}
                busy={busyRepo !== null}
                onLink={() => change(repo, "link")}
                onUnlink={() => change(repo, "unlink")}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default GitHubTab;
