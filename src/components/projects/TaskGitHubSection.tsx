/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useRef, useState } from "react";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { getTaskCommits } from "@/lib/project-client";
import { PR_STATE_LABELS, type TaskPrLink } from "@/lib/github-types";
import type { TaskPrCommits } from "@/lib/task-types";

const HEADING = "text-label-caps uppercase tracking-wider text-on-surface-variant";
const MUTED = "text-body-md text-on-surface-variant";
const badge =
  "rounded-full bg-primary-container/15 px-2 py-0.5 text-label-caps uppercase tracking-wider text-primary-container";

// Viewers get the state only, so a row must work with no repo, number, or title.
const PrRow = ({ link }: { link: TaskPrLink }) => (
  <li className="flex flex-col gap-1 rounded-lg border border-surface-variant p-3">
    <div className="flex flex-wrap items-center gap-2">
      {link.repoFullName && (
        <span className="break-all font-mono text-label-mono text-on-surface-variant">
          {link.repoFullName} #{link.prNumber}
        </span>
      )}
      <span className={badge}>{PR_STATE_LABELS[link.state]}</span>
      {link.reverted && (
        <span className="rounded-full bg-error-container px-2 py-0.5 text-label-caps uppercase tracking-wider text-on-error-container">
          Reverted
        </span>
      )}
    </div>
    {link.prUrl && (
      <a
        href={link.prUrl}
        target="_blank"
        rel="noopener noreferrer"
        dir="auto"
        className="w-fit break-words text-body-md text-primary underline"
      >
        {link.prTitle}
      </a>
    )}
  </li>
);

const CommitList = ({ pullRequests }: { pullRequests: TaskPrCommits[] }) => {
  if (pullRequests.every((pr) => pr.commits.length === 0)) {
    return <p className={MUTED}>No commits to show.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {pullRequests.map((pr) => (
        <div key={`${pr.repoFullName}#${pr.prNumber}`} className="flex flex-col gap-1">
          <span className="break-all font-mono text-label-mono text-on-surface-variant">
            {pr.repoFullName} #{pr.prNumber}
          </span>
          <ul className="flex flex-col gap-1">
            {pr.commits.map((commit) => (
              <li key={commit.url} className="flex flex-wrap items-baseline gap-x-2 text-body-md">
                <a
                  href={commit.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-label-mono text-primary underline"
                >
                  {commit.sha}
                </a>
                <span dir="auto" className="min-w-0 break-words text-on-surface">
                  {commit.message}
                </span>
                {commit.authorLogin && <span className={MUTED}>{commit.authorLogin}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};

const CommitsPanel = ({ taskId }: { taskId: string }) => {
  const [pullRequests, setPullRequests] = useState<TaskPrCommits[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const { timedOut } = useLoadingTimeout(isLoading, { timeoutMs: 12000 });

  useEffect(() => {
    if (timedOut) controllerRef.current?.abort();
  }, [timedOut]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const load = async () => {
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsLoading(true);
    setFailed(false);
    try {
      const data = await getTaskCommits(taskId, controller.signal);
      setPullRequests(data.pullRequests);
    } catch (err) {
      console.error("Failed to read the commits:", err);
      setFailed(true);
    } finally {
      setIsLoading(false);
    }
  };

  if (pullRequests) return <CommitList pullRequests={pullRequests} />;
  return (
    <div className="flex flex-col items-start gap-2">
      {(failed || timedOut) && (
        <p role="alert" className="text-body-md text-error">
          We couldn&apos;t read the commits from GitHub.
        </p>
      )}
      <button
        type="button"
        onClick={load}
        disabled={isLoading}
        className="text-body-md text-primary underline disabled:opacity-50"
      >
        {isLoading ? "Loading..." : failed ? "Try again" : "Show commits"}
      </button>
    </div>
  );
};

type Props = {
  taskId: string;
  links: TaskPrLink[];
  /** Developer or higher. A Viewer never reads commits. */
  showCommits: boolean;
};

// The drawer's GitHub section (AC-70q). Commits are read from GitHub on click
// and kept only while the drawer is open.
const TaskGitHubSection = ({ taskId, links, showCommits }: Props) => (
  <section aria-label="GitHub" className="flex flex-col gap-2">
    <h3 className={HEADING}>GitHub</h3>
    {links.length === 0 ? (
      <p className={MUTED}>No pull requests name this task yet.</p>
    ) : (
      <>
        <ul className="flex flex-col gap-2">
          {links.map((link) => (
            <PrRow key={link.id} link={link} />
          ))}
        </ul>
        {showCommits && <CommitsPanel taskId={taskId} />}
      </>
    )}
  </section>
);

export default TaskGitHubSection;
