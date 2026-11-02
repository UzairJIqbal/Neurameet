import "server-only";
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase-server";
import type {
  MinutesAttestAction,
  MinutesClaimedBy,
  MinutesEvidence,
  MinutesSection,
  TranscriptSource,
} from "@/lib/minutes-types";
import {
  loadRawText,
  loadReviewRows,
  meetingDate,
  type MeetingRow,
  type ReviewRow,
  type ReviewRows,
} from "@/lib/minutes-review";

// Tasdeeq, Verified Minutes (spec 0003, AC-14, AC-16). The seal is the SHA-256
// of a canonical JSON bundle, chained to the owner's previous seal and signed
// with Ed25519. MINUTES_SIGNING_PRIVATE_KEY never leaves this module: it is
// not returned, logged, or written into the bundle.

export interface SealLine {
  id: string;
  position: number;
  section: MinutesSection;
  text: string;
  evidence: MinutesEvidence[];
  supported: boolean;
  speakerLabels: string[];
  assignee: string | null;
}

export interface SealAttester {
  userId: string;
  displayName: string;
  isOwner: boolean;
  doneAt: string | null;
}

export interface SealClaim {
  speakerLabel: string;
  userId: string;
  claimedBy: MinutesClaimedBy;
}

export interface SealAttestation {
  lineId: string;
  userId: string;
  action: MinutesAttestAction;
  note: string | null;
  late: boolean;
}

export interface SealLedgerItem {
  id: string;
  kind: string;
  statement: string;
  quote: string | null;
  assignee: string | null;
  dueDate: string | null;
  status: string;
  source: string | null;
}

export interface SealAgreement {
  statement: string;
  agreed: number;
  total: number;
  votes: Array<{ voterName: string; vote: "agree" | "not_yet" }>;
}

/** The part of the bundle that verify rebuilds from live rows. */
export interface SealSnapshot {
  lines: SealLine[];
  attesters: SealAttester[];
  claims: SealClaim[];
  attestations: SealAttestation[];
}

export interface SealBundle extends SealSnapshot {
  version: 1;
  meeting: { id: string; title: string; date: string };
  review: {
    id: string;
    openedAt: string;
    deadlineAt: string;
    deadlineDays: number;
  };
  transcript: { source: TranscriptSource; sha256: string };
  coverageText: string;
  ledgerItems: SealLedgerItem[];
  liveAgreements: SealAgreement[];
  statusText: string;
  prevSealSha256: string | null;
  sealedAt: string;
}

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** Sorted keys, no spaces; arrays keep the order the caller gave (AC-14). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): Json {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const out: { [key: string]: Json } = {};
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeys(v);
    }
    return out;
  }
  return value as Json;
}

export const sha256Hex = (text: string): string =>
  createHash("sha256").update(text, "utf8").digest("hex");

const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Rows to the bundle's snapshot part, in the fixed array order (AC-14). */
export function buildSnapshot(rows: ReviewRows): SealSnapshot {
  const positionOf = new Map(rows.lines.map((l) => [l.id, l.position]));
  return {
    lines: [...rows.lines]
      .sort((a, b) => a.position - b.position)
      .map((l) => ({
        id: l.id,
        position: l.position,
        section: l.section,
        text: l.text,
        evidence: (l.evidence ?? []).map((e) => ({
          quote: e.quote,
          lineNumber: e.lineNumber,
          speaker: e.speaker,
        })),
        supported: l.supported,
        speakerLabels: l.speaker_labels ?? [],
        assignee: l.assignee,
      })),
    attesters: rows.attesters
      .map((a) => ({
        userId: a.user_id,
        displayName: a.display_name,
        isOwner: a.is_owner,
        doneAt: a.done_at ? new Date(a.done_at).toISOString() : null,
      }))
      .sort((a, b) => byString(a.userId, b.userId)),
    claims: rows.claims
      .map((c) => ({
        speakerLabel: c.speaker_label,
        userId: c.user_id,
        claimedBy: c.claimed_by,
      }))
      .sort(
        (a, b) =>
          byString(a.userId, b.userId) ||
          byString(a.speakerLabel, b.speakerLabel),
      ),
    attestations: rows.attestations
      .map((a) => ({
        lineId: a.line_id,
        userId: a.user_id,
        action: a.action,
        note: a.note,
        late: a.late,
      }))
      .sort(
        (a, b) =>
          (positionOf.get(a.lineId) ?? 0) - (positionOf.get(b.lineId) ?? 0) ||
          byString(a.userId, b.userId),
      ),
  };
}

