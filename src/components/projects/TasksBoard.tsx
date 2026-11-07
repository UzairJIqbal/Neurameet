/* eslint-disable prettier/prettier */
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { Plus, RefreshCw, Search } from "lucide-react";
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { LoaderOne } from "@/components/ui/loader";
import { LoadError } from "@/components/ui/load-error";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { getTask, listMembers, listTasks, ProjectClientError, syncGitHub, updateTask } from "@/lib/project-client";
import { patchDenial } from "@/lib/task-rules";
import {
  BOARD_REFETCH_MS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  columnCards,
  dropPosition,
  isTaskStatus,
  type TaskStatus,
} from "@/lib/tasks";
import type { ProjectDetail, ProjectMember, ProjectRole } from "@/lib/project-types";
import type { Task, TasksResponse } from "@/lib/task-types";
import type { GitHubSyncResult } from "@/lib/github-types";
import TaskCard from "./TaskCard";
import TaskDrawer from "./TaskDrawer";
import CompleteTaskDialog from "./CompleteTaskDialog";
import NewTaskDialog from "./NewTaskDialog";

type PendingComplete = { task: Task; position: number };

const inputClass =
  "rounded-lg border border-surface-variant bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface focus:border-primary focus:outline-none";
const primaryButton =
  "inline-flex items-center gap-2 rounded-lg bg-primary-container px-4 py-2 text-body-md text-on-primary hover:bg-primary disabled:opacity-50";

const secondaryButton =
  "inline-flex items-center gap-2 rounded-lg border border-surface-variant px-4 py-2 text-body-md text-on-surface hover:bg-surface-container-low disabled:opacity-50";

const SEARCH_DEBOUNCE_MS = 300;

const errorText = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

