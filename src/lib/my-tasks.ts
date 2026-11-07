import { TASK_PRIORITIES, type TaskPriority } from "@/lib/tasks";
import type { MyTask } from "@/lib/task-types";

// My Tasks' derived values (AC-77). Dates are the YYYY-MM-DD strings the server
// sends, compared against the server's `today`, never the browser's clock.

export type MyTaskTab =
  "all" | "todo" | "in_progress" | "in_review" | "completed" | "overdue";

export const MY_TASK_TABS: ReadonlyArray<{ key: MyTaskTab; label: string }> = [
  { key: "all", label: "All" },
  { key: "todo", label: "To Do" },
  { key: "in_progress", label: "In Progress" },
  { key: "in_review", label: "In Review" },
  { key: "completed", label: "Completed" },
  { key: "overdue", label: "Overdue" },
];

export type MyTaskSort = "due" | "priority" | "updated";

export const MY_TASK_SORTS: ReadonlyArray<{ key: MyTaskSort; label: string }> =
  [
    { key: "due", label: "Sort: Due date" },
    { key: "priority", label: "Sort: Priority" },
    { key: "updated", label: "Sort: Updated" },
  ];

const dayNumber = (date: string): number => {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
};

export const isOverdue = (task: MyTask, today: string): boolean =>
  task.status !== "completed" && !!task.dueDate && task.dueDate < today;

/** From today through the next 6 days. */
export const isDueThisWeek = (task: MyTask, today: string): boolean => {
  if (task.status === "completed" || !task.dueDate) return false;
  const days = dayNumber(task.dueDate) - dayNumber(today);
  return days >= 0 && days <= 6;
};

export const inMyTaskTab = (
  task: MyTask,
  tab: MyTaskTab,
  today: string,
): boolean => {
  if (tab === "all") return true;
  if (tab === "overdue") return isOverdue(task, today);
  return task.status === tab;
};

export const dueLabel = (task: MyTask, today: string): string => {
  if (task.status === "completed") return "Done";
  if (!task.dueDate) return "No due date";
  if (isOverdue(task, today)) {
    return `${dayNumber(today) - dayNumber(task.dueDate)}d overdue`;
  }
  const date = new Date(dayNumber(task.dueDate) * 86_400_000);
  const text = date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  return `Due ${text}`;
};

// TASK_PRIORITIES runs low to urgent, so a higher index sorts first.
const priorityRank = (priority: TaskPriority): number =>
  -TASK_PRIORITIES.indexOf(priority);

const byDue = (a: MyTask, b: MyTask): number => {
  const doneA = a.status === "completed";
  const doneB = b.status === "completed";
  if (doneA !== doneB) return doneA ? 1 : -1;
  if (a.dueDate === b.dueDate) return 0;
  if (!a.dueDate) return 1;
  if (!b.dueDate) return -1;
  return a.dueDate < b.dueDate ? -1 : 1;
};

const COMPARE: Record<MyTaskSort, (a: MyTask, b: MyTask) => number> = {
  due: byDue,
  priority: (a, b) => priorityRank(a.priority) - priorityRank(b.priority),
  updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
};

export const sortMyTasks = (tasks: MyTask[], sort: MyTaskSort): MyTask[] =>
  [...tasks].sort((a, b) => COMPARE[sort](a, b) || a.key.localeCompare(b.key));

export const matchesMyTaskSearch = (task: MyTask, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    task.title.toLowerCase().includes(q) ||
    task.key.toLowerCase().includes(q) ||
    task.projectName.toLowerCase().includes(q)
  );
};
