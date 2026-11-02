import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import { labelKey } from "@/agent/minutes";
import {
  fail,
  loadReviewRows,
  loadSuggestions,
  requireAttester,
  stillOpen,
} from "@/lib/minutes-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tasdeeq, Verified Minutes (spec 0003, AC-11). The holder of a suggestion's
// speaker label dismisses it. Adopting goes through POST /api/minutes/attest.

interface Body {
  meetingId?: string;
  suggestionId?: string;
  action?: string;
}

const NOT_OPEN = "This review is not open";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return fail(401, "Unauthorized");

  const body = (await request.json().catch(() => ({}))) as Body;
  const { meetingId, suggestionId, action } = body;
  if (!meetingId || !suggestionId || action !== "dismiss") {
    return fail(
      400,
      "meetingId, suggestionId, and action dismiss are required",
    );
  }

  try {
    const supabase = supabaseServer();
    const access = await requireAttester(supabase, meetingId, userId);
    if (!access.ok) return access.response;
    const { review } = access;
    if (review.status !== "open") return fail(409, NOT_OPEN);

    const suggestion = (await loadSuggestions(supabase, review.id)).find(
      (s) => s.id === suggestionId,
    );
    if (!suggestion) return fail(404, "Suggestion not found");
    const { claims } = await loadReviewRows(supabase, review.id);
    const key = labelKey(suggestion.speaker_label);
    if (claims.find((c) => c.speaker_label === key)?.user_id !== userId) {
      return fail(403, "This suggestion is not yours");
    }
    if (suggestion.status !== "suggested")
      return fail(409, "This suggestion was already used");

    const { error } = await supabase
      .from("minutes_dissent_suggestions")
      .update({ status: "dismissed" })
      .eq("id", suggestion.id)
      .eq("status", "suggested");
    if (error) throw error;

    if (!(await stillOpen(supabase, review.id))) {
      await supabase
        .from("minutes_dissent_suggestions")
        .update({ status: "suggested" })
        .eq("id", suggestion.id);
      return fail(409, NOT_OPEN);
    }
    return NextResponse.json({ status: "dismissed" });
  } catch (err) {
    console.error("[tasdeeq] suggestion dismiss failed", { meetingId, err });
    return fail(500, "Could not dismiss the suggestion");
  }
}
