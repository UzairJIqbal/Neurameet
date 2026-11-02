import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  MinutesAttestAction,
  MinutesClaimedBy,
  MinutesEvidence,
  MinutesReviewStatus,
  MinutesSection,
  MinutesSuggestionStatus,
  TranscriptSource,
} from "@/lib/minutes-types";
import type { AttesterRef, AttributableLine, ClaimRef } from "@/agent/minutes";

// Tasdeeq, Verified Minutes (spec 0003). Row loaders and access guards shared by
// the minutes routes. Every caller passes the service role client.

export interface MeetingRow {
  id: string;
  user_id: string;
  title: string | null;
  started_at: string | null;
  created_at: string | null;
}

export interface ReviewRow {
  id: string;
  meeting_id: string;
  status: MinutesReviewStatus;
  deadline_days: number;
  deadline_at: string;
  opened_at: string;
  coverage: { lastLine: number; totalLines: number; text: string };
  transcript_source: TranscriptSource;
  transcript_sha256: string;
}

export interface LineRow {
  id: string;
  position: number;
  section: MinutesSection;
  text: string;
  evidence: MinutesEvidence[];
  supported: boolean;
  speaker_labels: string[];
  action_item_id: string | null;
  assignee: string | null;
}

export interface AttesterRow {
  user_id: string;
  display_name: string;
  email: string | null;
  is_owner: boolean;
  done_at: string | null;
}

export interface ClaimRow {
  speaker_label: string;
  display_label: string;
  user_id: string;
  claimed_by: MinutesClaimedBy;
}

export interface AttestationRow {
  line_id: string;
  user_id: string;
  action: MinutesAttestAction;
  note: string | null;
  late: boolean;
}

export interface SuggestionRow {
  id: string;
  review_id: string;
  speaker_label: string;
  topic: string;
  position: string;
  quote: string;
  line_number: number;
  related_line_id: string | null;
  status: MinutesSuggestionStatus;
}

export interface ReviewRows {
  lines: LineRow[];
  attesters: AttesterRow[];
  claims: ClaimRow[];
  attestations: AttestationRow[];
}

export const MEETING_COLUMNS = "id, user_id, title, started_at, created_at";
const REVIEW_COLUMNS =
  "id, meeting_id, status, deadline_days, deadline_at, opened_at, coverage, transcript_source, transcript_sha256";
const LINE_COLUMNS =
  "id, position, section, text, evidence, supported, speaker_labels, action_item_id, assignee";

export const fail = (status: number, error: string) =>
  NextResponse.json({ error }, { status });

export async function loadMeeting(
  supabase: SupabaseClient,
  meetingId: string,
): Promise<MeetingRow | null> {
  const { data, error } = await supabase
    .from("meetings")
    .select(MEETING_COLUMNS)
    .eq("id", meetingId)
    .maybeSingle();
  if (error) throw error;
  return (data as MeetingRow | null) ?? null;
}

export async function loadReview(
  supabase: SupabaseClient,
  meetingId: string,
): Promise<ReviewRow | null> {
  const { data, error } = await supabase
    .from("minutes_reviews")
    .select(REVIEW_COLUMNS)
    .eq("meeting_id", meetingId)
    .maybeSingle();
  if (error) throw error;
  return (data as ReviewRow | null) ?? null;
}

