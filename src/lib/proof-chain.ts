import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProjectRole } from "@/lib/project-types";
import type { LedgerItem } from "@/lib/meeting-types";
import type { Task } from "@/lib/task-types";
import type { Outcome } from "@/lib/proof-types";
import {
  getTaskPrefix,
  ledgerItemSelectFor,
  meetingsInProject,
  toLedgerItem,
  type LedgerItemRow,
} from "@/lib/project-select";
import { taskKey } from "@/lib/tasks";

// The Outcome card (spec 0004 AC-60). Four pure steps, Said, Task, Shipped, and
// Kept, on top of two batched loaders.

export type ProofItem = Pick<
  LedgerItem,
  | "id"
  | "meetingId"
  | "kind"
  | "actionItemId"
  | "status"
  | "quote"
  | "speaker"
  | "lineNumber"
> & { meetingTitle: string | null; projectId: string };

export type ProofTaskRow = {
  id: string;
  number: number;
  status: string;
  source_action_item_id: string | null;
  completion_kind: "manual" | "merge" | null;
  completion_evidence?: string | null;
};

export type ProofLinkRow = {
  task_id: string;
  state: string;
  closes: boolean;
  base_ref: string | null;
  repo_id: number | string;
  merged_at: string | null;
  reverted_at: string | null;
  repo_full_name?: string;
  pr_number?: number;
  pr_url?: string;
};

type ActionRow = {
  id: string;
  review_state: string | null;
  merged_into_task_id: string | null;
};
type SuggestedRow = {
  item_id: string;
  evidence_kind: "meeting" | "code";
  evidence_meeting_id: string | null;
};

// Columns Shipped needs for every role. Repo name, PR number, and link are added
// only for non Viewers, so a Viewer's query never reads them.
const LINK_BASE =
  "task_id, state, closes, base_ref, repo_id, merged_at, reverted_at";
const proofLinkSelect = (role: ProjectRole | null) =>
  role === "viewer"
    ? LINK_BASE
    : `${LINK_BASE}, repo_full_name, pr_number, pr_url`;
const TASK_BASE = "id, number, status, source_action_item_id, completion_kind";
const proofTaskSelect = (role: ProjectRole | null) =>
  role === "viewer" ? TASK_BASE : `${TASK_BASE}, completion_evidence`;

export function saidForItem(
  item: Pick<
    ProofItem,
    "meetingId" | "meetingTitle" | "quote" | "speaker" | "lineNumber"
  >,
  isViewer: boolean,
): Outcome["said"] {
  const meeting = {
    meetingId: item.meetingId,
    meetingTitle: item.meetingTitle ?? undefined,
  };
  if (isViewer) return { state: "hidden", ...meeting };
  if (!item.quote) return { state: "no_quote", ...meeting };
  return {
    state: "quoted",
    ...meeting,
    quote: item.quote,
    speaker: item.speaker ?? undefined,
    lineNumber: item.lineNumber ?? undefined,
  };
}

export type TaskSaidInput = {
  quote: string | null | undefined;
  quoteSpeaker: string | null | undefined;
  quoteLine: number | null | undefined;
  hasSource: boolean;
  meetingId: string | null;
  meetingTitle: string | null;
  /** Items merged into this task, earliest first. */
  mergedItems: Array<
    Pick<
      ProofItem,
      "meetingId" | "meetingTitle" | "quote" | "speaker" | "lineNumber"
    >
  >;
};

export function saidForTask(
  input: TaskSaidInput,
  isViewer: boolean,
): Outcome["said"] {
  const { mergedItems, hasSource } = input;
  const extra = hasSource
    ? mergedItems.length
    : Math.max(mergedItems.length - 1, 0);
  const more = extra > 0 ? { moreCount: extra } : {};
  const earliest = mergedItems[0];
  const meeting = {
    meetingId: input.meetingId ?? earliest?.meetingId,
    meetingTitle: input.meetingTitle ?? earliest?.meetingTitle ?? undefined,
  };

  if (isViewer) {
    return hasSource || earliest
      ? { state: "hidden", ...meeting, ...more }
      : { state: "typed" };
  }
  if (input.quote) {
    return {
      state: "quoted",
      ...meeting,
      quote: input.quote,
      speaker: input.quoteSpeaker ?? undefined,
      lineNumber: input.quoteLine ?? undefined,
      ...more,
    };
  }
  if (hasSource) return { state: "no_quote", ...meeting, ...more };
  if (earliest) return { ...saidForItem(earliest, false), ...more };
  return { state: "typed" };
}

