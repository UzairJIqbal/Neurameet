import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import type {
  MinutesDraft,
  MinutesResponse,
  TranscriptSource,
} from "@/lib/minutes-types";
import {
  fail,
  isMinutesManager,
  isRecordedParticipant,
  loadMeeting,
  loadReview,
} from "@/lib/minutes-review";
import { buildReviewState } from "@/lib/minutes-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tasdeeq, Verified Minutes (spec 0003). Before a review opens, only the owner
// reads the draft and a recorded participant sees "not open" (AC-4). Once a
// review exists, only its frozen attesters read it; anyone else gets 404.

const NOT_FOUND = "Meeting not found";

function isDraft(value: unknown): value is MinutesDraft {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { version?: unknown }).version === 1
  );
}

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return fail(401, "Unauthorized");

  const meetingId = new URL(request.url).searchParams.get("meetingId");
  if (!meetingId) return fail(400, "meetingId is required");

  try {
    const supabase = supabaseServer();

    const meeting = await loadMeeting(supabase, meetingId);
    if (!meeting) return fail(404, NOT_FOUND);

    const review = await loadReview(supabase, meetingId);
    if (review) {
      const state = await buildReviewState(supabase, meetingId, review, userId);
      return state
        ? NextResponse.json<MinutesResponse>(state)
        : fail(404, NOT_FOUND);
    }

    // The draft is the manager's view: the creator of a personal meeting, an
    // Owner or Admin of a project meeting.
    if (!(await isMinutesManager(supabase, userId, meeting))) {
      // A stranger gets the same 404 as a missing meeting.
      if (!(await isRecordedParticipant(supabase, meetingId, userId))) {
        return fail(404, NOT_FOUND);
      }
      return NextResponse.json<MinutesResponse>({ state: "not_open" });
    }

    const { data: insights, error: insightsErr } = await supabase
      .from("meeting_insights")
      .select("minutes_draft")
      .eq("meeting_id", meetingId)
      .maybeSingle();
    if (insightsErr) throw insightsErr;
    const draft: unknown = insights?.minutes_draft ?? null;
    if (!isDraft(draft)) {
      return NextResponse.json<MinutesResponse>({ state: "no_draft" });
    }

    const { data: transcript, error: transcriptErr } = await supabase
      .from("transcripts")
      .select("source")
      .eq("meeting_id", meetingId)
      .maybeSingle();
    if (transcriptErr) throw transcriptErr;
    const transcriptSource: TranscriptSource =
      transcript?.source === "recording" ? "recording" : "upload";

    return NextResponse.json<MinutesResponse>({
      state: "draft",
      draft,
      transcriptSource,
    });
  } catch (err) {
    console.error("[tasdeeq] minutes read failed", { meetingId, err });
    return fail(500, "Could not load the minutes");
  }
}
