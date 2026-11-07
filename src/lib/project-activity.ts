import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTaskPrefix } from "@/lib/project-select";
import { lookupProfiles, UNKNOWN_MEMBER } from "@/lib/projects";
import { taskKey } from "@/lib/tasks";
import { PR_STATE_LABELS, type PrState } from "@/lib/github-types";
import type { ActivityRow } from "@/lib/proof-types";

// Every row is built from this allowlist, for every role. Raw `detail` is never
// returned (AC-61b).

export type ActivitySourceRow = {
  row_id: string;
  occurred_at: string;
  actor_id: string | null;
  kind: string;
  subject_type: string;
  subject_id: string;
  detail: Record<string, unknown> | null;
};

export type ActivityLookups = {
  names: Map<string, string>;
  tasks: Map<string, { key: string; title: string }>;
  statements: Map<string, string>;
  meetings: Map<string, string>;
};

const FIELD_LABELS: Record<string, string> = {
  title: "title",
  description: "description",
  dueDate: "due date",
};
// A description can be long and private to the board, so its text never shows.
const FIELDS_WITH_VALUES = new Set(["title", "dueDate"]);
const MEMBER_KINDS = new Set([
  "project.ownership_transferred",
  "member.joined",
  "member.left",
  "member.restored",
  "member.removed",
  "member.role_changed",
]);
const ASSIGNEE_KINDS = new Set(["task.assigned", "task.unassigned"]);
const KNOWN_KINDS = new Set([
  ...MEMBER_KINDS,
  "task.created",
  "task.edited",
  "task.status_changed",
  "task.assigned",
  "task.unassigned",
  "task.completed_manual",
  "task.completed_by_merge",
  "task.reopened_by_revert",
  "task.pr_linked",
  "task.pr_state_changed",
  "task.proposal_merged",
  "task.commented",
  "meeting.created",
  "meeting.moved",
  "ledger.kept_confirmed",
  "ledger.reversed_confirmed",
  "project.created",
  "repo.linked",
  "repo.unlinked",
]);

const text = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

function actorName(
  row: ActivitySourceRow,
  names: Map<string, string>,
): string | null {
  if (row.detail?.source === "github") return "GitHub";
  if (!row.actor_id) return null;
  return names.get(row.actor_id) ?? UNKNOWN_MEMBER;
}

const nameOf = (id: string | null, names: Map<string, string>) =>
  id ? (names.get(id) ?? UNKNOWN_MEMBER) : null;

export function toActivityRow(
  row: ActivitySourceRow,
  lookups: ActivityLookups,
): ActivityRow {
  const base: ActivityRow = {
    id: row.row_id,
    kind: row.kind,
    occurredAt: row.occurred_at,
    actorName: actorName(row, lookups.names),
    subjectType: row.subject_type,
    subjectId: row.subject_id,
  };
  // An unknown kind reads "Something changed", and carries nothing else.
  if (!KNOWN_KINDS.has(row.kind)) return { ...base, actorName: null };

  const detail = row.detail ?? {};
  if (row.kind.startsWith("task.")) {
    const task = lookups.tasks.get(row.subject_id);
    const withKey: ActivityRow = { ...base, taskKey: task?.key };
    switch (row.kind) {
      case "task.created":
        return { ...withKey, taskTitle: task?.title };
      case "task.edited": {
        const field = text(detail.field);
        const shown = FIELD_LABELS[field ?? ""];
        return {
          ...withKey,
          field: shown,
          ...(field && FIELDS_WITH_VALUES.has(field)
            ? { from: text(detail.from), to: text(detail.to) }
            : {}),
        };
      }
      case "task.status_changed":
        return { ...withKey, from: text(detail.from), to: text(detail.to) };
      case "task.assigned":
        return {
          ...withKey,
          from: nameOf(text(detail.from), lookups.names),
          to: nameOf(text(detail.to), lookups.names),
        };
      case "task.unassigned":
        return { ...withKey, from: nameOf(text(detail.from), lookups.names) };
      case "task.pr_state_changed": {
        const state = text(detail.state);
        return {
          ...withKey,
          to:
            state && state in PR_STATE_LABELS
              ? PR_STATE_LABELS[state as PrState].toLowerCase()
              : null,
        };
      }
      default:
        return withKey;
    }
  }
  if (row.kind === "meeting.created") {
    return { ...base, meetingTitle: text(detail.title) ?? undefined };
  }
  if (row.kind === "meeting.moved") {
    return { ...base, meetingTitle: lookups.meetings.get(row.subject_id) };
  }
  if (row.kind.startsWith("ledger.")) {
    return { ...base, itemStatement: lookups.statements.get(row.subject_id) };
  }
  if (MEMBER_KINDS.has(row.kind)) {
    return {
      ...base,
      memberName: nameOf(row.subject_id, lookups.names) ?? undefined,
      ...(row.kind === "member.role_changed" ? { to: text(detail.to) } : {}),
    };
  }
  return base;
}

/** Batched names, task keys, statements, and meeting titles for one page. */
export async function loadActivityLookups(
  supabase: SupabaseClient,
  projectId: string,
  rows: ActivitySourceRow[],
): Promise<ActivityLookups> {
  const subjects = (test: (row: ActivitySourceRow) => boolean) => [
    ...new Set(rows.filter(test).map((r) => r.subject_id)),
  ];
  const userIds = rows.flatMap((row) => {
    const ids = row.actor_id ? [row.actor_id] : [];
    if (MEMBER_KINDS.has(row.kind)) ids.push(row.subject_id);
    if (ASSIGNEE_KINDS.has(row.kind)) {
      for (const value of [text(row.detail?.from), text(row.detail?.to)]) {
        if (value) ids.push(value);
      }
    }
    return ids;
  });
  const profiles =
    userIds.length > 0
      ? await lookupProfiles(userIds)
      : new Map<string, { name: string }>();
  const names = new Map([...profiles].map(([id, p]) => [id, p.name]));

  const tasks = new Map<string, { key: string; title: string }>();
  const taskIds = subjects((r) => r.subject_type === "task");
  if (taskIds.length > 0) {
    const { data, error } = await supabase
      .from("tasks")
      .select("id, number, title")
      .eq("project_id", projectId)
      .in("id", taskIds);
    if (error) throw error;
    const taskRows = (data ?? []) as Array<{
      id: string;
      number: number;
      title: string;
    }>;
    const prefix =
      taskRows.length > 0 ? await getTaskPrefix(supabase, projectId) : "";
    for (const t of taskRows) {
      tasks.set(t.id, { key: taskKey(prefix, t.number), title: t.title });
    }
  }

  const statements = new Map<string, string>();
  const itemIds = subjects((r) => r.subject_type === "ledger_item");
  if (itemIds.length > 0) {
    const { data, error } = await supabase
      .from("ledger_items")
      .select("id, statement")
      .in("id", itemIds);
    if (error) throw error;
    for (const item of (data ?? []) as Array<{
      id: string;
      statement: string;
    }>) {
      statements.set(item.id, item.statement);
    }
  }

  const meetings = new Map<string, string>();
  const movedIds = subjects((r) => r.kind === "meeting.moved");
  if (movedIds.length > 0) {
    const { data, error } = await supabase
      .from("meetings")
      .select("id, title")
      .eq("project_id", projectId)
      .in("id", movedIds);
    if (error) throw error;
    for (const m of (data ?? []) as Array<{
      id: string;
      title: string | null;
    }>) {
      meetings.set(m.id, m.title || "Untitled meeting");
    }
  }
  return { names, tasks, statements, meetings };
}
