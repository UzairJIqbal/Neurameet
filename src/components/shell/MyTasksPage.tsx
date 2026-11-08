/* eslint-disable prettier/prettier */
"use client";

import { SkeletonCard } from "@/components/ui/skeleton";
import React, { useMemo, useState } from "react";
import { CircleCheck, Search } from "lucide-react";
import { LoadError } from "@/components/ui/load-error";
import { cn } from "@/lib/utils";
import {
  MY_TASK_SORTS,
  MY_TASK_TABS,
  dueLabel,
  inMyTaskTab,
  isOverdue,
  matchesMyTaskSearch,
  sortMyTasks,
  type MyTaskSort,
  type MyTaskTab,
} from "@/lib/my-tasks";
import { listMyTasks } from "@/lib/project-client";
import type { MyTask } from "@/lib/task-types";
import TaskDrawer from "@/components/projects/TaskDrawer";
import {
  PriorityBadge,
  PrRefChips,
  TaskStatusChip,
} from "@/components/projects/task-visuals";
import { useCardLoad } from "@/components/projects/useCardLoad";

const HEAD =
  "px-3 py-2 text-left text-label-caps uppercase tracking-wider text-on-surface-variant";
const CELL = "px-3 py-2 align-top text-body-md text-on-surface-variant";
const CONTROL =
  "rounded-xl border border-surface-variant bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface focus:border-primary focus:outline-none";

const TaskRow = ({
  task,
  today,
  onOpen,
}: {
  task: MyTask;
  today: string;
  onOpen: (id: string) => void;
}) => {
  const done = task.status === "completed";
  return (
    <tr
      onClick={() => onOpen(task.id)}
      className="cursor-pointer hover:bg-surface-container-low"
    >
      <td className={CELL}>
        <button
          type="button"
          aria-label={`Open ${task.key}`}
          onClick={(e) => {
            e.stopPropagation();
            onOpen(task.id);
          }}
          className="flex flex-col items-start text-left"
        >
          <span
            className={cn(
              "break-words",
              done ? "text-on-surface-variant" : "text-on-surface",
            )}
          >
            {task.title}
          </span>
          <span className="text-body-md text-on-surface-variant">
            <span className="font-mono text-label-mono">{task.key}</span> ·{" "}
            {task.projectName}
          </span>
        </button>
      </td>
      <td className={CELL}>
        <div className="flex flex-wrap gap-1">
          <PrRefChips refs={task.prRefs ?? []} />
        </div>
      </td>
      <td className={CELL}>
        <PriorityBadge priority={task.priority} />
      </td>
      <td
        className={cn(
          CELL,
          "whitespace-nowrap",
          isOverdue(task, today) && "text-error",
        )}
      >
        {dueLabel(task, today)}
      </td>
      <td className={CELL}>
        <TaskStatusChip status={task.status} />
      </td>
    </tr>
  );
};

// One person's tasks across every active project (AC-77). Search, filter, and
// sort all run on the loaded list; only opening a task goes back to the server.
const MyTasksPage = () => {
  const { data, isLoading, failed, retry } = useCardLoad(listMyTasks);
  const [tab, setTab] = useState<MyTaskTab>("all");
  const [query, setQuery] = useState("");
  const [projectId, setProjectId] = useState("all");
  const [sort, setSort] = useState<MyTaskSort>("due");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const tasks = useMemo(() => data?.tasks ?? [], [data]);
  const today = data?.today ?? "";

  const projects = useMemo(() => {
    const names = new Map(
      tasks.map((task) => [task.projectId, task.projectName]),
    );
    return [...names.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [tasks]);

  const narrowed = useMemo(
    () =>
      tasks.filter(
        (task) =>
          (projectId === "all" || task.projectId === projectId) &&
          matchesMyTaskSearch(task, query),
      ),
    [tasks, projectId, query],
  );

  const shown = useMemo(
    () =>
      sortMyTasks(
        narrowed.filter((task) => inMyTaskTab(task, tab, today)),
        sort,
      ),
    [narrowed, tab, today, sort],
  );

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-headline-md text-on-surface">My Tasks</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          Only tasks assigned to you, across every project you belong to.
        </p>
      </header>

      {failed && !data ? (
        <LoadError
          compact
          message="We could not load your tasks."
          onRetry={retry}
        />
      ) : isLoading && !data ? (
        <SkeletonCard />
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-surface-variant bg-surface-container-lowest px-4 py-10 text-center">
          <CircleCheck
            className="h-8 w-8 text-on-surface-variant"
            aria-hidden
          />
          <p className="text-body-lg text-on-surface">
            Nothing assigned to you yet
          </p>
          <p className="text-body-md text-on-surface-variant">
            Tasks show up here once someone assigns them to you in a project.
          </p>
        </div>
      ) : (
        <>
          <div
            role="group"
            aria-label="Task status"
            className="flex flex-wrap gap-2"
          >
            {MY_TASK_TABS.map(({ key, label }) => {
              const count = narrowed.filter((task) =>
                inMyTaskTab(task, key, today),
              ).length;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={tab === key}
                  onClick={() => setTab(key)}
                  className={cn(
                    "rounded-full px-3 py-1 text-body-md",
                    tab === key
                      ? "bg-primary-container text-on-primary"
                      : "border border-surface-variant text-on-surface-variant hover:bg-surface-container-low",
                  )}
                >
                  {label}{" "}
                  <span className="font-mono text-label-mono">{count}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2 md:flex-row">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search my tasks</span>
              <Search
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant"
                aria-hidden
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search my tasks"
                className={cn(CONTROL, "w-full pl-9")}
              />
            </label>
            <label className="min-w-0 flex-1">
              <span className="sr-only">Project</span>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className={cn(CONTROL, "w-full")}
              >
                <option value="all">All projects</option>
                {projects.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-0 flex-1">
              <span className="sr-only">Sort</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as MyTaskSort)}
                className={cn(CONTROL, "w-full")}
              >
                {MY_TASK_SORTS.map(({ key, label }) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {shown.length === 0 ? (
            <p className="rounded-lg border border-surface-variant bg-surface-container-lowest px-4 py-8 text-center text-body-md text-on-surface-variant">
              No tasks match this view.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-surface-variant bg-surface-container-lowest">
              <table className="w-full min-w-[48rem]">
                <thead className="border-b border-surface-variant">
                  <tr>
                    <th className={HEAD}>Task and project</th>
                    <th className={HEAD}>PR refs</th>
                    <th className={HEAD}>Priority</th>
                    <th className={HEAD}>Due</th>
                    <th className={HEAD}>Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-variant">
                  {shown.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      today={today}
                      onOpen={setOpenTaskId}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data?.truncated && (
            <p className="text-body-md text-on-surface-variant">
              You have more open tasks than this list shows. It holds the 200
              due soonest.
            </p>
          )}
        </>
      )}

      {openTaskId && (
        <TaskDrawer
          taskId={openTaskId}
          onClose={() => setOpenTaskId(null)}
          onChanged={retry}
        />
      )}
    </div>
  );
};

export default MyTasksPage;
