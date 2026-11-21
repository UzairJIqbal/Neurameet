import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProjectRole } from "@/lib/project-types";
import type { Task, TaskEvent, TaskEventKind } from "@/lib/task-types";
import type { PrState, TaskPrLink } from "@/lib/github-types";
import { isTaskPriority, isTaskStatus, taskKey } from "@/lib/tasks";
import { lookupProfiles } from "@/lib/projects";
import { APP_TZ } from "@/lib/meeting-date";

// The one place that decides which task columns a role may read (AC-37).
// `embedding` is in neither list, so no response ever carries it.

const TASK_SELECT_BASE =
  "id, project_id, number, title, description, status, priority, position, assignee_id, due_date, source_meeting_id, completion_kind, completed_at, version, created_at, updated_at";

export const TASK_SELECT_VIEWER = TASK_SELECT_BASE;
export const TASK_SELECT_FULL = `${TASK_SELECT_BASE}, quote, quote_speaker, quote_line, completion_evidence`;

export function taskSelectFor(role: ProjectRole): string {
  return role === "viewer" ? TASK_SELECT_VIEWER : TASK_SELECT_FULL;
}

export type TaskRow = {
  id: string;
  project_id: string;
  number: number;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  position: number;
  assignee_id: string | null;
  due_date: string | null;
  source_meeting_id: string | null;
  completion_kind: "manual" | "merge" | null;
  completed_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  quote?: string | null;
  quote_speaker?: string | null;
  quote_line?: number | null;
  completion_evidence?: string | null;
};

export function toTask(
  row: TaskRow,
  prefix: string,
  role: ProjectRole,
  names: Map<string, { name: string }>,
): Task {
  const task: Task = {
    id: row.id,
    key: taskKey(prefix, row.number),
    number: row.number,
    title: row.title,
    description: row.description,
    status: isTaskStatus(row.status) ? row.status : "todo",
    priority: isTaskPriority(row.priority) ? row.priority : "medium",
    position: Number(row.position),
    assigneeId: row.assignee_id,
    assigneeName: row.assignee_id
      ? (names.get(row.assignee_id)?.name ?? null)
      : null,
    dueDate: row.due_date,
    sourceMeetingId: row.source_meeting_id,
    completionKind: row.completion_kind,
    completedAt: row.completed_at,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  // Even if a wider select slipped through, a Viewer never gets these fields.
  if (role !== "viewer") {
    task.quote = row.quote ?? null;
    task.quoteSpeaker = row.quote_speaker ?? null;
    task.quoteLine = row.quote_line ?? null;
    task.completionEvidence = row.completion_evidence ?? null;
  }
  return task;
}

export type TaskEventRow = {
  id: string;
  kind: string;
  actor_id: string | null;
  from_value: string | null;
  to_value: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
};

/** Drops the quote (and the evidence note) a Viewer must not see. */
export function redactEventForViewer(event: TaskEvent): TaskEvent {
  const detail = { ...event.detail };
  delete detail.quote;
  delete detail.evidence;
  return { ...event, detail };
}

export function toTaskEvent(
  row: TaskEventRow,
  role: ProjectRole,
  names: Map<string, { name: string }>,
): TaskEvent {
  const event: TaskEvent = {
    id: row.id,
    kind: row.kind as TaskEventKind,
    actorId: row.actor_id,
    actorName: row.actor_id ? (names.get(row.actor_id)?.name ?? null) : null,
    fromValue: row.from_value,
    toValue: row.to_value,
    detail: row.detail ?? {},
    createdAt: row.created_at,
  };
  return role === "viewer" ? redactEventForViewer(event) : event;
}

// A Viewer gets a PR's state only: no repo name, title, or link (AC-55).
const TASK_LINK_SELECT_VIEWER = "id, state, merged_at, reverted_at";
const TASK_LINK_SELECT_FULL = `${TASK_LINK_SELECT_VIEWER}, repo_full_name, pr_number, pr_title, pr_url`;

export function taskLinkSelectFor(role: ProjectRole): string {
  return role === "viewer" ? TASK_LINK_SELECT_VIEWER : TASK_LINK_SELECT_FULL;
}

export type TaskLinkRow = {
  id: string;
  state: PrState;
  merged_at: string | null;
  reverted_at: string | null;
  repo_full_name?: string;
  pr_number?: number;
  pr_title?: string;
  pr_url?: string;
};

export function toTaskPrLink(row: TaskLinkRow, role: ProjectRole): TaskPrLink {
  const link: TaskPrLink = {
    id: row.id,
    state: row.state,
    merged: row.merged_at !== null,
    reverted: row.reverted_at !== null,
  };
  // Even if a wider select slipped through, a Viewer never gets these fields.
  if (role !== "viewer") {
    link.repoFullName = row.repo_full_name;
    link.prNumber = row.pr_number;
    link.prTitle = row.pr_title;
    link.prUrl = row.pr_url;
  }
  return link;
}

export async function getTaskPrefix(
  supabase: SupabaseClient,
  projectId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("projects")
    .select("task_prefix")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw error;
  return (data as { task_prefix?: string } | null)?.task_prefix ?? "";
}

/** Reads one task with the select its reader's role allows. */
export async function readTask(
  supabase: SupabaseClient,
  taskId: string,
  role: ProjectRole,
): Promise<Task | null> {
  const { data, error } = await supabase
    .from("tasks")
    .select(taskSelectFor(role))
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as TaskRow;
  const prefix = await getTaskPrefix(supabase, row.project_id);
  const names = row.assignee_id
    ? await lookupProfiles([row.assignee_id])
    : new Map<string, { name: string }>();
  return toTask(row, prefix, role, names);
}

/** User ids of the project's active members. */
export async function activeMemberIds(
  supabase: SupabaseClient,
  projectId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId)
    .is("removed_at", null);
  if (error) throw error;
  return new Set(
    ((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id),
  );
}

/** Today in Pakistan, as YYYY-MM-DD. Decides overdue on tasks. */
export function pktToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ }).format(
    new Date(),
  );
}

