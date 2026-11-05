/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { LoaderOne } from "@/components/ui/loader";
import { LoadError } from "@/components/ui/load-error";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { getTask } from "@/lib/project-client";
import { PR_STATE_LABELS, type TaskPrLink } from "@/lib/github-types";
import { TASK_STATUS_LABELS, isTaskStatus } from "@/lib/tasks";
import type { TaskDetailResponse, TaskEvent, TaskEventKind } from "@/lib/task-types";

const RECENT_EVENTS = 10;

const badge =
  "rounded-full bg-primary-container/15 px-2 py-0.5 text-label-caps uppercase tracking-wider text-primary-container";

const EVENT_LABELS: Record<TaskEventKind, string> = {
  created: "created this task",
  edited: "edited this task",
  status_changed: "changed the status",
  assigned: "assigned this task",
  unassigned: "unassigned this task",
  completed_manual: "completed this task",
  completed_by_merge: "completed this task by merge",
  reopened_by_revert: "reopened this task after a revert",
  pr_linked: "linked a pull request",
  pr_state_changed: "updated a pull request",
  proposal_merged: "merged a proposal into this task",
};

const statusLabel = (value: string | null): string | null =>
  value && isTaskStatus(value) ? TASK_STATUS_LABELS[value] : value;

const actorOf = (event: TaskEvent): string =>
  event.detail.source === "github" ? "GitHub" : (event.actorName ?? "Someone");

const eventText = (event: TaskEvent): string => {
  const base = `${actorOf(event)} ${EVENT_LABELS[event.kind] ?? "changed this task"}`;
  if (event.kind !== "status_changed") return base;
  return `${base}: ${statusLabel(event.fromValue)} to ${statusLabel(event.toValue)}`;
};

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

const CompletedByMerge = ({ evidence }: { evidence?: string | null }) => (
  <p className="text-body-md font-medium text-on-surface">
    Completed by merge
    {evidence && (
      <>
        {" · "}
        <a href={evidence} target="_blank" rel="noopener noreferrer" className="font-normal text-primary underline">
          View the pull request
        </a>
      </>
    )}
  </p>
);

const DrawerBody = ({ detail }: { detail: TaskDetailResponse }) => {
  const { task, prLinks, events } = detail;
  const recent = [...events].reverse().slice(0, RECENT_EVENTS);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="font-mono text-label-mono text-on-surface-variant">{task.key}</span>
        <h2 className="break-words text-headline-sm font-semibold text-on-surface">{task.title}</h2>
        <p className="text-body-md text-on-surface-variant">{TASK_STATUS_LABELS[task.status]}</p>
        {task.completionKind === "merge" && <CompletedByMerge evidence={task.completionEvidence} />}
      </div>

      <section aria-label="Pull requests" className="flex flex-col gap-2">
        <h3 className="text-label-caps uppercase tracking-wider text-on-surface-variant">Pull requests</h3>
        {prLinks.length === 0 ? (
          <p className="text-body-md text-on-surface-variant">No pull requests name this task yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {prLinks.map((link) => (
              <PrRow key={link.id} link={link} />
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Recent activity" className="flex flex-col gap-2">
        <h3 className="text-label-caps uppercase tracking-wider text-on-surface-variant">Recent activity</h3>
        <ul className="flex flex-col gap-2">
          {recent.map((event) => (
            <li key={event.id} className="flex flex-col text-body-md text-on-surface">
              <span>{eventText(event)}</span>
              <span className="font-mono text-label-mono text-on-surface-variant">
                {new Date(event.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

// Opened by clicking a board card: the task's PRs and recent history (AC-55).
const TaskDrawer = ({ taskId, onClose }: { taskId: string; onClose: () => void }) => {
  const [detail, setDetail] = useState<TaskDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [retryNonce, setRetryNonce] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  const { timedOut } = useLoadingTimeout(isLoading, { timeoutMs: 12000, retryNonce });

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    const load = async () => {
      try {
        setIsLoading(true);
        setDetail(await getTask(taskId, controller.signal));
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("Failed to load the task:", err);
        setDetail(null);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [taskId, retryNonce]);

  useEffect(() => {
    if (timedOut) controllerRef.current?.abort();
  }, [timedOut]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const retry = () => setRetryNonce((k) => k + 1);
  const failed = timedOut || (!isLoading && !detail);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-inverse-surface/50" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Task details"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto border-l border-surface-variant bg-surface-container-lowest p-6 shadow-lg"
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="self-end rounded-lg p-1 text-on-surface-variant hover:bg-surface-container-low"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
        {failed ? (
          <LoadError message="We couldn't load this task." onRetry={retry} />
        ) : isLoading || !detail ? (
          <LoaderOne />
        ) : (
          <DrawerBody detail={detail} />
        )}
      </aside>
    </div>
  );
};

export default TaskDrawer;
