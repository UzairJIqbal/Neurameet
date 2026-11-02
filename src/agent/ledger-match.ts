import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { embedTexts } from "./embed";
import {
  LEDGER_CANDIDATE_LIMIT,
  filterVerdicts,
  judgeLedgerCandidates,
  recomputeLedgerItemStatus,
  type LedgerCandidate,
  type LedgerVerdict,
} from "./ledger";

/** Both providers failed to judge; the route answers 502 and nothing is written. */
export class LedgerJudgeError extends Error {
  constructor(cause: unknown) {
    super("Ledger judge failed");
    this.name = "LedgerJudgeError";
    this.cause = cause;
  }
}

interface CandidateRow {
  id: string;
  meeting_id: string;
  kind: LedgerCandidate["kind"];
  statement: string;
  quote: string;
  assignee: string | null;
  due_date: string | null;
  similarity: number;
}

/**
 * Give this meeting's items an embedding so later meetings can find them.
 * Never throws: a missing embedding only means the item is not a candidate yet.
 */
async function embedMissingItems(
  supabase: SupabaseClient,
  meetingId: string,
): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("ledger_items")
      .select("id, statement")
      .eq("meeting_id", meetingId)
      .is("embedding", null);
    if (error) throw error;
    const rows = (data ?? []) as Array<{ id: string; statement: string }>;
    if (rows.length === 0) return;

    const vectors = await embedTexts(rows.map((r) => r.statement));
    for (let i = 0; i < rows.length; i++) {
      const { error: updErr } = await supabase
        .from("ledger_items")
        .update({ embedding: vectors[i] })
        .eq("id", rows[i].id);
      if (updErr) throw updErr;
    }
  } catch (err) {
    console.error("[ledger] item embedding failed", { meetingId, err });
  }
}

type LiveRelation = "kept" | "reversed";

interface LiveCandidates {
  /** item id → the owner's live mark (only kept or reversed reconcile). */
  marks: Map<string, LiveRelation>;
  /** Live marked items the similarity search left out. */
  extra: LedgerCandidate[];
}

/**
 * Live Ledger reconcile (spec 0002 AC-14): items the owner marked kept or
 * reversed during this call join the candidates even when similarity would
 * leave them out. Still only open items from other meetings in the same scope
 * as match_ledger_candidates: the user's personal meetings, or on a project
 * meeting the whole project. Never throws: without live marks the match runs
 * exactly as before.
 */
async function loadLiveCandidates(
  supabase: SupabaseClient,
  {
    meetingId,
    userId,
    projectId,
    have,
  }: {
    meetingId: string;
    userId: string;
    projectId: string | null;
    have: Set<string>;
  },
): Promise<LiveCandidates> {
  const empty: LiveCandidates = { marks: new Map(), extra: [] };
  try {
    const { data: markData, error: markErr } = await supabase
      .from("ledger_live_marks")
      .select("item_id, mark")
      .eq("meeting_id", meetingId)
      .in("mark", ["kept", "reversed"]);
    if (markErr) throw markErr;
    const markRows = (markData ?? []) as Array<{
      item_id: string;
      mark: LiveRelation;
    }>;
    if (markRows.length === 0) return empty;
    const marks = new Map(markRows.map((r) => [r.item_id, r.mark]));

    const missing = [...marks.keys()].filter((id) => !have.has(id));
    if (missing.length === 0) return { marks, extra: [] };

    const { data: itemData, error: itemErr } = await supabase
      .from("ledger_items")
      .select("id, meeting_id, kind, statement, quote, assignee, due_date")
      .in("id", missing)
      .eq("status", "open")
      .neq("meeting_id", meetingId);
    if (itemErr) throw itemErr;
    const items = (itemData ?? []) as Array<Omit<CandidateRow, "similarity">>;
    if (items.length === 0) return { marks, extra: [] };

    const ownedQuery = supabase
      .from("meetings")
      .select("id")
      .in("id", [...new Set(items.map((i) => i.meeting_id))]);
    const { data: ownedData, error: ownedErr } = projectId
      ? await ownedQuery.eq("project_id", projectId)
      : await ownedQuery.eq("user_id", userId).is("project_id", null);
    if (ownedErr) throw ownedErr;
    const owned = new Set(
      ((ownedData ?? []) as Array<{ id: string }>).map((m) => m.id),
    );

    return {
      marks,
      extra: items
        .filter((i) => owned.has(i.meeting_id))
        .map((i) => ({
          id: i.id,
          kind: i.kind,
          statement: i.statement,
          quote: i.quote,
          assignee: i.assignee,
          dueDate: i.due_date,
        })),
    };
  } catch (err) {
    console.error("[ledger] live marks load failed", { meetingId, err });
    return empty;
  }
}

