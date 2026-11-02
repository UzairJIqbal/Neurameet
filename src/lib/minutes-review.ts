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
import {
  accessErrorResponse,
  canManageMeeting,
  checkMeetingAccess,
} from "@/lib/project-auth";

// Tasdeeq, Verified Minutes (spec 0003). Row loaders and access guards shared by
// the minutes routes. Every caller passes the service role client.

export interface MeetingRow {
  id: string;
  user_id: string;
  /** Null (or absent in older fixtures) for a personal meeting. */
  project_id?: string | null;
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

export const MEETING_COLUMNS =
  "id, user_id, project_id, title, started_at, created_at";
const REVIEW_COLUMNS =
  "id, meeting_id, status, deadline_days, deadline_at, opened_at, coverage, transcript_source, transcript_sha256";
const LINE_COLUMNS =
  "id, position, section, text, evidence, supported, speaker_labels, action_item_id, assignee";

export const fail = (status: number, error: string) =>
  NextResponse.json({ error }, { status });

export const REVIEW_NOT_OPEN = "This review is not open";
const MEETING_NOT_FOUND = "Meeting not found";

const toAccessRow = (meeting: MeetingRow) => ({
  id: meeting.id,
  user_id: meeting.user_id,
  project_id: meeting.project_id ?? null,
});

/**
 * Boolean "manage" check (spec 0004 matrix): the creator of a personal
 * meeting, or an Owner or Admin of a project meeting.
 */
export function isMinutesManager(
  supabase: SupabaseClient,
  userId: string,
  meeting: MeetingRow,
): Promise<boolean> {
  return canManageMeeting(supabase, userId, toAccessRow(meeting));
}

/**
 * The gate for every owner only minutes action. Returns the denial, or null
 * when the caller may manage. Personal meeting, exactly as before W1: a
 * recorded participant gets 403 `ownerOnlyMessage`, anyone else 404. Project
 * meeting: a non member gets 404, a Developer or Viewer 403 "Not authorized".
 */
export async function minutesManagerDenial(
  supabase: SupabaseClient,
  userId: string,
  meeting: MeetingRow,
  ownerOnlyMessage: string,
): Promise<NextResponse | null> {
  if (!meeting.project_id) {
    if (meeting.user_id === userId) return null;
    return (await isRecordedParticipant(supabase, meeting.id, userId))
      ? fail(403, ownerOnlyMessage)
      : fail(404, MEETING_NOT_FOUND);
  }
  try {
    await checkMeetingAccess(supabase, userId, toAccessRow(meeting), "manage", {
      notFoundMessage: MEETING_NOT_FOUND,
    });
    return null;
  } catch (err) {
    const response = accessErrorResponse(err);
    if (response) return response;
    throw err;
  }
}

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
 * a manager has no review yet, 403 for anyone who is not a frozen attester.
 * The caller still checks `review.status`.
 */
export async function requireAttester(
  supabase: SupabaseClient,
  meetingId: string,
  userId: string,
): Promise<AttesterAccess> {
  const meeting = await loadMeeting(supabase, meetingId);
  if (!meeting) return { ok: false, response: fail(404, MEETING_NOT_FOUND) };
  return attesterAccess(supabase, meeting, userId);
}

/** `requireAttester` for a meeting already loaded. */
async function attesterAccess(
  supabase: SupabaseClient,
  meeting: MeetingRow,
  userId: string,
): Promise<AttesterAccess> {
  const review = await loadReview(supabase, meeting.id);
  if (!review) {
    return (await isMinutesManager(supabase, userId, meeting))
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

export type ManagerReviewAccess =
  | { ok: true; meeting: MeetingRow; review: ReviewRow }
  | { ok: false; response: NextResponse };

/**
 * The guard for manager only review edits (assign or clear a speaker name).
 * Personal meeting, exactly as before W1: the attester guard, then 409 when
 * the review is not open, then 403 `ownerOnlyMessage` for a non owner
 * attester. Project meeting: the manage matrix (non member 404, Developer or
 * Viewer 403), then 409 without a review; an Owner or Admin need not be an
 * attester. The caller still checks `review.status`.
 */
export async function requireReviewManager(
  supabase: SupabaseClient,
  meetingId: string,
  userId: string,
  ownerOnlyMessage: string,
): Promise<ManagerReviewAccess> {
  const meeting = await loadMeeting(supabase, meetingId);
  if (!meeting) return { ok: false, response: fail(404, MEETING_NOT_FOUND) };

  if (!meeting.project_id) {
    const access = await attesterAccess(supabase, meeting, userId);
    if (!access.ok) return access;
    if (access.review.status !== "open") {
      return { ok: false, response: fail(409, REVIEW_NOT_OPEN) };
    }
    if (!access.attester.is_owner) {
      return { ok: false, response: fail(403, ownerOnlyMessage) };
    }
    return { ok: true, meeting: access.meeting, review: access.review };
  }

  const denied = await minutesManagerDenial(
    supabase,
    userId,
    meeting,
    ownerOnlyMessage,
  );
  if (denied) return { ok: false, response: denied };
  const review = await loadReview(supabase, meetingId);
  if (!review) {
    return { ok: false, response: fail(409, "No minutes review is open") };
  }
  return { ok: true, meeting, review };
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
