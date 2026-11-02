import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deriveLedgerStatus } from "@/agent/ledger";
import {
  CARD_QUOTE_MAX,
  CARD_STATEMENT_MAX,
  clip,
  type AgreementVote,
  type LiveAgreementState,
  type LiveCardState,
  type LiveLedgerCardEvent,
  type LiveMark,
} from "@/lib/live-ledger-types";

interface OpenMarkRow {
  item_id: string;
  mark: LiveMark | null;
}

export interface CardItemRow {
  id: string;
  meeting_id: string;
  statement: string;
  quote: string;
  assignee: string | null;
  due_date: string | null;
}

/** The `ledger.card` payload for an item, cut to the event limits (AC-13). */
export function buildCardEvent(
  item: CardItemRow,
  sourceTitle: string | null | undefined,
  today: string,
): LiveLedgerCardEvent {
  return {
    event: "ledger.card",
    itemId: item.id,
    statement: clip(item.statement, CARD_STATEMENT_MAX),
    quote: clip(item.quote, CARD_QUOTE_MAX),
    assignee: item.assignee,
    dueDate: item.due_date,
    derivedStatus:
      deriveLedgerStatus("open", item.due_date, today) === "overdue"
        ? "overdue"
        : "open",
    sourceTitle: sourceTitle?.trim() || "Untitled meeting",
  };
}

/** The card that is up in this meeting right now, or null (spec 0002 AC-12). */
export async function loadOpenCard(
  supabase: SupabaseClient,
  meetingId: string,
  today: string,
): Promise<LiveCardState | null> {
  const { data: markData, error: markErr } = await supabase
    .from("ledger_live_marks")
    .select("item_id, mark")
    .eq("meeting_id", meetingId)
    .is("closed_at", null)
    .order("raised_at", { ascending: false })
    .limit(1);
  if (markErr) throw markErr;
  const open = ((markData ?? []) as OpenMarkRow[])[0];
  if (!open) return null;

  const { data: itemData, error: itemErr } = await supabase
    .from("ledger_items")
    .select("id, meeting_id, statement, quote, assignee, due_date")
    .eq("id", open.item_id)
    .maybeSingle();
  if (itemErr) throw itemErr;
  const item = itemData as CardItemRow | null;
  if (!item) return null;

  const { data: srcData, error: srcErr } = await supabase
    .from("meetings")
    .select("title")
    .eq("id", item.meeting_id)
    .maybeSingle();
  if (srcErr) throw srcErr;
  const title = (srcData as { title: string | null } | null)?.title;

  return {
    card: buildCardEvent(item, title, today),
    mark: open.mark,
  };
}

export interface VoteTally {
  agree: number;
  notYet: number;
}

/** Count the stored votes for one agreement. */
export async function tallyVotes(
  supabase: SupabaseClient,
  agreementId: string,
): Promise<{
  tally: VoteTally;
  votes: Array<{ voter_id: string; vote: AgreementVote }>;
}> {
  const { data, error } = await supabase
    .from("ledger_agreement_votes")
    .select("voter_id, vote")
    .eq("agreement_id", agreementId);
  if (error) throw error;
  const votes = (data ?? []) as Array<{
    voter_id: string;
    vote: AgreementVote;
  }>;
  const agree = votes.filter((v) => v.vote === "agree").length;
  return { tally: { agree, notYet: votes.length - agree }, votes };
}

/** The open agreement with its tally and the caller's own vote, or null. */
export async function loadOpenAgreement(
  supabase: SupabaseClient,
  meetingId: string,
  callerId: string,
): Promise<LiveAgreementState | null> {
  const { data, error } = await supabase
    .from("ledger_agreements")
    .select("id, statement")
    .eq("meeting_id", meetingId)
    .eq("status", "open")
    .maybeSingle();
  if (error) throw error;
  const row = data as { id: string; statement: string } | null;
  if (!row) return null;

  const { tally, votes } = await tallyVotes(supabase, row.id);
  return {
    agreementId: row.id,
    statement: row.statement,
    agree: tally.agree,
    notYet: tally.notYet,
    myVote: votes.find((v) => v.voter_id === callerId)?.vote ?? null,
    result: null,
  };
}
