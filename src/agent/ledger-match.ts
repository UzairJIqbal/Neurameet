import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { embedTexts } from "./embed";
import {
  LEDGER_CANDIDATE_LIMIT,
  filterVerdicts,
  judgeLedgerCandidates,
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
    rawText,
  }: { meetingId: string; userId: string; rawText: string },
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

  const { error: upsertErr } = await supabase.from("ledger_links").upsert(
    fresh.map((m) => ({
      item_id: m.itemId,
      evidence_meeting_id: meetingId,
      relation: m.relation,
      quote: m.quote,
      speaker: m.speaker,
      line_number: m.lineNumber,
      confidence: m.confidence,
      state: "suggested",
      decided_at: null,
    })),
    { onConflict: "item_id,evidence_meeting_id" },
  );
  if (upsertErr) throw upsertErr;

  return { matched: fresh.length };
}
