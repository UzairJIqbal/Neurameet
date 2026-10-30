import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { normalizeDueDate } from "@/lib/normalize-date";
import type {
  LedgerDerivedStatus,
  LedgerItemStatus,
} from "@/lib/meeting-types";
import type { LedgerItemExtraction } from "./types";
import { generateStructuredWithFallback } from "./models";

// Promise Ledger (spec 0001). Every stored quote is verified against the
// transcript here; the AI only suggests, the owner decides.
export const LEDGER_MAX_ITEMS = 15;
export const LEDGER_CANDIDATE_LIMIT = 15;
export const LEDGER_CONFIDENCE_THRESHOLD = 0.7;
export const LEDGER_PREP_LIMIT = 5;
// Same cap /api/ai/process uses, so the judge sees what extraction saw.
export const LEDGER_JUDGE_MAX_CHARS = 16000;

// Shortest normalised quote we accept, so a one word "ok" can't match anywhere.
const MIN_QUOTE_CHARS = 3;
// "Ali: ..." / "Sara Khan: ..." — a short label containing a letter, then a colon.
const SPEAKER_PREFIX = /^\s*([^:\n]{1,60}?)\s*:\s*/u;

export function normalizeForMatch(text: string): string {
  return text.normalize("NFC").toLowerCase().replace(/\s+/gu, " ").trim();
}

function speakerLabel(line: string): string | null {
  const match = SPEAKER_PREFIX.exec(line);
  if (!match) return null;
  const label = match[1].trim();
  return /\p{L}/u.test(label) ? label : null;
}

export function stripSpeakerPrefix(quote: string): string {
  const label = speakerLabel(quote);
  return label ? quote.replace(SPEAKER_PREFIX, "") : quote;
}

export interface QuoteLocation {
  lineNumber: number;
  speaker: string | null;
}

/** 1 based line of `rawText` containing `quote` (case and whitespace insensitive). */
export function findQuoteLine(
  rawText: string,
  quote: string,
): QuoteLocation | null {
  const needle = normalizeForMatch(stripSpeakerPrefix(quote));
  if (needle.length < MIN_QUOTE_CHARS) return null;

  const lines = rawText.split(/\r?\n/u);
  for (let i = 0; i < lines.length; i++) {
    if (normalizeForMatch(lines[i]).includes(needle)) {
      return { lineNumber: i + 1, speaker: speakerLabel(lines[i]) };
    }
  }
  return null;
}

/** Read time status: an open item past its due date shows as overdue. */
export function deriveLedgerStatus(
  status: LedgerItemStatus,
  dueDate: string | null,
  today: string,
): LedgerDerivedStatus {
  if (status === "open" && dueDate && dueDate < today) return "overdue";
  return status;
}

/**
 * App side home of the status rule: the SQL function sets the item status to
 * the relation of its latest confirmed link, else open. Used by every review.
 */
export async function recomputeLedgerItemStatus(
  supabase: SupabaseClient,
  itemId: string,
): Promise<void> {
  const { error } = await supabase.rpc("ledger_recompute_item_status", {
    p_item_id: itemId,
  });
  if (error) throw error;
}

export interface LedgerInsertRow {
  meeting_id: string;
  action_item_id: string | null;
  kind: LedgerItemExtraction["kind"];
  statement: string;
  quote: string;
  quote_language: LedgerItemExtraction["quoteLanguage"];
  speaker: string | null;
  assignee: string | null;
  due_date: string | null;
  line_number: number;
}