const syncSummary = (result: GitHubSyncResult): string => {
  if (result.repos === 0) return "No repositories are linked to this project yet.";
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

// The Kanban board (AC-41). Every move is optimistic and sends ifVersion; a
// 409 puts the card back and refetches. The server checks the same role rules
// the board uses to refuse a drop early.
const TasksBoard = ({ project }: { project: ProjectDetail }) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const taskParam = searchParams.get("task");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [truncated, setTruncated] = useState<TasksResponse["truncated"]>({});
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [me, setMe] = useState("");
  const [role, setRole] = useState<ProjectRole>(project.role);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [assignee, setAssignee] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [pending, setPending] = useState<PendingComplete | null>(null);
  const [saving, setSaving] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const { timedOut } = useLoadingTimeout(isLoading && !loaded, { timeoutMs: 12000, retryNonce });

  busyRef.current = pending !== null || saving;

  const clearTaskParam = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("task");
    const rest = params.toString();
    router.replace(rest ? `${pathname}?${rest}` : pathname, { scroll: false });
  };
  const clearTaskParamRef = useRef(clearTaskParam);
  clearTaskParamRef.current = clearTaskParam;

  // A citation link (?task=). The board may not hold the task because of its
  // filters, so the id is checked once against the server.
  useEffect(() => {
    if (!taskParam) return;
    const controller = new AbortController();
    getTask(taskParam, controller.signal)
      .then(() => setOpenTaskId(taskParam))
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error("Failed to open the linked task:", err);
        toast.error("We couldn't open that task.");
        clearTaskParamRef.current();
      });
    return () => controller.abort();
  }, [taskParam]);

  const closeDrawer = () => {
    setOpenTaskId(null);
    if (taskParam) clearTaskParam();
  };

  const fetchBoard = useCallback(
    async (signal?: AbortSignal) => {
      const data = await listTasks(project.id, { q: search, assigneeId: assignee }, signal);
      setTasks(data.tasks);
      setTruncated(data.truncated);
    },
    [project.id, search, assignee],
  );

  // First load, and again whenever the filters change.
  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    const load = async () => {
      try {
        setIsLoading(true);
        const [, memberData] = await Promise.all([
          fetchBoard(controller.signal),
          listMembers(project.id, controller.signal),
        ]);
        setMembers(memberData.members);
        setMe(memberData.me);
        setRole(memberData.myRole);
        setLoaded(true);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("Failed to load tasks:", err);
        toast.error(errorText(err, "Failed to load tasks"));
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [fetchBoard, project.id, retryNonce]);

  useEffect(() => {
    if (timedOut) controllerRef.current?.abort();
  }, [timedOut]);

  useEffect(() => {
    const id = setTimeout(() => setSearch(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  // Quiet refresh on focus and on a timer, skipped while a move is in flight.
  const refresh = useCallback(() => {
    if (busyRef.current) return;
    fetchBoard().catch((err) => console.error("Board refresh failed:", err));
  }, [fetchBoard]);

  useEffect(() => {
    window.addEventListener("focus", refresh);
    const id = setInterval(refresh, BOARD_REFETCH_MS);
    return () => {
      window.removeEventListener("focus", refresh);
      clearInterval(id);
    };
  }, [refresh]);

  const replaceTask = (next: Task) =>
    setTasks((prev) => prev.map((t) => (t.id === next.id ? next : t)));

  const sendMove = async (
    original: Task,
    status: TaskStatus,
    position: number,
    completionEvidence?: string,
  ) => {
    setSaving(true);
    try {
      const { task } = await updateTask(original.id, {
        status,
        position,
        ifVersion: original.version,
        ...(completionEvidence ? { completionEvidence } : {}),
      });
      replaceTask(task);
      return true;
    } catch (err) {
      replaceTask(original);
      if (err instanceof ProjectClientError && err.status === 409) {
        toast.error("Someone else changed this task. The board was refreshed.");
        const fresh = (err.data as { task?: Task } | null)?.task;
        if (fresh) replaceTask(fresh);
        fetchBoard().catch(() => undefined);
      } else {
        toast.error(errorText(err, "Failed to move the task"));
      }
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination || !isTaskStatus(destination.droppableId)) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;
    const original = tasks.find((t) => t.id === draggableId);
    if (!original) return;
    const status = destination.droppableId;

    const denial = patchDenial(
      role,
      me,
      { status: original.status, assignee_id: original.assigneeId },
      { status },
    );
    if (denial) {
      toast.error(denial);
      return;
    }

    const position = dropPosition(tasks, original.id, status, destination.index);
    replaceTask({ ...original, status, position });

    if (status === "completed" && original.status !== "completed") {
      setPending({ task: original, position });
      return;
    }
    void sendMove(original, status, position);
  };

  const cancelComplete = () => {
    if (pending) replaceTask(pending.task);
    setPending(null);
  };

  const confirmComplete = async (evidence: string) => {
    if (!pending) return;
    await sendMove(pending.task, "completed", pending.position, evidence);
    setPending(null);
  };

  const reload = useCallback(() => setRetryNonce((k) => k + 1), []);

  const runSync = async () => {
    setSyncing(true);
    try {
      toast.success(syncSummary(await syncGitHub(project.id)));
      await fetchBoard();
    } catch (err) {
      toast.error(errorText(err, "Failed to sync with GitHub"));
    } finally {
      setSyncing(false);
    }
  };

  if (timedOut) return <LoadError message="We couldn't load the board." onRetry={reload} />;
  if (!loaded && isLoading) return <LoaderOne />;
  if (!loaded) return <LoadError message="We couldn't load the board." onRetry={reload} />;

  const canCreate = role !== "viewer";
  const canDrag = role !== "viewer";
  const canSync = role === "owner" || role === "admin";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative flex items-center">
          <span className="sr-only">Search tasks</span>
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-on-surface-variant" aria-hidden />
          <input
            type="search"
            placeholder={`Search, or ${project.taskPrefix}-12`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={`${inputClass} pl-9`}
          />
        </label>
        <select
          aria-label="Filter by assignee"
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          className={inputClass}
        >
          <option value="">Everyone</option>
          <option value="none">Unassigned</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.name}
            </option>
          ))}
        </select>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {canSync && (
            <button type="button" disabled={syncing} onClick={runSync} className={secondaryButton}>
              <RefreshCw className="h-4 w-4" aria-hidden />
              {syncing ? "Syncing…" : "Sync GitHub"}
            </button>
          )}
          {canCreate && (
            <button type="button" onClick={() => setShowNew(true)} className={primaryButton}>
              <Plus className="h-4 w-4" />
              New task
            </button>
          )}
        </div>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {TASK_STATUSES.map((status) => {
            const cards = columnCards(tasks, status);
            const total = truncated[status];
            return (
              <section
                key={status}
                aria-label={TASK_STATUS_LABELS[status]}
                className="flex min-w-0 flex-col gap-3 rounded-xl border border-surface-variant bg-surface-container-low p-3"
              >
                <header className="flex items-center justify-between">
                  <h3 className="text-label-caps uppercase tracking-wider text-on-surface-variant">
                    {TASK_STATUS_LABELS[status]}
                  </h3>
                  <span className="font-mono text-label-mono text-on-surface-variant">{total ?? cards.length}</span>
                </header>
                <Droppable droppableId={status}>
                  {(drop) => (
                    <div ref={drop.innerRef} {...drop.droppableProps} className="flex min-h-24 flex-col gap-2">
                      {cards.map((task, index) => (
                        <Draggable key={task.id} draggableId={task.id} index={index} isDragDisabled={!canDrag || saving}>
                          {(drag) => (
                            <div
                              role="button"
                              tabIndex={0}
                              ref={drag.innerRef}
                              {...drag.draggableProps}
                              {...drag.dragHandleProps}
                              aria-label={`Open ${task.key}`}
                              onClick={(e) => {
                                // The drag library cancels the click that ends a drag.
                                if (!e.defaultPrevented) setOpenTaskId(task.id);
                              }}
                              onKeyUp={(e) => {
                                if (e.key === "Enter" && !e.defaultPrevented) setOpenTaskId(task.id);
                              }}
                            >
                              <TaskCard task={task} />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {drop.placeholder}
                    </div>
                  )}
                </Droppable>
                {total !== undefined && (
                  <p className="text-body-md text-on-surface-variant">
                    Showing {cards.length} of {total}
                  </p>
                )}
              </section>
            );
          })}
        </div>
      </DragDropContext>

      {pending && (
        <CompleteTaskDialog
          taskKey={pending.task.key}
          busy={saving}
          onCancel={cancelComplete}
          onConfirm={confirmComplete}
        />
      )}
      {openTaskId && <TaskDrawer taskId={openTaskId} onClose={closeDrawer} />}
      {showNew && (
        <NewTaskDialog
          projectId={project.id}
          members={members}
          onClose={() => setShowNew(false)}
          onCreated={(task) => {
            setShowNew(false);
            setTasks((prev) => [...prev, task]);
          }}
        />
      )}
    </div>
  );
};

export default TasksBoard;