export async function isRecordedParticipant(
  supabase: SupabaseClient,
  meetingId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("attendance_events")
    .select("user_id")
    .eq("meeting_id", meetingId)
    .eq("user_id", userId)
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

/** Lines, attesters, claims, and answers of one review. */
export async function loadReviewRows(
  supabase: SupabaseClient,
  reviewId: string,
): Promise<ReviewRows> {
  const [lines, attesters, claims] = await Promise.all([
    supabase
      .from("minutes_lines")
      .select(LINE_COLUMNS)
      .eq("review_id", reviewId)
      .order("position", { ascending: true }),
    supabase
      .from("minutes_attesters")
      .select("user_id, display_name, email, is_owner, done_at")
      .eq("review_id", reviewId),
    supabase
      .from("minutes_speaker_claims")
      .select("speaker_label, display_label, user_id, claimed_by")
      .eq("review_id", reviewId),
  ]);
  if (lines.error) throw lines.error;
  if (attesters.error) throw attesters.error;
  if (claims.error) throw claims.error;

  const lineRows = (lines.data ?? []) as LineRow[];
  let attestations: AttestationRow[] = [];
  if (lineRows.length > 0) {
    const { data, error } = await supabase
      .from("minutes_attestations")
      .select("line_id, user_id, action, note, late")
      .in(
        "line_id",
        lineRows.map((l) => l.id),
      );
    if (error) throw error;
    attestations = (data ?? []) as AttestationRow[];
  }

  return {
    lines: lineRows,
    attesters: (attesters.data ?? []) as AttesterRow[],
    claims: (claims.data ?? []) as ClaimRow[],
    attestations,
  };
}

export async function loadSuggestions(
  supabase: SupabaseClient,
  reviewId: string,
): Promise<SuggestionRow[]> {
  const { data, error } = await supabase
    .from("minutes_dissent_suggestions")
    .select(
      "id, review_id, speaker_label, topic, position, quote, line_number, related_line_id, status",
    )
    .eq("review_id", reviewId);
  if (error) throw error;
  return (data ?? []) as SuggestionRow[];
}

export async function loadRawText(
  supabase: SupabaseClient,
  meetingId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("transcripts")
    .select("raw_text")
    .eq("meeting_id", meetingId)
    .maybeSingle();
  if (error) throw error;
  return (data as { raw_text?: string | null } | null)?.raw_text ?? "";
}

/** True while the review is still open, for the recheck after every write. */
export async function stillOpen(
  supabase: SupabaseClient,
  reviewId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("minutes_reviews")
    .select("status")
    .eq("id", reviewId)
    .maybeSingle();
  if (error) throw error;
  return (data as { status?: string } | null)?.status === "open";
}

// Row to helper shape mappers, so the pure attribution code never sees DB names.
export const toLineRef = (l: LineRow): AttributableLine => ({
  id: l.id,
  section: l.section,
  supported: l.supported,
  evidence: l.evidence ?? [],
  assignee: l.assignee,
});
export const toAttesterRef = (a: AttesterRow): AttesterRef => ({
  userId: a.user_id,
  displayName: a.display_name,
  isOwner: a.is_owner,
  doneAt: a.done_at,
});
export const toClaimRef = (c: ClaimRow): ClaimRef => ({
  speakerLabel: c.speaker_label,
  userId: c.user_id,
});

export type AttesterAccess =
  | { ok: true; meeting: MeetingRow; review: ReviewRow; attester: AttesterRow }
  | { ok: false; response: NextResponse };

/**
 * The guard for every attester mutation: 404 for a missing meeting, 409 when
 * the owner has no review yet, 403 for anyone who is not a frozen attester.
 * The caller still checks `review.status`.
 */
export async function requireAttester(
  supabase: SupabaseClient,
  meetingId: string,
  userId: string,
): Promise<AttesterAccess> {
  const meeting = await loadMeeting(supabase, meetingId);
  if (!meeting) return { ok: false, response: fail(404, "Meeting not found") };

  const review = await loadReview(supabase, meetingId);
  if (!review) {
    return meeting.user_id === userId
      ? { ok: false, response: fail(409, "No minutes review is open") }
      : {
          ok: false,
          response: fail(403, "You are not an attendee of this review"),
        };
  }

  const { data, error } = await supabase
    .from("minutes_attesters")
    .select("user_id, display_name, email, is_owner, done_at")
    .eq("review_id", review.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    return {
      ok: false,
      response: fail(403, "You are not an attendee of this review"),
    };
  }
  return { ok: true, meeting, review, attester: data as AttesterRow };
}

/** Postgres unique violation. */
export const isUniqueViolation = (err: unknown): boolean =>
  (err as { code?: string } | null)?.code === "23505";

/** YYYY-MM-DD of started_at, else created_at. */
export function meetingDate(meeting: MeetingRow): string {
  const raw = meeting.started_at ?? meeting.created_at;
  const parsed = raw ? new Date(raw) : null;
  return parsed && !Number.isNaN(parsed.getTime())
    ? parsed.toISOString().slice(0, 10)
    : "";
}
