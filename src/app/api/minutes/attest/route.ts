import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase-server";
import { attributedLineIds, canRecordView, labelKey } from "@/agent/minutes";
import {
  MINUTES_NOTE_MAX,
  type MinutesAttestAction,
} from "@/lib/minutes-types";
import {
  fail,
  loadReviewRows,
  loadSuggestions,
  requireAttester,
  stillOpen,
  toAttesterRef,
  toClaimRef,
  toLineRef,
  type AttestationRow,
  type ReviewRow,
  type ReviewRows,
} from "@/lib/minutes-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tasdeeq, Verified Minutes (spec 0003, AC-10, AC-11, AC-12). Confirm, correct,
// or record a view on a line (latest answer wins), adopt a dissent suggestion,
// or finish your review. The AI text of a line never changes.

interface Body {
  meetingId?: string;
  action?: string;
  lineId?: string;
  note?: unknown;
  suggestionId?: string;
}

const NOT_OPEN = "This review is not open";
const ACTIONS = ["confirm", "correct", "view", "finish"];

function myLineIds(rows: ReviewRows, userId: string): Set<string> {
  return new Set(
    attributedLineIds(
      rows.lines.map(toLineRef),
      rows.attesters.map(toAttesterRef),
      rows.claims.map(toClaimRef),
      userId,
    ),
  );
}

async function finish(
  supabase: SupabaseClient,
  review: ReviewRow,
  rows: ReviewRows,
  userId: string,
): Promise<NextResponse> {
  const answered = new Set(
    rows.attestations.filter((a) => a.user_id === userId).map((a) => a.line_id),
  );
  const unanswered = [...myLineIds(rows, userId)].filter(
    (id) => !answered.has(id),
  );
  if (unanswered.length > 0) {
    return fail(409, `Answer all your lines first (${unanswered.length} left)`);
  }
  const doneAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("minutes_attesters")
    .update({ done_at: doneAt })
    .eq("review_id", review.id)
    .eq("user_id", userId)
    .select("user_id");
  if (error) throw error;
  if (!data || data.length === 0) return fail(409, NOT_OPEN);
  if (!(await stillOpen(supabase, review.id))) {
    await supabase
      .from("minutes_attesters")
      .update({ done_at: null })
      .eq("review_id", review.id)
      .eq("user_id", userId);
    return fail(409, NOT_OPEN);
  }
  return NextResponse.json({ doneAt });
}

/** The answer before this request, so a write that lost a race to the seal can be undone. */
async function restore(
  supabase: SupabaseClient,
  lineId: string,
  userId: string,
  prior: AttestationRow | undefined,
): Promise<void> {
  if (prior) {
    await supabase
      .from("minutes_attestations")
      .upsert(prior, { onConflict: "line_id,user_id" });
  } else {
    await supabase
      .from("minutes_attestations")
      .delete()
      .eq("line_id", lineId)
      .eq("user_id", userId);
  }
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return fail(401, "Unauthorized");

  const body = (await request.json().catch(() => ({}))) as Body;
  const { meetingId, action, suggestionId } = body;
  if (!meetingId || !ACTIONS.includes(action ?? "")) {
    return fail(
      400,
      "meetingId and an action of confirm, correct, view, or finish are required",
    );
  }

  try {
    const supabase = supabaseServer();
    const access = await requireAttester(supabase, meetingId, userId);
    if (!access.ok) return access.response;
    const { review } = access;
    if (review.status !== "open") return fail(409, NOT_OPEN);

    const rows = await loadReviewRows(supabase, review.id);
    if (action === "finish")
      return await finish(supabase, review, rows, userId);
    const answer = action as MinutesAttestAction;

    // Adopting a dissent suggestion saves a view on its decision (AC-11).
    let suggestion = null;
    if (suggestionId) {
      if (answer !== "view")
        return fail(422, "A suggestion can only be adopted as a view");
      suggestion = (await loadSuggestions(supabase, review.id)).find(
        (s) => s.id === suggestionId,
      );
      if (!suggestion) return fail(404, "Suggestion not found");
      const key = labelKey(suggestion.speaker_label);
      const holder = rows.claims.find((c) => c.speaker_label === key);
      if (holder?.user_id !== userId)
        return fail(403, "This suggestion is not yours");
      if (suggestion.status !== "suggested")
        return fail(409, "This suggestion was already used");
    }

    const lineId = suggestion?.related_line_id ?? body.lineId;
    const line = rows.lines.find((l) => l.id === lineId);
    if (!line) return fail(404, "Line not found");
    if (suggestion && line.section !== "decision") {
      return fail(422, "Pick a decision line for this suggestion");
    }

    const rawNote = typeof body.note === "string" ? body.note.trim() : "";
    const note = rawNote || (suggestion?.position ?? "");
    if (
      answer !== "confirm" &&
      (note.length < 1 || note.length > MINUTES_NOTE_MAX)
    ) {
      return fail(
        422,
        `A note of 1 to ${MINUTES_NOTE_MAX} characters is required`,
      );
    }

    const mine = myLineIds(rows, userId).has(line.id);
    if (answer !== "view" && !mine)
      return fail(422, "This line is not yours to confirm or correct");
    if (answer === "view" && !canRecordView(toLineRef(line), mine)) {
      return fail(422, "You can't record a view on this line");
    }

    const prior = rows.attestations.find(
      (a) => a.line_id === line.id && a.user_id === userId,
    );
    const row: AttestationRow & { updated_at: string } = {
      line_id: line.id,
      user_id: userId,
      action: answer,
      note: answer === "confirm" ? null : note,
      late: Date.now() > new Date(review.deadline_at).getTime(),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("minutes_attestations")
      .upsert(row, { onConflict: "line_id,user_id" });
    if (error) throw error;

    if (suggestion) {
      const { error: sugErr } = await supabase
        .from("minutes_dissent_suggestions")
        .update({ status: "adopted" })
        .eq("id", suggestion.id)
        .eq("status", "suggested");
      if (sugErr) throw sugErr;
    }

    if (!(await stillOpen(supabase, review.id))) {
      await restore(supabase, line.id, userId, prior);
      if (suggestion) {
        await supabase
          .from("minutes_dissent_suggestions")
          .update({ status: "suggested" })
          .eq("id", suggestion.id);
      }
      return fail(409, NOT_OPEN);
    }

    return NextResponse.json({
      answer: {
        lineId: row.line_id,
        action: row.action,
        note: row.note,
        late: row.late,
      },
    });
  } catch (err) {
    console.error("[tasdeeq] attest failed", { meetingId, action, err });
    return fail(500, "Could not save your answer");
  }
}
