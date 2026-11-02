import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MinutesReviewStatus } from "@/lib/minutes-types";

// Tasdeeq, Verified Minutes (spec 0003, AC-7). The single check every route
// that writes meeting_insights, action_items, or transcripts.raw_text calls:
// while a minutes review exists (open, sealing, or sealed) those rows are frozen.

export async function minutesReviewStatus(
  supabase: SupabaseClient,
  meetingId: string,
): Promise<MinutesReviewStatus | null> {
  const { data, error } = await supabase
    .from("minutes_reviews")
    .select("status")
    .eq("meeting_id", meetingId)
    .maybeSingle();
  if (error) throw error;
  const status = (data as { status?: MinutesReviewStatus } | null)?.status;
  return status ?? null;
}

/** A 409 (or a 500 when the check itself fails) to return, or null when unlocked. */
export async function assertMinutesUnlocked(
  supabase: SupabaseClient,
  meetingId: string,
): Promise<NextResponse | null> {
  try {
    const status = await minutesReviewStatus(supabase, meetingId);
    if (!status) return null;
    const error =
      status === "open"
        ? "These minutes are under review. Cancel the review on the Minutes tab first."
        : "These minutes are sealed and can't change.";
    return NextResponse.json({ error }, { status: 409 });
  } catch (err) {
    console.error("[tasdeeq] minutes lock check failed", { meetingId, err });
    return NextResponse.json(
      { error: "Could not check the minutes review" },
      { status: 500 },
    );
  }
}