// The cursor is the raw database timestamp plus a stable id, so rows that share
// a timestamp are never skipped or repeated (AC-57b). It never passes through a
// JS Date, which would cut microseconds.
const CURSOR_PATTERNS = {
  notifications: /^\d{4}-\d{2}-\d{2}T[0-9:.]+(Z|\+00:00)\|[0-9a-f-]{36}$/,
  activity: /^\d{4}-\d{2}-\d{2}T[0-9:.]+(Z|\+00:00)\|(te|mt|au):[0-9a-f-]{36}$/,
};

export const PAGE_SIZE = 50;

/** Escapes the ilike wildcards so a search for "50%" means the text "50%". */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export type PageCursor = { timestamp: string; id: string };

/** Null when the text fails the strict check, so it never reaches a filter. */
export function parseCursor(
  raw: string,
  kind: keyof typeof CURSOR_PATTERNS,
): PageCursor | null {
  if (!CURSOR_PATTERNS[kind].test(raw)) return null;
  const split = raw.indexOf("|");
  return { timestamp: raw.slice(0, split), id: raw.slice(split + 1) };
}

/** The id is quoted too, because a `:` is reserved in a PostgREST value. */
export function cursorFilter(
  timeColumn: string,
  idColumn: string,
  cursor: PageCursor,
): string {
  const ts = `"${cursor.timestamp}"`;
  return `${timeColumn}.lt.${ts},and(${timeColumn}.eq.${ts},${idColumn}.lt."${cursor.id}")`;
}

/** Takes rows fetched with limit size + 1, and returns the page and next cursor. */
export function pageOf<T>(
  rows: T[],
  cursorOf: (row: T) => string,
  size: number = PAGE_SIZE,
): { page: T[]; next: string | null } {
  if (rows.length <= size) return { page: rows, next: null };
  const page = rows.slice(0, size);
  return { page, next: cursorOf(page[size - 1]) };
}

/** Which of these meetings sit in the project (AC-62b). */
export async function meetingsInProject(
  supabase: SupabaseClient,
  meetingIds: string[],
  projectId: string,
): Promise<Set<string>> {
  if (meetingIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("meetings")
    .select("id")
    .in("id", [...new Set(meetingIds)])
    .eq("project_id", projectId);
  if (error) throw error;
  return new Set(((data ?? []) as Array<{ id: string }>).map((r) => r.id));
}
