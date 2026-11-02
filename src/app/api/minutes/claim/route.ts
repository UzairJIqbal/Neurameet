import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase-server";
import {
  attributedLineIds,
  labelKey,
  linesFromLabel,
  listSpeakerLabels,
} from "@/agent/minutes";
import {
  fail,
  isUniqueViolation,
  loadRawText,
  loadReviewRows,
  requireAttester,
  requireReviewManager,
  REVIEW_NOT_OPEN,
  stillOpen,
  toAttesterRef,
  toClaimRef,
  toLineRef,
  type ClaimRow,
  type ReviewRows,
} from "@/lib/minutes-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tasdeeq, Verified Minutes (spec 0003, AC-8, AC-12). Claim a speaker label,
// or (a manager) assign or clear one. One holder per label.

interface Body {
  meetingId?: string;
  action?: string;
  speakerLabel?: string;
  userId?: string;
}

const NOT_OPEN = REVIEW_NOT_OPEN;
const OWNER_ONLY = "Only the meeting owner can assign or clear a speaker name";

/** The holder answered a line from this label, so the claim is locked. */
function claimLocked(rows: ReviewRows, claim: ClaimRow): boolean {
  const ids = new Set(
    linesFromLabel(rows.lines.map(toLineRef), claim.speaker_label),
  );
  return rows.attestations.some(
    (a) => a.user_id === claim.user_id && ids.has(a.line_id),
  );
}

/** A new label with unanswered lines puts a finished holder back to pending (AC-12). */
async function reopenIfUnanswered(
  supabase: SupabaseClient,
  reviewId: string,
  rows: ReviewRows,
  holderId: string,
  newClaim: ClaimRow,
): Promise<void> {
  const holder = rows.attesters.find((a) => a.user_id === holderId);
  if (!holder?.done_at) return;
  const claims = [...rows.claims, newClaim].map(toClaimRef);
  const mine = attributedLineIds(
    rows.lines.map(toLineRef),
    rows.attesters.map(toAttesterRef),
    claims,
    holderId,
  );
  const answered = new Set(
    rows.attestations
      .filter((a) => a.user_id === holderId)
      .map((a) => a.line_id),
  );
  if (mine.every((id) => answered.has(id))) return;
  const { error } = await supabase
    .from("minutes_attesters")
    .update({ done_at: null })
    .eq("review_id", reviewId)
    .eq("user_id", holderId);
  if (error) throw error;
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return fail(401, "Unauthorized");

  const body = (await request.json().catch(() => ({}))) as Body;
  const { meetingId, action, speakerLabel } = body;
  if (
    !meetingId ||
    !speakerLabel ||
    !["claim", "assign", "clear"].includes(action ?? "")
  ) {
    return fail(
      400,
      "meetingId, speakerLabel, and an action of claim, assign, or clear are required",
    );
  }

  try {
    const supabase = supabaseServer();
    // Claim: any frozen attester. Assign or clear: a manager (personal: the
    // owner attester; project: an Owner or Admin).
    const access =
      action === "claim"
        ? await requireAttester(supabase, meetingId, userId)
        : await requireReviewManager(supabase, meetingId, userId, OWNER_ONLY);
    if (!access.ok) return access.response;
    const { review } = access;
    if (review.status !== "open") return fail(409, NOT_OPEN);

    const key = labelKey(speakerLabel);
    const label = listSpeakerLabels(
      await loadRawText(supabase, meetingId),
    ).find((l) => l.key === key);
    if (!label) return fail(422, "That speaker name is not in the transcript");

    const rows = await loadReviewRows(supabase, review.id);
    const existing = rows.claims.find((c) => c.speaker_label === key) ?? null;

    if (action === "clear") {
      if (!existing) return fail(409, "That speaker name is not claimed");
      if (claimLocked(rows, existing)) {
        return fail(409, "Its holder already answered a line from it");
      }
      const { error } = await supabase
        .from("minutes_speaker_claims")
        .delete()
        .eq("review_id", review.id)
        .eq("speaker_label", key);
      if (error) throw error;
      if (!(await stillOpen(supabase, review.id))) {
        await supabase
          .from("minutes_speaker_claims")
          .insert({ review_id: review.id, ...existing });
        return fail(409, NOT_OPEN);
      }
      return NextResponse.json({ ok: true });
    }

    const holderId = action === "claim" ? userId : (body.userId ?? "");
    if (!rows.attesters.some((a) => a.user_id === holderId)) {
      return fail(422, "That person is not an attendee of this review");
    }
    if (existing) return fail(409, "That speaker name is already claimed");

    const claim: ClaimRow = {
      speaker_label: key,
      display_label: label.label,
      user_id: holderId,
      claimed_by: action === "claim" ? "self" : "owner",
    };
    const { error } = await supabase
      .from("minutes_speaker_claims")
      .insert({ review_id: review.id, ...claim });
    if (isUniqueViolation(error))
      return fail(409, "That speaker name is already claimed");
    if (error) throw error;

    if (!(await stillOpen(supabase, review.id))) {
      await supabase
        .from("minutes_speaker_claims")
        .delete()
        .eq("review_id", review.id)
        .eq("speaker_label", key);
      return fail(409, NOT_OPEN);
    }
    await reopenIfUnanswered(supabase, review.id, rows, holderId, claim);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[tasdeeq] claim failed", { meetingId, action, err });
    return fail(500, "Could not update the speaker name");
  }
}