/**
 * Match this meeting's transcript against the owner's earlier open items and
 * store suggested links. Reviewed links (confirmed or rejected) are never
 * touched; writes happen only after the judge succeeds.
 */
export async function runLedgerMatch(
  supabase: SupabaseClient,
  {
    meetingId,
    userId,
    projectId = null,
    rawText,
  }: {
    meetingId: string;
    userId: string;
    projectId?: string | null;
    rawText: string;
  },
): Promise<{ matched: number }> {
  await embedMissingItems(supabase, meetingId);

  const { data: candidateData, error: rpcErr } = await supabase.rpc(
    "match_ledger_candidates",
    {
      p_meeting_id: meetingId,
      p_user_id: userId,
      match_count: LEDGER_CANDIDATE_LIMIT,
    },
  );
  if (rpcErr) throw rpcErr;
  const candidates = ((candidateData ?? []) as CandidateRow[]).map(
    (r): LedgerCandidate => ({
      id: r.id,
      kind: r.kind,
      statement: r.statement,
      quote: r.quote,
      assignee: r.assignee,
      dueDate: r.due_date,
    }),
  );
  const live = await loadLiveCandidates(supabase, {
    meetingId,
    userId,
    projectId,
    have: new Set(candidates.map((c) => c.id)),
  });
  candidates.push(...live.extra);
  if (candidates.length === 0) return { matched: 0 };

  let verdicts: LedgerVerdict[];
  try {
    verdicts = await judgeLedgerCandidates({ rawText, candidates });
  } catch (err) {
    throw new LedgerJudgeError(err);
  }

  const matches = filterVerdicts({
    verdicts,
    candidateIds: candidates.map((c) => c.id),
    rawText,
  });

  const { data: existingData, error: existingErr } = await supabase
    .from("ledger_links")
    .select("item_id, state")
    .eq("evidence_meeting_id", meetingId);
  if (existingErr) throw existingErr;
  const existing = (existingData ?? []) as Array<{
    item_id: string;
    state: string;
  }>;
  const locked = new Set(
    existing.filter((l) => l.state !== "suggested").map((l) => l.item_id),
  );
  const fresh = matches.filter((m) => !locked.has(m.itemId));
  const freshIds = new Set(fresh.map((m) => m.itemId));

  // A rerun refreshes suggestions: drop the ones this run did not repeat.
  const stale = existing
    .filter((l) => l.state === "suggested" && !freshIds.has(l.item_id))
    .map((l) => l.item_id);
  if (stale.length > 0) {
    const { error: delErr } = await supabase
      .from("ledger_links")
      .delete()
      .eq("evidence_meeting_id", meetingId)
      .eq("state", "suggested")
      .in("item_id", stale);
    if (delErr) throw delErr;
  }

  if (fresh.length === 0) return { matched: 0 };

  // A verdict that agrees with the owner's live mark is already decided by
  // the owner, so it is stored confirmed. A disagreeing one stays suggested.
  const decidedAt = new Date().toISOString();
  const agreed = new Set(
    fresh
      .filter((m) => live.marks.get(m.itemId) === m.relation)
      .map((m) => m.itemId),
  );
  const { error: upsertErr } = await supabase.from("ledger_links").upsert(
    fresh.map((m) => ({
      item_id: m.itemId,
      evidence_meeting_id: meetingId,
      relation: m.relation,
      quote: m.quote,
      speaker: m.speaker,
      line_number: m.lineNumber,
      confidence: m.confidence,
      state: agreed.has(m.itemId) ? "confirmed" : "suggested",
      decided_at: agreed.has(m.itemId) ? decidedAt : null,
    })),
    { onConflict: "item_id,evidence_meeting_id" },
  );
  if (upsertErr) throw upsertErr;

  for (const itemId of agreed) {
    await recomputeLedgerItemStatus(supabase, itemId);
  }

  return { matched: fresh.length };
}