export function taskStepForItem(
  kind: LedgerItem["kind"],
  task: Pick<ProofTaskRow, "id" | "number" | "status"> | null,
  reviewState: string | null,
  prefix: string | null,
  isViewer: boolean,
): Outcome["task"] {
  if (kind === "decision") return { state: "decision" };
  // A found task wins, even when the action item's own state says rejected.
  if (task) {
    return {
      state: "linked",
      taskId: task.id,
      key: prefix ? taskKey(prefix, task.number) : undefined,
      status: task.status,
    };
  }
  if (isViewer) return { state: "none" };
  if (reviewState === "proposed") return { state: "waiting" };
  if (reviewState === "rejected") return { state: "rejected" };
  return { state: "none" };
}

// Matches apply_merge_completion: a merged, closing PR into the linked repo's
// default branch. An unlinked repo has no entry in `branches`, so it never counts.
const wouldQualify = (link: ProofLinkRow, branches: Map<number, string>) =>
  link.state === "merged" &&
  link.closes &&
  link.base_ref !== null &&
  branches.get(Number(link.repo_id)) === link.base_ref;

const latestMerged = (links: ProofLinkRow[]) =>
  [...links].sort((a, b) =>
    (b.merged_at ?? "").localeCompare(a.merged_at ?? ""),
  )[0];

export function shippedStep(
  task: Pick<ProofTaskRow, "completion_kind" | "completion_evidence"> | null,
  links: ProofLinkRow[],
  branches: Map<number, string>,
  isViewer: boolean,
): Outcome["shipped"] {
  if (!task) return { state: "none" };
  const qualifying = links.filter((l) => wouldQualify(l, branches));
  const live = qualifying.filter((l) => l.reverted_at === null);
  const byMerge = task.completion_kind === "merge";

  if (byMerge || live.length > 0) {
    if (isViewer) return { state: "merged" };
    const evidence = byMerge
      ? links.find((l) => l.pr_url && l.pr_url === task.completion_evidence)
      : undefined;
    const fallback = links.filter(
      (l) => l.state === "merged" && l.reverted_at === null,
    );
    const detail = evidence ?? latestMerged(live) ?? latestMerged(fallback);
    if (!detail) return { state: "merged" };
    return {
      state: "merged",
      repoFullName: detail.repo_full_name,
      prNumber: detail.pr_number,
      prUrl: detail.pr_url,
    };
  }
  if (qualifying.length > 0) return { state: "reverted" };
  if (task.completion_kind === "manual") return { state: "manual" };
  return { state: "none" };
}

export function keptForItem(
  status: LedgerItem["status"],
  hasSuggested: boolean,
): Outcome["kept"] {
  if (status === "kept") return { state: "kept" };
  if (status === "reversed") return { state: "reversed" };
  return hasSuggested ? { state: "review" } : { state: "none" };
}

export function keptForTask(
  items: Array<{ status: LedgerItem["status"]; hasSuggested: boolean }>,
): Outcome["kept"] {
  const total = items.length;
  if (total === 0) return { state: "no_promise" };
  const keptCount = items.filter((i) => i.status === "kept").length;
  if (items.some((i) => i.status === "reversed")) return { state: "reversed" };
  if (keptCount === total) return { state: "kept", keptCount, total };
  if (items.some((i) => i.hasSuggested))
    return { state: "review", keptCount, total };
  if (keptCount > 0) return { state: "partial", keptCount, total };
  return { state: "none", keptCount, total };
}

