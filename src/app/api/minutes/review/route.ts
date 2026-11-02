import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import { sendReviewOpenEmail } from "@/lib/email";
import { computeDeadline } from "@/agent/minutes";
import {
  coverageText,
  formatDeadline,
  MINUTES_DEADLINE_DAYS,
  MINUTES_DEFAULT_DEADLINE_DAYS,
  type MinutesDraft,
} from "@/lib/minutes-types";
import {
  fail,
  isRecordedParticipant,
  isUniqueViolation,
  loadMeeting,
  loadReview,
  type MeetingRow,
} from "@/lib/minutes-review";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tasdeeq, Verified Minutes (spec 0003). Owner only: open a review (AC-5, AC-6,
// AC-17) or cancel an open one (AC-7).

interface Body {
  meetingId?: string;
  action?: string;
  deadlineDays?: unknown;
}

interface AttesterSeed {
  user_id: string;
  display_name: string;
  email: string | null;
  is_owner: boolean;
}

interface AttendanceRow {
  user_id: string | null;
  participant_name: string | null;
  participant_email: string | null;
}

const isDraft = (value: unknown): value is MinutesDraft =>
  typeof value === "object" &&
  value !== null &&
  (value as { version?: unknown }).version === 1;

/** Clerk name and primary email; a Clerk failure is logged and open continues. */
async function clerkProfile(
  userId: string,
): Promise<{ name: string | null; email: string | null }> {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const name = [user.firstName, user.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    return {
      name: name || null,
      email: user.primaryEmailAddress?.emailAddress ?? null,
    };
  } catch (err) {
    console.error("[tasdeeq] clerk lookup failed", { userId, err });
    return { name: null, email: null };
  }
}

/** The owner plus every distinct signed in attendee, names and emails frozen now. */
async function freezeAttesters(
  supabase: SupabaseClient,
  meeting: MeetingRow,
): Promise<AttesterSeed[]> {
  const { data, error } = await supabase
    .from("attendance_events")
    .select("user_id, participant_name, participant_email")
    .eq("meeting_id", meeting.id)
    .order("session_started_at", { ascending: false });
  if (error) throw error;

  // Newest row first, so the first name seen per user is the latest.
  const latest = new Map<string, AttendanceRow>();
  for (const row of (data ?? []) as AttendanceRow[]) {
    if (!row.user_id || row.user_id.startsWith("guest-")) continue;
    const seen = latest.get(row.user_id);
    if (!seen) latest.set(row.user_id, { ...row });
    else {
      seen.participant_name ??= row.participant_name;
      seen.participant_email ??= row.participant_email;
    }
  }

  const ids = [
    meeting.user_id,
    ...[...latest.keys()].filter((id) => id !== meeting.user_id),
  ];
  return Promise.all(
    ids.map(async (id) => {
      const row = latest.get(id);
      const profile = await clerkProfile(id);
      return {
        user_id: id,
        display_name:
          row?.participant_name?.trim() || profile.name || "Attendee",
        email: profile.email ?? row?.participant_email ?? null,
        is_owner: id === meeting.user_id,
      };
    }),
  );
}

async function existingActionItemIds(
  supabase: SupabaseClient,
  draft: MinutesDraft,
): Promise<Set<string>> {
  const ids = draft.lines
    .map((l) => l.actionItemId)
    .filter((id): id is string => id !== null);
  if (ids.length === 0) return new Set();
  const { data, error } = await supabase
    .from("action_items")
    .select("id")
    .in("id", ids);
  if (error) throw error;
  return new Set(((data ?? []) as Array<{ id: string }>).map((r) => r.id));
}

/** Copies the frozen draft into the review tables; throws on any insert error. */
async function copyDraft(
  supabase: SupabaseClient,
  reviewId: string,
  draft: MinutesDraft,
  attesters: AttesterSeed[],
): Promise<void> {
  const known = await existingActionItemIds(supabase, draft);
  const { data: lines, error: linesErr } = await supabase
    .from("minutes_lines")
    .insert(
      draft.lines.map((l, position) => ({
        review_id: reviewId,
        position,
        section: l.section,
        text: l.text,
        evidence: l.evidence,
        supported: l.supported,
        speaker_labels: l.speakerLabels,
        action_item_id:
          l.actionItemId && known.has(l.actionItemId) ? l.actionItemId : null,
        assignee: l.assignee,
      })),
    )
    .select("id, position, section");
  if (linesErr) throw linesErr;

  const { error: attErr } = await supabase
    .from("minutes_attesters")
    .insert(attesters.map((a) => ({ ...a, review_id: reviewId })));
  if (attErr) throw attErr;

  if (draft.dissentSuggestions.length === 0) return;
  const decisionIds = (
    (lines ?? []) as Array<{ id: string; position: number; section: string }>
  )
    .filter((l) => l.section === "decision")
    .sort((a, b) => a.position - b.position)
    .map((l) => l.id);
  const { error: sugErr } = await supabase
    .from("minutes_dissent_suggestions")
    .insert(
      draft.dissentSuggestions.map((s) => ({
        review_id: reviewId,
        speaker_label: s.speakerLabel,
        topic: s.topic,
        position: s.position,
        quote: s.quote,
        line_number: s.lineNumber,
        related_line_id:
          s.relatedDecisionIndex !== null
            ? (decisionIds[s.relatedDecisionIndex] ?? null)
            : null,
      })),
    );
  if (sugErr) throw sugErr;
}

async function emailAttesters(
  attesters: AttesterSeed[],
  meeting: MeetingRow,
  deadlineAt: string,
): Promise<void> {
  const deadlineText = formatDeadline(deadlineAt);
  await Promise.all(
    attesters
      .filter((a) => !a.is_owner)
      .map(async (a) => {
        if (!a.email) {
          console.warn("[tasdeeq] no email for attester, skipped", {
            userId: a.user_id,
          });
          return;
        }
        await sendReviewOpenEmail({
          to: a.email,
          meetingTitle: meeting.title || "Untitled meeting",
          meetingId: meeting.id,
          deadlineText,
        });
      }),
  );
}

async function openReview(
  supabase: SupabaseClient,
  meeting: MeetingRow,
  deadlineDays: number,
): Promise<NextResponse> {
  if (await loadReview(supabase, meeting.id)) {
    return fail(409, "A review already exists for this meeting");
  }

  const [
    { data: insights, error: insErr },
    { data: transcript, error: trErr },
  ] = await Promise.all([
    supabase
      .from("meeting_insights")
      .select("minutes_draft")
      .eq("meeting_id", meeting.id)
      .maybeSingle(),
    supabase
      .from("transcripts")
      .select("raw_text, source")
      .eq("meeting_id", meeting.id)
      .maybeSingle(),
  ]);
  if (insErr) throw insErr;
  if (trErr) throw trErr;
  const draft: unknown = (insights as { minutes_draft?: unknown } | null)
    ?.minutes_draft;
  const tr = transcript as {
    raw_text?: string | null;
    source?: string | null;
  } | null;
  if (!isDraft(draft) || !tr?.raw_text)
    return fail(409, "Process the meeting first");

  const attesters = await freezeAttesters(supabase, meeting);
  const deadlineAt = computeDeadline(new Date(), deadlineDays).toISOString();

  const { data: review, error: reviewErr } = await supabase
    .from("minutes_reviews")
    .insert({
      meeting_id: meeting.id,
      deadline_days: deadlineDays,
      deadline_at: deadlineAt,
      coverage: { ...draft.coverage, text: coverageText(draft.coverage) },
      transcript_source: tr.source === "recording" ? "recording" : "upload",
      transcript_sha256: createHash("sha256")
        .update(tr.raw_text, "utf8")
        .digest("hex"),
    })
    .select("id")
    .single();
  if (isUniqueViolation(reviewErr))
    return fail(409, "A review already exists for this meeting");
  if (reviewErr || !review)
    throw reviewErr ?? new Error("review insert returned nothing");
  const reviewId = (review as { id: string }).id;

  try {
    await copyDraft(supabase, reviewId, draft, attesters);
  } catch (err) {
    // Half copied reviews must not stay behind; the cascade removes the rest.
    await supabase.from("minutes_reviews").delete().eq("id", reviewId);
    throw err;
  }

  await emailAttesters(attesters, meeting, deadlineAt);
  return NextResponse.json({ reviewId, deadlineAt });
}

async function cancelReview(
  supabase: SupabaseClient,
  meetingId: string,
): Promise<NextResponse> {
  const review = await loadReview(supabase, meetingId);
  if (!review) return fail(409, "There is no review to cancel");
  if (review.status !== "open")
    return fail(409, "Sealed minutes can't be cancelled");

  const { data, error } = await supabase
    .from("minutes_reviews")
    .delete()
    .eq("id", review.id)
    .eq("status", "open")
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0)
    return fail(409, "Sealed minutes can't be cancelled");
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return fail(401, "Unauthorized");

  const body = (await request.json().catch(() => ({}))) as Body;
  const { meetingId, action } = body;
  if (!meetingId || (action !== "open" && action !== "cancel")) {
    return fail(400, "meetingId and an action of open or cancel are required");
  }

  try {
    const supabase = supabaseServer();
    const meeting = await loadMeeting(supabase, meetingId);
    if (!meeting) return fail(404, "Meeting not found");
    if (meeting.user_id !== userId) {
      return (await isRecordedParticipant(supabase, meetingId, userId))
        ? fail(403, "Only the meeting owner can do this")
        : fail(404, "Meeting not found");
    }

    if (action === "cancel") return await cancelReview(supabase, meetingId);

    const days = body.deadlineDays ?? MINUTES_DEFAULT_DEADLINE_DAYS;
    if (!MINUTES_DEADLINE_DAYS.some((d) => d === days)) {
      return fail(422, "deadlineDays must be 3 or 7");
    }
    return await openReview(supabase, meeting, days as number);
  } catch (err) {
    console.error("[tasdeeq] review action failed", { meetingId, action, err });
    return fail(500, "Could not update the review");
  }
}