/** Verify, clean, and dedupe extracted items into insertable rows. */
export function prepareLedgerRows({
  meetingId,
  rawText,
  items,
  actionItemIds,
  keptQuotes,
}: {
  meetingId: string;
  rawText: string;
  items: LedgerItemExtraction[];
  actionItemIds: string[];
  keptQuotes: string[];
}): LedgerInsertRow[] {
  const seen = new Set(
    keptQuotes.map((q) => normalizeForMatch(stripSpeakerPrefix(q))),
  );
  const rows: LedgerInsertRow[] = [];

  for (const item of items) {
    if (rows.length >= LEDGER_MAX_ITEMS) break;

    const quote = stripSpeakerPrefix(item.quote).trim();
    const location = findQuoteLine(rawText, quote);
    if (!location) {
      console.warn("[ledger] dropped unverified quote", {
        meetingId,
        kind: item.kind,
      });
      continue;
    }

    const key = normalizeForMatch(quote);
    if (seen.has(key)) continue;
    seen.add(key);

    const isPromise = item.kind === "promise";
    const index = item.actionItemIndex;
    const actionItemId =
      index !== null && index >= 0 && index < actionItemIds.length
        ? actionItemIds[index]
        : null;

    rows.push({
      meeting_id: meetingId,
      action_item_id: isPromise ? actionItemId : null,
      kind: item.kind,
      statement: item.statement.trim(),
      quote,
      quote_language: item.quoteLanguage,
      speaker: item.speaker?.trim() || location.speaker,
      assignee: isPromise ? item.assignee?.trim() || null : null,
      due_date: isPromise ? normalizeDueDate(item.dueDate) : null,
      line_number: location.lineNumber,
    });
  }

  return rows;
}

/**
 * Replace this meeting's ledger items with freshly extracted ones. Items the
 * owner already reviewed (a confirmed or rejected link) are kept, and a new
 * item repeating a kept quote is skipped. Never throws: a ledger failure must
 * not fail processing, since insights and action items are already saved.
 */
