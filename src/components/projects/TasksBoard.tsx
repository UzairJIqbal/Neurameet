/* eslint-disable prettier/prettier */
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { LayoutGrid, List, Plus, Search } from "lucide-react";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import { LoaderOne } from "@/components/ui/loader";
import { LoadError } from "@/components/ui/load-error";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import {
  getTask,
  listMembers,
  listTasks,
  ProjectClientError,
  updateTask,
} from "@/lib/project-client";
import { patchDenial } from "@/lib/task-rules";
import { readStoredView, writeStoredView } from "@/lib/user-prefs";
import {
  BOARD_REFETCH_MS,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  columnCards,
  dropPosition,
  isTaskStatus,
  type TaskStatus,
} from "@/lib/tasks";
import type {
  ProjectDetail,
  ProjectMember,
  ProjectRole,
} from "@/lib/project-types";
import type { Task, TasksResponse } from "@/lib/task-types";
import TaskCard from "./TaskCard";
import TasksList from "./TasksList";
import TaskDrawer from "./TaskDrawer";
import CompleteTaskDialog from "./CompleteTaskDialog";
import NewTaskDialog from "./NewTaskDialog";

type PendingComplete = { task: Task; position: number };

const inputClass =
  "rounded-xl border border-surface-variant bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface focus:border-primary focus:outline-none";
const primaryButton =
  "inline-flex items-center gap-2 rounded-full bg-primary-container px-4 py-2 text-body-md text-on-primary hover:bg-primary disabled:opacity-50";

const SEARCH_DEBOUNCE_MS = 300;

const VIEW_KEY = "neurameet:tasks-view";
const VIEWS = ["board", "list"] as const;
type View = (typeof VIEWS)[number];

const errorText = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