async function loadLinksAndBranches(
  supabase: SupabaseClient,
  taskIds: string[],
  projectId: string,
  role: ProjectRole | null,
): Promise<{ links: ProofLinkRow[]; branches: Map<number, string> }> {
  if (taskIds.length === 0) return { links: [], branches: new Map() };
  const { data, error } = await supabase
    .from("task_links")
    .select(proofLinkSelect(role))
    .in("task_id", taskIds);
  if (error) throw error;
  const links = (data ?? []) as unknown as ProofLinkRow[];
  if (links.length === 0) return { links, branches: new Map() };

  const { data: repoData, error: repoErr } = await supabase
    .from("github_repos")
    .select("repo_id, default_branch")
    .eq("project_id", projectId)
    .in("repo_id", [...new Set(links.map((l) => l.repo_id))]);
  if (repoErr) throw repoErr;
  const repos = (repoData ?? []) as Array<{
    repo_id: number | string;
    default_branch: string;
  }>;
  return {
    links,
    branches: new Map(repos.map((r) => [Number(r.repo_id), r.default_branch])),
  };
}

// A suggested meeting link only counts when its evidence is in the project (AC-62b).
async function loadSuggested(
  supabase: SupabaseClient,
  itemIds: string[],
  projectId: string,
): Promise<Set<string>> {
  if (itemIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("ledger_links")
    .select("item_id, evidence_kind, evidence_meeting_id")
    .eq("state", "suggested")
    .in("item_id", itemIds);
  if (error) throw error;
  const rows = (data ?? []) as SuggestedRow[];
  const inside = await meetingsInProject(
    supabase,
    rows.map((r) => r.evidence_meeting_id).filter((id): id is string => !!id),
    projectId,
  );
  return new Set(
    rows
      .filter(
        (r) =>
          r.evidence_kind === "code" ||
          (r.evidence_meeting_id !== null && inside.has(r.evidence_meeting_id)),
      )
      .map((r) => r.item_id),
  );
}

async function loadItemTasks(
  supabase: SupabaseClient,
  actionIds: string[],
  mergedIds: string[],
  projectId: string,
  role: ProjectRole | null,
): Promise<ProofTaskRow[]> {
  const read = async (column: string, ids: string[]) => {
    if (ids.length === 0) return [];
    const { data, error } = await supabase
      .from("tasks")
      .select(proofTaskSelect(role))
      .eq("project_id", projectId)
      .in(column, ids);
    if (error) throw error;
    return (data ?? []) as unknown as ProofTaskRow[];
  };
  const direct = await read("source_action_item_id", actionIds);
  const merged = await read("id", mergedIds);
  return [...direct, ...merged];
}

/** Every item must be in the same project. Returns the card per item id. */
export async function outcomesForItems(
  supabase: SupabaseClient,
  items: ProofItem[],
  role: ProjectRole | null,
): Promise<Map<string, Outcome>> {
  const outcomes = new Map<string, Outcome>();
  if (items.length === 0) return outcomes;
  const isViewer = role === "viewer";
  const projectId = items[0].projectId;

  const actionIds = [
    ...new Set(
      items.map((i) => i.actionItemId).filter((id): id is string => !!id),
    ),
  ];
  let actions: ActionRow[] = [];
  if (actionIds.length > 0) {
    const { data, error } = await supabase
      .from("action_items")
      .select("id, review_state, merged_into_task_id")
      .in("id", actionIds);
    if (error) throw error;
    actions = (data ?? []) as ActionRow[];
  }
  const actionById = new Map(actions.map((a) => [a.id, a]));
  const mergedIds = [
    ...new Set(
      actions
        .map((a) => a.merged_into_task_id)
        .filter((id): id is string => !!id),
    ),
  ];

  const tasks = await loadItemTasks(
    supabase,
    actionIds,
    mergedIds,
    projectId,
    role,
  );
  const prefix =
    tasks.length > 0 ? await getTaskPrefix(supabase, projectId) : null;
  const { links, branches } = await loadLinksAndBranches(
    supabase,
    [...new Set(tasks.map((t) => t.id))],
    projectId,
    role,
  );
  const suggested = await loadSuggested(
    supabase,
    items.map((i) => i.id),
    projectId,
  );

  for (const item of items) {
    const action = item.actionItemId
      ? actionById.get(item.actionItemId)
      : undefined;
    // AC-57c: the task the action item produced wins over the one it merged into.
    const task =
      (item.actionItemId &&
        tasks.find((t) => t.source_action_item_id === item.actionItemId)) ||
      (action?.merged_into_task_id &&
        tasks.find((t) => t.id === action.merged_into_task_id)) ||
      null;
    const isDecision = item.kind === "decision";
    outcomes.set(item.id, {
      said: saidForItem(item, isViewer),
      task: taskStepForItem(
        item.kind,
        task,
        action?.review_state ?? null,
        prefix,
        isViewer,
      ),
      shipped: isDecision
        ? { state: "not_applicable" }
        : shippedStep(
            task,
            task ? links.filter((l) => l.task_id === task.id) : [],
            branches,
            isViewer,
          ),
      kept: keptForItem(item.status, suggested.has(item.id)),
    });
  }
  return outcomes;
}

async function meetingTitle(
  supabase: SupabaseClient,
  meetingId: string | null,
): Promise<string | null> {
  if (!meetingId) return null;
  const { data, error } = await supabase
    .from("meetings")
    .select("title")
    .eq("id", meetingId)
    .maybeSingle();
  if (error) throw error;
  return (data as { title: string | null } | null)?.title ?? null;
}

/** The card on a task. `task` already passed the caller's role check. */
export async function outcomeForTask(
  supabase: SupabaseClient,
  task: Task,
  role: ProjectRole,
): Promise<Outcome> {
  const isViewer = role === "viewer";
  const { data: sourceData, error: sourceErr } = await supabase
    .from("tasks")
    .select("project_id, source_action_item_id")
    .eq("id", task.id)
    .maybeSingle();
  if (sourceErr) throw sourceErr;
  const source = sourceData as {
    project_id: string;
    source_action_item_id: string | null;
  } | null;
  if (!source) throw new Error("Task not found for its outcome");
  const projectId = source.project_id;
  const sourceAction = source.source_action_item_id;

  const { data: mergedData, error: mergedErr } = await supabase
    .from("action_items")
    .select("id")
    .eq("merged_into_task_id", task.id);
  if (mergedErr) throw mergedErr;
  const mergedActions = ((mergedData ?? []) as Array<{ id: string }>).map(
    (a) => a.id,
  );

  const actionIds = [...(sourceAction ? [sourceAction] : []), ...mergedActions];
  let items: LedgerItem[] = [];
  if (actionIds.length > 0) {
    const { data, error } = await supabase
      .from("ledger_items")
      .select(ledgerItemSelectFor(role))
      .in("action_item_id", actionIds)
      .order("created_at", { ascending: true });
    if (error) throw error;
    items = ((data ?? []) as unknown as LedgerItemRow[]).map((row) =>
      toLedgerItem(row, role),
    );
  }

  const mergedItems = items.filter(
    (i) => i.actionItemId !== null && mergedActions.includes(i.actionItemId),
  );
  const meetingId = task.sourceMeetingId ?? mergedItems[0]?.meetingId ?? null;
  const title = await meetingTitle(supabase, meetingId);
  const suggested = await loadSuggested(
    supabase,
    items.map((i) => i.id),
    projectId,
  );
  const { links, branches } = await loadLinksAndBranches(
    supabase,
    [task.id],
    projectId,
    role,
  );

  return {
    said: saidForTask(
      {
        quote: task.quote,
        quoteSpeaker: task.quoteSpeaker,
        quoteLine: task.quoteLine,
        hasSource: sourceAction !== null,
        meetingId,
        meetingTitle: title,
        mergedItems: mergedItems.map((i) => ({ ...i, meetingTitle: title })),
      },
      isViewer,
    ),
    task: {
      state: "linked",
      taskId: task.id,
      key: task.key,
      status: task.status,
    },
    shipped: shippedStep(
      {
        completion_kind: task.completionKind,
        completion_evidence: task.completionEvidence ?? null,
      },
      links,
      branches,
      isViewer,
    ),
    kept: keptForTask(
      items.map((i) => ({
        status: i.status,
        hasSuggested: suggested.has(i.id),
      })),
    ),
  };
}