export async function writeLedgerItems(
  supabase: SupabaseClient,
  {
    meetingId,
    rawText,
    items,
    actionItemIds,
  }: {
    meetingId: string;
    rawText: string;
    items: LedgerItemExtraction[];
    actionItemIds: string[];
  },
): Promise<number> {
  try {
    const { data: existing, error: existingErr } = await supabase
      .from("ledger_items")
      .select("id, quote")
      .eq("meeting_id", meetingId);
    if (existingErr) throw existingErr;

    const existingRows = (existing ?? []) as Array<{
      id: string;
      quote: string;
    }>;
    const keptIds = new Set<string>();

    if (existingRows.length > 0) {
      const { data: reviewed, error: reviewedErr } = await supabase
        .from("ledger_links")
        .select("item_id")
        .in(
          "item_id",
          existingRows.map((r) => r.id),
        )
        .in("state", ["confirmed", "rejected"]);
      if (reviewedErr) throw reviewedErr;
      for (const r of (reviewed ?? []) as Array<{ item_id: string }>) {
        keptIds.add(r.item_id);
      }

      const toDelete = existingRows
        .filter((r) => !keptIds.has(r.id))
        .map((r) => r.id);
      if (toDelete.length > 0) {
        const { error: delErr } = await supabase
          .from("ledger_items")
          .delete()
          .in("id", toDelete);
        if (delErr) throw delErr;
      }
    }

    const rows = prepareLedgerRows({
      meetingId,
      rawText,
      items,
      actionItemIds,
      keptQuotes: existingRows
        .filter((r) => keptIds.has(r.id))
        .map((r) => r.quote),
    });
    if (rows.length === 0) return 0;

    const { error: insertErr } = await supabase
      .from("ledger_items")
      .insert(rows);
    if (insertErr) throw insertErr;
    return rows.length;
  } catch (err) {
    console.error("[ledger] failed to write ledger items", { meetingId, err });
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Cross meeting matching (slice 2). The judge only suggests; a verdict is kept
// only when its quote is verified in this meeting's transcript.

export const ledgerVerdictSchema = z.object({
  verdicts: z.array(
    z.object({
      itemId: z.string(),
      relation: z.enum(["kept", "reversed", "none"]),
      confidence: z.number(),
      quote: z.string().nullable(),
    }),
  ),
});

export type LedgerVerdict = z.infer<
  typeof ledgerVerdictSchema
>["verdicts"][number];

export interface LedgerCandidate {
  id: string;
  kind: LedgerItemExtraction["kind"];
  statement: string;
  quote: string;
  assignee: string | null;
  dueDate: string | null;
}

/** "N: line" per transcript line, cut at the same cap processing uses. */
export function numberTranscriptLines(
  rawText: string,
  maxChars = LEDGER_JUDGE_MAX_CHARS,
): string {
  const truncated = rawText.length > maxChars;
  const text = truncated ? rawText.slice(0, maxChars) : rawText;
  const numbered = text
    .split(/\r?\n/u)
    .map((line, i) => `${i + 1}: ${line}`)
    .join("\n");
  return truncated
    ? `${numbered}\n[transcript truncated for processing]`
    : numbered;
}

/** One structured call judging every candidate. Throws when both providers fail. */
export async function judgeLedgerCandidates({
  rawText,
  candidates,
}: {
  rawText: string;
  candidates: LedgerCandidate[];
}): Promise<LedgerVerdict[]> {
  const list = candidates
    .map((c) =>
      JSON.stringify({
        id: c.id,
        kind: c.kind,
        statement: c.statement,
        quote: c.quote,
        assignee: c.assignee,
        dueDate: c.dueDate,
      }),
    )
    .join("\n");

  const { object } = await generateStructuredWithFallback({
    schema: ledgerVerdictSchema,
    prompt: `You check whether a meeting transcript shows earlier decisions and promises were kept or reversed.
The transcript may be English, Urdu, or mixed Urdu English. Lines are numbered as "N: text".

Earlier decisions and promises (one JSON object per line):
${list}

Transcript of the later meeting:
${numberTranscriptLines(rawText)}

Respond with a SINGLE JSON object only: { "verdicts": [ { "itemId": "id from the list", "relation": "kept | reversed | none", "confidence": 0.0, "quote": "exact words or null" } ] }
Rules:
- Give one verdict per listed item, using its exact id.
- "kept": the transcript gives clear evidence the promise was done or the decision was carried out.
- "reversed": the transcript gives clear evidence the promise or decision was undone, cancelled, or contradicted.
- Anything weaker (only mentioned, still planned, in progress, unclear) is "none". When unsure, answer "none".
- confidence: 0 to 1, how sure you are of the relation.
- quote: for kept or reversed, copy the evidence words EXACTLY from ONE transcript line, in the original language and script. Do not translate, do not include the line number or the "Speaker:" label. Use null for "none".`,
  });
  return object.verdicts;
}

const LINE_NUMBER_PREFIX = /^\s*\d+\s*:\s*/u;

export interface LedgerMatchRow {
  itemId: string;
  relation: "kept" | "reversed";
  confidence: number;
  quote: string;
  speaker: string | null;
  lineNumber: number;
}

/** Keep only confident, verified verdicts for known candidates (first per item wins). */
export function filterVerdicts({
  verdicts,
  candidateIds,
  rawText,
}: {
  verdicts: LedgerVerdict[];
  candidateIds: string[];
  rawText: string;
}): LedgerMatchRow[] {
  const allowed = new Set(candidateIds);
  const seen = new Set<string>();
  const rows: LedgerMatchRow[] = [];

  for (const v of verdicts) {
    if (!allowed.has(v.itemId) || seen.has(v.itemId)) continue;
    if (v.relation === "none") continue;
    if (!(v.confidence >= LEDGER_CONFIDENCE_THRESHOLD)) continue;

    // The judge sees numbered lines, so drop a copied "12: " before the label.
    const raw = (v.quote ?? "").replace(LINE_NUMBER_PREFIX, "");
    const quote = raw ? stripSpeakerPrefix(raw).trim() : "";
    const location = quote ? findQuoteLine(rawText, quote) : null;
    if (!location) {
      console.warn("[ledger] dropped unverified verdict quote", {
        itemId: v.itemId,
      });
      continue;
    }

    seen.add(v.itemId);
    rows.push({
      itemId: v.itemId,
      relation: v.relation,
      confidence: Math.min(1, v.confidence),
      quote,
      speaker: location.speaker,
      lineNumber: location.lineNumber,
    });
  }
  return rows;
}