// The Kanban board (AC-41). Every move is optimistic and sends ifVersion; a
// 409 puts the card back and refetches. The server checks the same role rules
// the board uses to refuse a drop early.
const TasksBoard = ({
  project,
  reloadKey = 0,
}: {
  project: ProjectDetail;
  reloadKey?: number;
}) => {
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
  const [priority, setPriority] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [view, setView] = useState<View>("board");
  const [isLoading, setIsLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [pending, setPending] = useState<PendingComplete | null>(null);
  const [saving, setSaving] = useState(false);
  const [newStatus, setNewStatus] = useState<TaskStatus | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const { timedOut } = useLoadingTimeout(isLoading && !loaded, {
    timeoutMs: 12000,
    retryNonce,
  });

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
      const data = await listTasks(
        project.id,
        { q: search, assigneeId: assignee, priority, status: statusFilter },
        signal,
      );
      setTasks(data.tasks);
      setTruncated(data.truncated);
    },
    [project.id, search, assignee, priority, statusFilter],
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
  }, [fetchBoard, project.id, retryNonce, reloadKey]);

  useEffect(() => {
    setView(readStoredView(VIEW_KEY, VIEWS, "board"));
  }, []);

  const chooseView = (next: View) => {
    setView(next);
    writeStoredView(VIEW_KEY, next);
  };

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

  // A PATCH answer has no board fields, so the card keeps the ones it holds.
  const replaceTask = (next: Task) =>
    setTasks((prev) =>
      prev.map((t) => (t.id === next.id ? { ...t, ...next } : t)),
    );

  const changeCommentCount = (taskId: string, delta: number) =>
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, commentCount: Math.max(0, (t.commentCount ?? 0) + delta) }
          : t,
      ),
    );

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
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    )
      return;
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

    const position = dropPosition(
      tasks,
      original.id,
      status,
      destination.index,
    );
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

  if (timedOut)
    return <LoadError message="We couldn't load the board." onRetry={reload} />;
  if (!loaded && isLoading) return <LoaderOne />;
  if (!loaded)
    return <LoadError message="We couldn't load the board." onRetry={reload} />;

  const canCreate = role !== "viewer";
  // AC-70p: positions are relative to the full column, not a filtered part of it.
  const filterOn = Boolean(
    query.trim() || assignee || priority || statusFilter,
  );
  const canDrag = role !== "viewer" && !filterOn;
  const isEmpty = tasks.length === 0 && !filterOn;
  const isTruncated = Object.keys(truncated).length > 0;
  const columns = TASK_STATUSES.filter(
    (status) => !statusFilter || status === statusFilter,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative flex items-center">
          <span className="sr-only">Search tasks</span>
          <Search
            className="pointer-events-none absolute left-3 h-4 w-4 text-on-surface-variant"
            aria-hidden
          />
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
        <select
          aria-label="Filter by priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className={inputClass}
        >
          <option value="">All priorities</option>
          {TASK_PRIORITIES.map((value) => (
            <option key={value} value={value}>
              {TASK_PRIORITY_LABELS[value]}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={inputClass}
        >
          <option value="">All statuses</option>
          {TASK_STATUSES.map((value) => (
            <option key={value} value={value}>
              {TASK_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg border border-surface-variant">
            {VIEWS.map((key) => {
              const Icon = key === "board" ? LayoutGrid : List;
              return (
                <button
                  key={key}
                  type="button"
                  aria-label={key === "board" ? "Board view" : "List view"}
                  aria-pressed={view === key}
                  onClick={() => chooseView(key)}
                  className={`p-2 ${view === key ? "bg-primary-container text-on-primary" : "text-on-surface-variant hover:bg-surface-container-low"}`}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </button>
              );
            })}
          </div>
          {canCreate && !isEmpty && (
            <button
              type="button"
              onClick={() => setNewStatus("todo")}
              className={primaryButton}
            >
              <Plus className="h-4 w-4" />
              Add Task
            </button>
          )}
        </div>
      </div>

      {filterOn && view === "board" && role !== "viewer" && (
        <p className="text-body-md text-on-surface-variant">
          Dragging is off while a filter is on.
        </p>
      )}

      {isEmpty && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-surface-container-lowest p-5 shadow-card">
          <p className="text-body-md text-on-surface-variant">
            No tasks yet. Tasks come from reviewed proposals, or you can add
            one.
          </p>
          {canCreate && (
            <button
              type="button"
              onClick={() => setNewStatus("todo")}
              className={primaryButton}
            >
              Add Task
            </button>
          )}
        </div>
      )}

      {view === "list" && !isEmpty && (
        <div className="flex flex-col gap-2">
          {tasks.length === 0 ? (
            <p className="rounded-card bg-surface-container-lowest p-5 text-body-md text-on-surface-variant shadow-card">
              No tasks match these filters.
            </p>
          ) : (
            <TasksList
              tasks={tasks}
              showRestricted={role !== "viewer"}
              onOpen={setOpenTaskId}
            />
          )}
          {isTruncated && (
            <p className="text-body-md text-on-surface-variant">
              Long columns show their first tasks only.
            </p>
          )}
        </div>
      )}

      {view === "board" && (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div
            className={`grid grid-cols-1 gap-4 ${statusFilter ? "" : "md:grid-cols-2 xl:grid-cols-5"}`}
          >
            {columns.map((status) => {
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
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-label-mono text-on-surface-variant">
                        {total ?? cards.length}
                      </span>
                      {/* Completing needs an evidence note, so Completed has no `+`. */}
                      {canCreate && status !== "completed" && (
                        <button
                          type="button"
                          aria-label={`Add a task to ${TASK_STATUS_LABELS[status]}`}
                          onClick={() => setNewStatus(status)}
                          className="rounded p-0.5 text-on-surface-variant hover:bg-surface-container"
                        >
                          <Plus className="h-4 w-4" aria-hidden />
                        </button>
                      )}
                    </span>
                  </header>
                  <Droppable droppableId={status}>
                    {(drop) => (
                      <div
                        ref={drop.innerRef}
                        {...drop.droppableProps}
                        className="flex min-h-24 flex-col gap-2"
                      >
                        {cards.map((task, index) => (
                          <Draggable
                            key={task.id}
                            draggableId={task.id}
                            index={index}
                            isDragDisabled={!canDrag || saving}
                          >
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
                                  if (!e.defaultPrevented)
                                    setOpenTaskId(task.id);
                                }}
                                onKeyUp={(e) => {
                                  if (e.key === "Enter" && !e.defaultPrevented)
                                    setOpenTaskId(task.id);
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
      )}

      {pending && (
        <CompleteTaskDialog
          taskKey={pending.task.key}
          busy={saving}
          onCancel={cancelComplete}
          onConfirm={confirmComplete}
        />
      )}
      {openTaskId && (
        <TaskDrawer
          taskId={openTaskId}
          onClose={closeDrawer}
          onChanged={replaceTask}
          onCommentsChanged={(delta) => changeCommentCount(openTaskId, delta)}
        />
      )}
      {newStatus && (
        <NewTaskDialog
          projectId={project.id}
          members={members}
          initialStatus={newStatus}
          onClose={() => setNewStatus(null)}
          onCreated={(task) => {
            setNewStatus(null);
            setTasks((prev) => [...prev, task]);
            refresh();
          }}
        />
      )}
    </div>
  );
};

export default TasksBoard;
