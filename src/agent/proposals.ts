import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findQuoteLines, normalizeForMatch } from "@/agent/ledger";
import { embedTexts } from "@/agent/embed";
import { lookupProfiles } from "@/lib/projects";
import { normalizeDueDate } from "@/lib/normalize-date";
import { withTimeout } from "@/lib/with-timeout";
import {
  DUPLICATE_THRESHOLD,
  EMBED_TIMEOUT_MS,
  QUOTE_MAX_CHARS,
  TASK_TITLE_MAX,
} from "@/lib/tasks";

// W4 (spec 0004-review-gate-tasks): a project meeting's action items become
// proposals. Code checks every quote and every assignee; the model's word is
// never trusted on its own (AC-31 to AC-33).

export type LocatedQuote = {
  quote: string;
  line: number;
  speaker: string | null;
};

/** First quote, in model order, that matches exactly one transcript line (AC-31). */
export function locateQuote(
  rawText: string,
  quotes: Array<string | null> | null | undefined,
): LocatedQuote | null {
  for (const raw of quotes ?? []) {
    if (typeof raw !== "string") continue;
    const quote = raw.trim();
    if (!quote) continue;
    const hits = findQuoteLines(rawText, quote);
    if (hits.length === 1) {
      return {
        quote: quote.slice(0, QUOTE_MAX_CHARS),
        line: hits[0].lineNumber,
        speaker: hits[0].speaker,
      };
    }
  }
  return null;
}

const NO_ONE = new Set(["", "me", "i", "unassigned", "none", "null"]);

export type MemberName = { userId: string; name: string };

/**
 * Maps the model's assignee text to one active member: an exact full name
 * (case insensitive), or a first name only one member has. Anything else,
 * including more than one match, is no match.
 */
export function buildNameMatcher(
  members: MemberName[],
): (assignee: string | null | undefined) => string | null {
  const full = new Map<string, Set<string>>();
  const first = new Map<string, Set<string>>();
  const add = (map: Map<string, Set<string>>, key: string, id: string) => {
    if (!key) return;
    const set = map.get(key) ?? new Set<string>();
    set.add(id);
    map.set(key, set);
  };
  for (const m of members) {
    const name = normalizeForMatch(m.name);
    add(full, name, m.userId);
    add(first, name.split(" ")[0] ?? "", m.userId);
  }
  return (assignee) => {
    const key = normalizeForMatch(assignee ?? "");
    if (NO_ONE.has(key)) return null;
    const byFull = full.get(key);
    if (byFull) return byFull.size === 1 ? [...byFull][0] : null;
    if (key.includes(" ")) return null;
    const byFirst = first.get(key);
    return byFirst && byFirst.size === 1 ? [...byFirst][0] : null;
  };
}

/**
 * Own track rule: the speaker label resolves to exactly one active member,
 * first through a Tasdeeq speaker claim, then through attendance names.
 */
export async function resolveSpeakerMember(
  supabase: SupabaseClient,
  meetingId: string,
  label: string,
  activeIds: Set<string>,
): Promise<string | null> {
  const key = normalizeForMatch(label);
  if (!key) return null;

  const { data: review } = await supabase
    .from("minutes_reviews")
    .select("id")
    .eq("meeting_id", meetingId)
    .maybeSingle();
  const reviewId = (review as { id?: string } | null)?.id;
  if (reviewId) {
    const { data: claims } = await supabase
      .from("minutes_speaker_claims")
      .select("user_id")
      .eq("review_id", reviewId)
      .eq("speaker_label", key);
    const ids = new Set(
      ((claims ?? []) as Array<{ user_id: string }>)
        .map((c) => c.user_id)
        .filter((id) => activeIds.has(id)),
    );
    if (ids.size === 1) return [...ids][0];
  }

  const { data: rows } = await supabase
    .from("attendance_events")
    .select("user_id, participant_name")
    .eq("meeting_id", meetingId)
    .not("user_id", "is", null);
  const ids = new Set(
    (
      (rows ?? []) as Array<{
        user_id: string;
        participant_name: string | null;
      }>
    )
      .filter(
        (r) =>
          normalizeForMatch(r.participant_name ?? "") === key &&
          activeIds.has(r.user_id),
      )
      .map((r) => r.user_id),
  );
  return ids.size === 1 ? [...ids][0] : null;
}

/** AC-32: only a verified quote whose own speaker is the person the AI named. */
export function suggestAssignee({
  located,
  speakerUserId,
  aiAssignee,
  matchName,
}: {
  located: LocatedQuote | null;
  speakerUserId: string | null;
  aiAssignee: string | null | undefined;
  matchName: (assignee: string | null | undefined) => string | null;
}): string | null {
  if (!located || !speakerUserId) return null;
  const named = matchName(aiAssignee);
  return named !== null && named === speakerUserId ? named : null;
}

export type ExtractedActionItem = {
  title: string;
  assignee?: string | null;
  dueDate?: string | null;
  quotes?: Array<string | null> | null;
};

