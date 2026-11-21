import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProjectRole } from "@/lib/project-types";
import type { Task } from "@/lib/task-types";
import type { Outcome } from "@/lib/proof-types";

// The Outcome card (spec 0004 AC-60, slimmed by spec 0006). Three steps: Said,
// Task, and Shipped.

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

// Columns Shipped needs for every role. Repo name, PR number, and link are added
// only for non Viewers, so a Viewer's query never reads them.
const LINK_BASE =
  "task_id, state, closes, base_ref, repo_id, merged_at, reverted_at";
const proofLinkSelect = (role: ProjectRole | null) =>
  role === "viewer"
    ? LINK_BASE
    : `${LINK_BASE}, repo_full_name, pr_number, pr_url`;

/** One action item merged into a task, earliest first. */
export type MergedQuote = {
  meetingId: string;
  quote: string | null;
  speaker: string | null;
  lineNumber: number | null;
};

export type TaskSaidInput = {
  quote: string | null | undefined;
  quoteSpeaker: string | null | undefined;
  quoteLine: number | null | undefined;
  hasSource: boolean;
  meetingId: string | null;
  meetingTitle: string | null;
  mergedItems: MergedQuote[];
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
    meetingTitle: input.meetingTitle ?? undefined,
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
  if (!earliest) return { state: "typed" };
  if (!earliest.quote) return { state: "no_quote", ...meeting, ...more };
  return {
    state: "quoted",
    ...meeting,
    quote: earliest.quote,
    speaker: earliest.speaker ?? undefined,
    lineNumber: earliest.lineNumber ?? undefined,
    ...more,
  };
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

// A Viewer's Said step is hidden, so its query never reads the quote columns.
const MERGED_BASE = "meeting_id";
const mergedItemSelect = (role: ProjectRole | null) =>
  role === "viewer"
    ? MERGED_BASE
    : `${MERGED_BASE}, quote, quote_speaker, quote_line`;

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
    .select(mergedItemSelect(role))
    .eq("merged_into_task_id", task.id)
    .order("created_at", { ascending: true });
  if (mergedErr) throw mergedErr;
  const mergedItems = (
    (mergedData ?? []) as unknown as Array<{
      meeting_id: string;
      quote?: string | null;
      quote_speaker?: string | null;
      quote_line?: number | null;
    }>
  ).map((row) => ({
    meetingId: row.meeting_id,
    quote: row.quote ?? null,
    speaker: row.quote_speaker ?? null,
    lineNumber: row.quote_line ?? null,
  }));

  const meetingId = task.sourceMeetingId ?? mergedItems[0]?.meetingId ?? null;
  const title = await meetingTitle(supabase, meetingId);
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
        mergedItems,
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
  };
}
