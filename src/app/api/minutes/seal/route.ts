import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase-server";
import { sendMinutesSealedEmail, verifyUrlFor } from "@/lib/email";
import { buildStatusText, sealBlocker } from "@/agent/minutes";
import {
  fail,
  isRecordedParticipant,
  loadMeeting,
  loadReview,
  loadReviewRows,
  toAttesterRef,
  type AttesterRow,
  type MeetingRow,
  type ReviewRow,
} from "@/lib/minutes-review";
import {
  buildSealBundle,
  canonicalJson,
  loadSigningKey,
  sha256Hex,
  signCanonical,
  SigningKeyError,
} from "@/lib/minutes-seal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tasdeeq, Verified Minutes (spec 0003, AC-13 to AC-15, AC-17). Owner only.
// The review moves open → sealing first (a conditional update), so nothing can
// land while the bundle is built; any failure moves it back to open.

const SEAL_FAILED = "Could not seal the minutes";

async function previousSealHash(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("minutes_seals")
    .select("content_sha256")
    .eq("owner_id", ownerId)
    .order("sealed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as { content_sha256?: string } | null)?.content_sha256 ?? null;
}

async function backToOpen(
  supabase: SupabaseClient,
  reviewId: string,
): Promise<void> {
  const { error } = await supabase
    .from("minutes_reviews")
    .update({ status: "open" })
    .eq("id", reviewId)
    .eq("status", "sealing");
  if (error) console.error("[tasdeeq] seal revert failed", { reviewId, error });
}

async function emailAttesters(
  attesters: AttesterRow[],
  meeting: MeetingRow,
  sealId: string,
  hash: string,
  statusText: string,
): Promise<void> {
  const verifyUrl = verifyUrlFor(sealId);
  await Promise.all(
    attesters.map(async (a) => {
      if (!a.email) {
        console.warn("[tasdeeq] no email for attester, skipped", {
          userId: a.user_id,
        });
        return;
      }
      await sendMinutesSealedEmail({
        to: a.email,
        meetingTitle: meeting.title || "Untitled meeting",
        statusText,
        hash,
        verifyUrl,
      });
    }),
  );
}

interface Sealed {
  sealId: string;
  hash: string;
  statusText: string;
  attesters: AttesterRow[];
}

/** Runs while the review is `sealing`. Throws on any failure; the caller reverts. */
async function writeSeal(
  supabase: SupabaseClient,
  meeting: MeetingRow,
  review: ReviewRow,
  key: ReturnType<typeof loadSigningKey>,
): Promise<Sealed | { blocked: string }> {
  // Reread after the flip: these rows are now final.
  const rows = await loadReviewRows(supabase, review.id);
  const blocker = sealBlocker(
    rows.attesters.map(toAttesterRef),
    review.deadline_at,
    new Date(),
  );
  if (blocker) return { blocked: blocker };

  const statusText = buildStatusText(
    rows.attesters.map(toAttesterRef),
    rows.attestations,
  );
  const sealedAt = new Date().toISOString();
  const prev = await previousSealHash(supabase, meeting.user_id);
  const bundle = await buildSealBundle(
    supabase,
    meeting,
    review,
    rows,
    statusText,
    prev,
    sealedAt,
  );
  const canonical = canonicalJson(bundle);
  const hash = sha256Hex(canonical);

  const { data, error } = await supabase
    .from("minutes_seals")
    .insert({
      review_id: review.id,
      meeting_id: meeting.id,
      owner_id: meeting.user_id,
      content_sha256: hash,
      prev_seal_sha256: prev,
      signature: signCanonical(canonical, key.key),
      key_id: key.keyId,
      bundle,
      status_text: statusText,
      sealed_at: sealedAt,
    })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("seal insert returned nothing");
  const sealId = (data as { id: string }).id;

  const { error: doneErr } = await supabase
    .from("minutes_reviews")
    .update({ status: "sealed" })
    .eq("id", review.id)
    .eq("status", "sealing");
  if (doneErr) {
    await supabase.from("minutes_seals").delete().eq("id", sealId);
    throw doneErr;
  }
  return { sealId, hash, statusText, attesters: rows.attesters };
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return fail(401, "Unauthorized");

  const body = (await request.json().catch(() => ({}))) as {
    meetingId?: string;
  };
  const { meetingId } = body;
  if (!meetingId) return fail(400, "meetingId is required");

  const supabase = supabaseServer();
  try {
    const meeting = await loadMeeting(supabase, meetingId);
    if (!meeting) return fail(404, "Meeting not found");
    if (meeting.user_id !== userId) {
      return (await isRecordedParticipant(supabase, meetingId, userId))
        ? fail(403, "Only the meeting owner can seal the minutes")
        : fail(404, "Meeting not found");
    }

    const review = await loadReview(supabase, meetingId);
    if (!review) return fail(409, "No minutes review is open");
    if (review.status === "sealed")
      return fail(409, "These minutes are already sealed");
    if (review.status === "sealing")
      return fail(409, "A seal is already in progress");

    const rows = await loadReviewRows(supabase, review.id);
    const blocker = sealBlocker(
      rows.attesters.map(toAttesterRef),
      review.deadline_at,
      new Date(),
    );
    if (blocker) return fail(409, blocker);

    let key: ReturnType<typeof loadSigningKey>;
    try {
      key = loadSigningKey();
    } catch (err) {
      if (!(err instanceof SigningKeyError)) throw err;
      console.error("[tasdeeq] signing key unavailable");
      return fail(500, SEAL_FAILED);
    }

    const { data: flipped, error: flipErr } = await supabase
      .from("minutes_reviews")
      .update({ status: "sealing" })
      .eq("id", review.id)
      .eq("status", "open")
      .select("id");
    if (flipErr) throw flipErr;
    if (!flipped || flipped.length === 0)
      return fail(409, "A seal is already in progress");

    let result: Sealed | { blocked: string };
    try {
      result = await writeSeal(supabase, meeting, review, key);
    } catch (err) {
      await backToOpen(supabase, review.id);
      throw err;
    }
    if ("blocked" in result) {
      await backToOpen(supabase, review.id);
      return fail(409, result.blocked);
    }

    await emailAttesters(
      result.attesters,
      meeting,
      result.sealId,
      result.hash,
      result.statusText,
    );
    return NextResponse.json({
      sealId: result.sealId,
      hash: result.hash,
      statusText: result.statusText,
    });
  } catch (err) {
    console.error("[tasdeeq] seal failed", { meetingId, err });
    return fail(500, SEAL_FAILED);
  }
}