export type ProposalRow = {
  id: string;
  title: string;
  assignee: string | null;
  due_date: string | null;
  quote: string | null;
  quote_speaker: string | null;
  quote_line: number | null;
  quote_verified: boolean;
  proposed_assignee_id: string | null;
  duplicate_of_task_id: string | null;
  duplicate_score: number | null;
  /** pgvector text form, e.g. "[0.1,0.2]". */
  embedding: string | null;
};

async function activeMembers(
  supabase: SupabaseClient,
  projectId: string,
): Promise<MemberName[]> {
  const { data, error } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId)
    .is("removed_at", null);
  if (error) throw error;
  const ids = ((data ?? []) as Array<{ user_id: string }>).map(
    (r) => r.user_id,
  );
  const profiles = await lookupProfiles(ids);
  return ids.map((userId) => ({
    userId,
    name: profiles.get(userId)?.name ?? "",
  }));
}

/** One embed call for every title; null on failure or timeout (AC-33). */
async function embedTitles(titles: string[]): Promise<number[][] | null> {
  if (titles.length === 0) return [];
  try {
    return await withTimeout(embedTexts(titles), EMBED_TIMEOUT_MS);
  } catch (err) {
    console.error("[proposals] title embedding failed:", err);
    return null;
  }
}

async function closestOpenTask(
  supabase: SupabaseClient,
  projectId: string,
  vector: number[],
): Promise<{ id: string; similarity: number } | null> {
  const { data, error } = await supabase.rpc("match_project_tasks", {
    p_project: projectId,
    p_embedding: vector,
    p_threshold: DUPLICATE_THRESHOLD,
  });
  if (error) {
    console.error("[proposals] duplicate check failed:", error);
    return null;
  }
  const top = ((data ?? []) as Array<{ id: string; similarity: number }>)[0];
  return top ? { id: top.id, similarity: Number(top.similarity) } : null;
}

/** Builds the rows `replace_meeting_proposals` inserts, in the model's order. */
export async function buildProposalRows(
  supabase: SupabaseClient,
  {
    meetingId,
    projectId,
    rawText,
    items,
    ids,
  }: {
    meetingId: string;
    projectId: string;
    rawText: string;
    items: ExtractedActionItem[];
    ids: string[];
  },
): Promise<ProposalRow[]> {
  const members = await activeMembers(supabase, projectId);
  const activeIds = new Set(members.map((m) => m.userId));
  const matchName = buildNameMatcher(members);
  const speakerCache = new Map<string, string | null>();

  const titles = items.map((item) =>
    item.title.trim().slice(0, TASK_TITLE_MAX),
  );
  const vectors = await embedTitles(titles);

  const rows: ProposalRow[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const located = locateQuote(rawText, item.quotes);

    let speakerUserId: string | null = null;
    if (located?.speaker) {
      const key = normalizeForMatch(located.speaker);
      if (!speakerCache.has(key)) {
        speakerCache.set(
          key,
          await resolveSpeakerMember(
            supabase,
            meetingId,
            located.speaker,
            activeIds,
          ),
        );
      }
      speakerUserId = speakerCache.get(key) ?? null;
    }

    const vector = vectors?.[i] ?? null;
    const duplicate = vector
      ? await closestOpenTask(supabase, projectId, vector)
      : null;

    rows.push({
      id: ids[i],
      title: titles[i] || "Untitled task",
      assignee: item.assignee ?? null,
      due_date: normalizeDueDate(item.dueDate ?? null),
      quote: located?.quote ?? null,
      quote_speaker: located?.speaker ?? null,
      quote_line: located?.line ?? null,
      quote_verified: located !== null,
      proposed_assignee_id: suggestAssignee({
        located,
        speakerUserId,
        aiAssignee: item.assignee,
        matchName,
      }),
      duplicate_of_task_id: duplicate?.id ?? null,
      duplicate_score: duplicate?.similarity ?? null,
      embedding: vector ? JSON.stringify(vector) : null,
    });
  }
  return rows;
}

/** AC-34 fast check: anything reviewed, or already a task, blocks a reprocess. */
export async function hasReviewedProposals(
  supabase: SupabaseClient,
  meetingId: string,
): Promise<boolean> {
  const { data: items, error } = await supabase
    .from("action_items")
    .select("id, review_state")
    .eq("meeting_id", meetingId);
  if (error) throw error;
  const rows = (items ?? []) as Array<{ id: string; review_state: string }>;
  if (
    rows.some(
      (r) => r.review_state === "confirmed" || r.review_state === "rejected",
    )
  ) {
    return true;
  }
  if (rows.length === 0) return false;
  const { data: tasks, error: taskErr } = await supabase
    .from("tasks")
    .select("id")
    .in(
      "source_action_item_id",
      rows.map((r) => r.id),
    )
    .limit(1);
  if (taskErr) throw taskErr;
  return (tasks ?? []).length > 0;
}

/** One title's vector for a confirm or a new task; null on failure or timeout. */
export async function embedTitle(title: string): Promise<number[] | null> {
  const vectors = await embedTitles([title]);
  return vectors?.[0] ?? null;
}