export class SigningKeyError extends Error {}

/** The Ed25519 key from env; PEM newlines may be written as `\n`. */
export function loadSigningKey(): { key: KeyObject; keyId: string } {
  const pem = process.env.MINUTES_SIGNING_PRIVATE_KEY;
  const keyId = process.env.MINUTES_SIGNING_KEY_ID;
  if (!pem || !keyId) throw new SigningKeyError("missing");
  try {
    const key = createPrivateKey(pem.replace(/\\n/g, "\n"));
    if (key.asymmetricKeyType !== "ed25519")
      throw new SigningKeyError("not ed25519");
    return { key, keyId };
  } catch {
    throw new SigningKeyError("invalid");
  }
}

export const signCanonical = (canonical: string, key: KeyObject): string =>
  sign(null, Buffer.from(canonical, "utf8"), key).toString("base64");

export function verifySignature(
  canonical: string,
  signature: string,
  key: KeyObject,
): boolean {
  try {
    return verify(
      null,
      Buffer.from(canonical, "utf8"),
      createPublicKey(key),
      Buffer.from(signature, "base64"),
    );
  } catch {
    return false;
  }
}

async function loadLedgerItems(
  supabase: SupabaseClient,
  meetingId: string,
): Promise<SealLedgerItem[]> {
  const { data, error } = await supabase
    .from("ledger_items")
    .select(
      "id, kind, statement, quote, assignee, due_date, status, source, line_number",
    )
    .eq("meeting_id", meetingId);
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    id: string;
    kind: string;
    statement: string;
    quote: string | null;
    assignee: string | null;
    due_date: string | null;
    status: string;
    source: string | null;
    line_number: number | null;
  }>;
  return rows
    .sort(
      (a, b) =>
        (a.line_number ?? Number.MAX_SAFE_INTEGER) -
          (b.line_number ?? Number.MAX_SAFE_INTEGER) || byString(a.id, b.id),
    )
    .map((r) => ({
      id: r.id,
      kind: r.kind,
      statement: r.statement,
      quote: r.quote,
      assignee: r.assignee,
      dueDate: r.due_date,
      status: r.status,
      source: r.source,
    }));
}

/** Closed live agreements with each vote; voter names from attesters, then attendance, else "Guest". */
async function loadAgreements(
  supabase: SupabaseClient,
  meetingId: string,
  attesterNames: Map<string, string>,
): Promise<SealAgreement[]> {
  const { data, error } = await supabase
    .from("ledger_agreements")
    .select("id, statement, agreed_count, total_count, opened_at")
    .eq("meeting_id", meetingId)
    .eq("status", "closed")
    .order("opened_at", { ascending: true });
  if (error) throw error;
  const agreements = (data ?? []) as Array<{
    id: string;
    statement: string;
    agreed_count: number | null;
    total_count: number | null;
  }>;
  if (agreements.length === 0) return [];

  const [{ data: votes, error: vErr }, { data: people, error: pErr }] =
    await Promise.all([
      supabase
        .from("ledger_agreement_votes")
        .select("agreement_id, voter_id, vote")
        .in(
          "agreement_id",
          agreements.map((a) => a.id),
        ),
      supabase
        .from("attendance_events")
        .select("user_id, stream_user_id, participant_name")
        .eq("meeting_id", meetingId)
        .order("session_started_at", { ascending: false }),
    ]);
  if (vErr) throw vErr;
  if (pErr) throw pErr;

  const names = new Map(attesterNames);
  for (const p of (people ?? []) as Array<{
    user_id: string | null;
    stream_user_id: string | null;
    participant_name: string | null;
  }>) {
    for (const id of [p.user_id, p.stream_user_id]) {
      if (id && p.participant_name && !names.has(id))
        names.set(id, p.participant_name);
    }
  }

  const voteRows = (votes ?? []) as Array<{
    agreement_id: string;
    voter_id: string;
    vote: "agree" | "not_yet";
  }>;
  return agreements.map((a) => ({
    statement: a.statement,
    agreed: a.agreed_count ?? 0,
    total: a.total_count ?? 0,
    votes: voteRows
      .filter((v) => v.agreement_id === a.id)
      .sort((x, y) => byString(x.voter_id, y.voter_id))
      .map((v) => ({
        voterName: names.get(v.voter_id) ?? "Guest",
        vote: v.vote,
      })),
  }));
}

