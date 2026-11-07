import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PrState } from "@/lib/github-types";
import type { ProjectRole } from "@/lib/project-types";
import type { Task, TaskPrRef } from "@/lib/task-types";
import type { TaskPriority } from "@/lib/tasks";

// What a board or list row shows beyond the task itself (AC-70p). Read in bulk
// so one page of cards costs a few queries, not one per card.

// A long id list in the query string hits URL limits before it hits the rows.
const IN_LIST_SIZE = 200;

function chunks<T>(list: T[], size: number): T[][] {
  const parts: T[][] = [];
  for (let i = 0; i < list.length; i += size) {
    parts.push(list.slice(i, i + size));
  }
  return parts;
}

async function readInChunks<T>(
  ids: string[],
  read: (part: string[]) => Promise<T[]>,
): Promise<T[]> {
  const parts = await Promise.all(chunks(ids, IN_LIST_SIZE).map(read));
  return parts.flat();
}

async function meetingTitles(
  supabase: SupabaseClient,
  meetingIds: string[],
): Promise<Map<string, string>> {
  const rows = await readInChunks(meetingIds, async (part) => {
    const { data, error } = await supabase
      .from("meetings")
      .select("id, title")
      .in("id", part);
    if (error) throw error;
    return (data ?? []) as Array<{ id: string; title: string | null }>;
  });
  return new Map(rows.map((row) => [row.id, row.title ?? "Untitled meeting"]));
}

type CommentCountRow = {
  id: string;
  task_comments: Array<{ count: number }> | null;
};

async function commentCounts(
  supabase: SupabaseClient,
  taskIds: string[],
): Promise<Map<string, number>> {
  const rows = await readInChunks(taskIds, async (part) => {
    const { data, error } = await supabase
      .from("tasks")
      .select("id, task_comments(count)")
      .in("id", part);
    if (error) throw error;
    return (data ?? []) as unknown as CommentCountRow[];
  });
  return new Map(
    rows.map((row) => [row.id, row.task_comments?.[0]?.count ?? 0]),
  );
}

type PrRefRow = {
  task_id: string;
  repo_full_name: string;
  pr_number: number;
  pr_url: string;
  state: PrState;
  reverted_at: string | null;
};

async function prRefs(
  supabase: SupabaseClient,
  taskIds: string[],
): Promise<Map<string, TaskPrRef[]>> {
  const rows = await readInChunks(taskIds, async (part) => {
    const { data, error } = await supabase
      .from("task_links")
      .select("task_id, repo_full_name, pr_number, pr_url, state, reverted_at")
      .in("task_id", part)
      .order("pr_number", { ascending: true });
    if (error) throw error;
    return (data ?? []) as PrRefRow[];
  });
  const byTask = new Map<string, TaskPrRef[]>();
  for (const row of rows) {
    const refs = byTask.get(row.task_id) ?? [];
    refs.push({
      repoFullName: row.repo_full_name,
      prNumber: row.pr_number,
      prUrl: row.pr_url,
      state: row.state,
      reverted: row.reverted_at !== null,
    });
    byTask.set(row.task_id, refs);
  }
  return byTask;
}

/**
 * Adds the meeting title to each task, plus the comment count and PR refs for
 * anyone but a Viewer, who gets neither (AC-70p).
 */
export async function decorateBoardTasks(
  supabase: SupabaseClient,
  tasks: Task[],
  role: ProjectRole,
): Promise<Task[]> {
  if (tasks.length === 0) return tasks;
  const taskIds = tasks.map((task) => task.id);
  const meetingIds = [
    ...new Set(
      tasks
        .map((task) => task.sourceMeetingId)
        .filter((id): id is string => !!id),
    ),
  ];
  const isViewer = role === "viewer";
  const [titles, counts, refs] = await Promise.all([
    meetingTitles(supabase, meetingIds),
    isViewer ? null : commentCounts(supabase, taskIds),
    isViewer ? null : prRefs(supabase, taskIds),
  ]);
  return tasks.map((task) => ({
    ...task,
    meetingTitle: task.sourceMeetingId
      ? (titles.get(task.sourceMeetingId) ?? null)
      : null,
    ...(counts && refs
      ? {
          commentCount: counts.get(task.id) ?? 0,
          prRefs: refs.get(task.id) ?? [],
        }
      : {}),
  }));
}

/**
 * Priority chosen while creating a task. Nobody has seen the task yet, so this
 * bumps no version and writes no event; every later change goes through
 * update_task. A failure keeps the task at Medium instead of losing it.
 */
export async function setInitialPriority(
  supabase: SupabaseClient,
  taskId: string,
  priority: TaskPriority,
): Promise<void> {
  if (priority === "medium") return;
  const { error } = await supabase
    .from("tasks")
    .update({ priority })
    .eq("id", taskId);
  if (error) console.error("[tasks] priority not saved:", error.code);
}
