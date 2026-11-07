/* eslint-disable prettier/prettier */
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { X } from "lucide-react";
import { LoaderOne } from "@/components/ui/loader";
import { LoadError } from "@/components/ui/load-error";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { ProjectClientError, getTask, listMembers, updateTask } from "@/lib/project-client";
import { isManagerRole } from "@/lib/task-rules";
import { TASK_STATUS_LABELS, isTaskStatus } from "@/lib/tasks";
import type { Task, TaskComment, TaskDetailResponse, TaskEvent, TaskEventKind } from "@/lib/task-types";
import OutcomeCard from "./OutcomeCard";
import TaskComments from "./TaskComments";
import TaskFields, { type DrawerAccess, type TaskSave } from "./TaskFields";
import TaskGitHubSection from "./TaskGitHubSection";

const HEADING = "text-label-caps uppercase tracking-wider text-on-surface-variant";

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
  commented: "left a comment",
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

const isHttpUrl = (value: string): boolean => {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

// A manual note is whatever the person typed, so only a real web address links.
const CompletionSection = ({ task }: { task: Task }) => {
  const evidence = task.completionEvidence;
  const byMerge = task.completionKind === "merge";
  return (
    <section aria-label="Completion evidence" className="flex flex-col gap-2">
      <h3 className={HEADING}>Completion evidence</h3>
      <p className="text-body-md font-medium text-on-surface">{byMerge ? "Completed by merge" : "Completed by hand"}</p>
      {evidence &&
        (isHttpUrl(evidence) ? (
          <a href={evidence} target="_blank" rel="noopener noreferrer" className="w-fit break-all text-body-md text-primary underline">
            {byMerge ? "View the pull request" : evidence}
          </a>
        ) : (
          <p dir="auto" className="whitespace-pre-wrap break-words text-body-md text-on-surface">
            {evidence}
          </p>
        ))}
    </section>
  );
};

type BodyProps = {
  detail: TaskDetailResponse;
  access: DrawerAccess | null;
  saving: boolean;
  onSave: TaskSave;
  onCommentAdded: (comment: TaskComment) => void;
  onCommentRemoved: (commentId: string) => void;
};

const DrawerBody = ({ detail, access, saving, onSave, onCommentAdded, onCommentRemoved }: BodyProps) => {
  const { task, prLinks, events, comments } = detail;
  const activity = [...events].reverse();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="font-mono text-label-mono text-on-surface-variant">{task.key}</span>
        <h2 dir="auto" className="break-words text-headline-sm font-semibold text-on-surface">{task.title}</h2>
      </div>

      <TaskFields task={task} proofChain={detail.proofChain} access={access} saving={saving} onSave={onSave} />

      {detail.outcome && <OutcomeCard outcome={detail.outcome} />}

      {/* The route sends comments to everyone but a Viewer, the same line as commits. */}
      <TaskGitHubSection taskId={task.id} links={prLinks} showCommits={comments !== undefined} />

      {task.completionKind && <CompletionSection task={task} />}

      {comments && (
        <TaskComments
          taskId={task.id}
          comments={comments}
          truncated={detail.commentsTruncated ?? false}
          me={access?.me ?? null}
          isManager={access ? isManagerRole(access.role) : false}
          onAdded={onCommentAdded}
          onRemoved={onCommentRemoved}
        />
      )}

      <section aria-label="Activity" className="flex flex-col gap-2">
        <h3 className={HEADING}>Activity</h3>
        <ul className="flex flex-col gap-2">
          {activity.map((event) => (
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

type Props = {
  taskId: string;
  onClose: () => void;
  /** Called with the saved task so a board or list can update its row. */
  onChanged?: (task: Task) => void;
  onCommentsChanged?: (delta: number) => void;
};

const errorText = (err: unknown, fallback: string) =>
  err instanceof ProjectClientError ? err.message : fallback;

// Opened from a task row or card: the whole task, editable by role (AC-70q).
const TaskDrawer = ({ taskId, onClose, onChanged, onCommentsChanged }: Props) => {
  const [detail, setDetail] = useState<TaskDetailResponse | null>(null);
  const [access, setAccess] = useState<DrawerAccess | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  const { timedOut } = useLoadingTimeout(isLoading, { timeoutMs: 12000, retryNonce });
  const projectId = detail?.projectId;

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

  // The role and the assignee list come from here. Until it answers, or if it
  // fails, the fields read only rather than offer a change the route may refuse.
  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    listMembers(projectId, controller.signal)
      .then((data) => setAccess({ role: data.myRole, me: data.me, members: data.members }))
      .catch((err) => {
        if (!controller.signal.aborted) console.error("Failed to load the members:", err);
      });
    return () => controller.abort();
  }, [projectId]);

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

  // Quiet: the activity list catches up without the fields flashing a spinner.
  const reload = useCallback(async () => {
    try {
      setDetail(await getTask(taskId));
    } catch (err) {
      console.error("Failed to refresh the task:", err);
    }
  }, [taskId]);

  const save: TaskSave = async (patch) => {
    if (!detail) return false;
    setSaving(true);
    try {
      const { task } = await updateTask(taskId, { ...patch, ifVersion: detail.task.version });
      setDetail((prev) => (prev ? { ...prev, task: { ...prev.task, ...task } } : prev));
      onChanged?.(task);
      void reload();
      return true;
    } catch (err) {
      if (err instanceof ProjectClientError && err.status === 409) {
        toast.error("Someone else changed this task. We loaded the latest.");
        const fresh = (err.data as { task?: Task } | null)?.task;
        if (fresh) onChanged?.(fresh);
        await reload();
      } else {
        toast.error(errorText(err, "Failed to save the task"));
      }
      return false;
    } finally {
      setSaving(false);
    }
  };

  const commentAdded = (comment: TaskComment) => {
    setDetail((prev) => (prev ? { ...prev, comments: [comment, ...(prev.comments ?? [])] } : prev));
    onCommentsChanged?.(1);
    void reload();
  };

  const commentRemoved = (commentId: string) => {
    setDetail((prev) =>
      prev ? { ...prev, comments: (prev.comments ?? []).filter((c) => c.id !== commentId) } : prev,
    );
    onCommentsChanged?.(-1);
  };

  const retry = () => setRetryNonce((k) => k + 1);
  const failed = timedOut || (!isLoading && !detail);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-inverse-surface/50" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Task details"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-xl flex-col gap-4 overflow-y-auto border-l border-surface-variant bg-surface-container-lowest p-6 shadow-lg"
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
          <DrawerBody
            detail={detail}
            access={access}
            saving={saving}
            onSave={save}
            onCommentAdded={commentAdded}
            onCommentRemoved={commentRemoved}
          />
        )}
      </aside>
    </div>
  );
};

export default TaskDrawer;