/** Everything the seal signs, built from live rows (AC-14). */
export async function buildSealBundle(
  supabase: SupabaseClient,
  meeting: MeetingRow,
  review: ReviewRow,
  rows: ReviewRows,
  statusText: string,
  prevSealSha256: string | null,
  sealedAt: string,
): Promise<SealBundle> {
  const names = new Map(rows.attesters.map((a) => [a.user_id, a.display_name]));
  const [ledgerItems, liveAgreements] = await Promise.all([
    loadLedgerItems(supabase, meeting.id),
    loadAgreements(supabase, meeting.id, names),
  ]);
  return {
    version: 1,
    meeting: {
      id: meeting.id,
      title: meeting.title || "Untitled meeting",
      date: meetingDate(meeting),
    },
    review: {
      id: review.id,
      openedAt: new Date(review.opened_at).toISOString(),
      deadlineAt: new Date(review.deadline_at).toISOString(),
      deadlineDays: review.deadline_days,
    },
    transcript: {
      source: review.transcript_source,
      sha256: review.transcript_sha256,
    },
    coverageText: review.coverage.text,
    ...buildSnapshot(rows),
    ledgerItems,
    liveAgreements,
    statusText,
    prevSealSha256,
    sealedAt,
  };
}

export interface VerifyResult {
  result: "intact" | "altered";
  hashMatches: boolean | null;
  hash: string;
  title: string;
  date: string;
  statusText: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SealRow {
  id: string;
  review_id: string;
  meeting_id: string;
  content_sha256: string;
  signature: string;
  key_id: string;
  bundle: SealBundle;
  status_text: string;
}

/** Why a seal is altered, kept server side only. Null when intact. */
async function alteredReason(
  supabase: SupabaseClient,
  seal: SealRow,
): Promise<string | null> {
  const canonical = canonicalJson(seal.bundle);
  if (sha256Hex(canonical) !== seal.content_sha256)
    return "bundle hash differs";

  let key: KeyObject;
  try {
    const loaded = loadSigningKey();
    if (loaded.keyId !== seal.key_id) {
      console.warn("[tasdeeq] seal signed with retired key", {
        sealId: seal.id,
      });
      return "retired key";
    }
    key = loaded.key;
  } catch {
    console.error("[tasdeeq] signing key unavailable");
    return "signing key unavailable";
  }
  if (!verifySignature(canonical, seal.signature, key))
    return "signature fails";

  const live = buildSnapshot(await loadReviewRows(supabase, seal.review_id));
  const sealed: SealSnapshot = {
    lines: seal.bundle.lines,
    attesters: seal.bundle.attesters,
    claims: seal.bundle.claims,
    attestations: seal.bundle.attestations,
  };
  if (canonicalJson(live) !== canonicalJson(sealed)) return "live rows differ";

  const rawText = await loadRawText(supabase, seal.meeting_id);
  if (sha256Hex(rawText) !== seal.bundle.transcript.sha256)
    return "transcript differs";
  return null;
}

/** Public verify (AC-16). Null for an unknown seal id. Never returns minutes text. */
export async function verifySeal(
  sealId: string,
  pastedHash?: string | null,
): Promise<VerifyResult | null> {
  if (!UUID.test(sealId)) return null;
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("minutes_seals")
    .select(
      "id, review_id, meeting_id, content_sha256, signature, key_id, bundle, status_text",
    )
    .eq("id", sealId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const seal = data as SealRow;

  const reason = await alteredReason(supabase, seal);
  if (reason) console.warn("[tasdeeq] seal altered", { sealId, reason });
  const pasted = pastedHash?.trim().toLowerCase();
  return {
    result: reason ? "altered" : "intact",
    hashMatches: pasted ? pasted === seal.content_sha256 : null,
    hash: seal.content_sha256,
    title: seal.bundle.meeting?.title ?? "",
    date: seal.bundle.meeting?.date ?? "",
    statusText: seal.status_text,
  };
}
