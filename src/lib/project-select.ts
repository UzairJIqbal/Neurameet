import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProjectRole } from "@/lib/project-types";
import type { Task, TaskEvent, TaskEventKind } from "@/lib/task-types";
import type { PrState, TaskPrLink } from "@/lib/github-types";
import { isTaskStatus, taskKey } from "@/lib/tasks";
import { lookupProfiles } from "@/lib/projects";
import { MINUTES_TZ } from "@/lib/minutes-types";
import type { LedgerItem, LedgerLink } from "@/lib/meeting-types";

// The one place that decides which task columns a role may read (AC-37).
// `embedding` is in neither list, so no response ever carries it.

const TASK_SELECT_BASE =
  "id, project_id, number, title, description, status, position, assignee_id, due_date, source_meeting_id, completion_kind, completed_at, version, created_at, updated_at";

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

/** Today in Pakistan, as YYYY-MM-DD. Decides overdue on the project ledger. */
export function pktToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: MINUTES_TZ }).format(
    new Date(),
  );
}

// The cursor is the raw database timestamp plus a stable id, so rows that share
// a timestamp are never skipped or repeated (AC-57b). It never passes through a
// JS Date, which would cut microseconds.
const CURSOR_PATTERNS = {
  ledger: /^\d{4}-\d{2}-\d{2}T[0-9:.]+(Z|\+00:00)\|[0-9a-f-]{36}$/,
  activity:
    /^\d{4}-\d{2}-\d{2}T[0-9:.]+(Z|\+00:00)\|(te|mt|ll|au):[0-9a-f-]{36}$/,
};

export const PAGE_SIZE = 50;

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

/** Takes rows fetched with limit PAGE_SIZE + 1, and returns the page and next cursor. */
export function pageOf<T>(
  rows: T[],
  cursorOf: (row: T) => string,
): { page: T[]; next: string | null } {
  if (rows.length <= PAGE_SIZE) return { page: rows, next: null };
  const page = rows.slice(0, PAGE_SIZE);
  return { page, next: cursorOf(page[PAGE_SIZE - 1]) };
}

// Hidden ledger columns are left out of a Viewer's query (AC-62). A code link
// keeps the PR title in `quote`, so the Viewer list omits it for every kind.
export const LEDGER_ITEM_SELECT_VIEWER =
  "id, meeting_id, action_item_id, kind, statement, assignee, due_date, status, created_at, source, agreed_count, total_count";
export const LEDGER_ITEM_SELECT_FULL = `${LEDGER_ITEM_SELECT_VIEWER}, quote, quote_language, speaker, line_number`;
export const LEDGER_LINK_SELECT_VIEWER =
  "id, item_id, evidence_kind, evidence_meeting_id, relation, confidence, state, decided_at, created_at";
export const LEDGER_LINK_SELECT_FULL = `${LEDGER_LINK_SELECT_VIEWER}, evidence_task_link_id, quote, speaker, line_number`;

export function ledgerItemSelectFor(role: ProjectRole | null): string {
  return role === "viewer" ? LEDGER_ITEM_SELECT_VIEWER : LEDGER_ITEM_SELECT_FULL;
}

export function ledgerLinkSelectFor(role: ProjectRole | null): string {
  return role === "viewer" ? LEDGER_LINK_SELECT_VIEWER : LEDGER_LINK_SELECT_FULL;
}

export type LedgerItemRow = {
  id: string;
  meeting_id: string;
  action_item_id: string | null;
  kind: LedgerItem["kind"];
  statement: string;
  quote?: string | null;
  quote_language?: LedgerItem["quoteLanguage"];
  speaker?: string | null;
  assignee: string | null;
  due_date: string | null;
  line_number?: number | null;
  status: LedgerItem["status"];
  created_at: string;
  source: LedgerItem["source"];
  agreed_count: number | null;
  total_count: number | null;
};

export type LedgerLinkRow = {
  id: string;
  item_id: string;
  evidence_kind: LedgerLink["evidenceKind"];
  evidence_meeting_id: string | null;
  evidence_task_link_id?: string | null;
  relation: LedgerLink["relation"];
  quote?: string | null;
  speaker?: string | null;
  line_number?: number | null;
  confidence: number;
  state: LedgerLink["state"];
  decided_at: string | null;
  created_at: string;
};

export function toLedgerItem(
  row: LedgerItemRow,
  role: ProjectRole | null,
): LedgerItem {
  // Even if a wider select slipped through, a Viewer never gets these fields.
  const open = role !== "viewer";
  return {
    id: row.id,
    meetingId: row.meeting_id,
    actionItemId: row.action_item_id,
    kind: row.kind,
    statement: row.statement,
    quote: open ? (row.quote ?? null) : null,
    quoteLanguage: open ? (row.quote_language ?? null) : null,
    speaker: open ? (row.speaker ?? null) : null,
    assignee: row.assignee,
    dueDate: row.due_date,
    lineNumber: open ? (row.line_number ?? null) : null,
    status: row.status,
    createdAt: row.created_at,
    source: row.source,
    agreedCount: row.agreed_count,
    totalCount: row.total_count,
  };
}

export function toLedgerLink(
  row: LedgerLinkRow,
  role: ProjectRole | null,
): LedgerLink {
  const open = role !== "viewer";
  return {
    id: row.id,
    itemId: row.item_id,
    evidenceKind: row.evidence_kind,
    evidenceMeetingId: row.evidence_meeting_id,
    relation: row.relation,
    quote: open ? (row.quote ?? null) : null,
    speaker: open ? (row.speaker ?? null) : null,
    lineNumber: open ? (row.line_number ?? null) : null,
    confidence: row.confidence,
    state: row.state,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
  };
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
