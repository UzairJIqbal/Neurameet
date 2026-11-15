import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  getTranscriptState,
  isNoRecordingFinal,
  isPendingStale,
} from "@/lib/transcript-state";
import { deriveRecapSteps } from "@/lib/pipeline-steps";
import { accessErrorResponse, checkMeetingAccess } from "@/lib/project-auth";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Fast, read-only status probe used by client polling + the global owner
// poller. Returns only booleans/enum, never the raw transcript text, so it is
// safe to expose to any signed-in participant.
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const meetingId = searchParams.get("meetingId");
  if (!meetingId) {
    return NextResponse.json(
      { error: "meetingId is required" },
      { status: 400 },
    );
  }

  const supabase = supabaseServer();
  let endedAt: string | null = null;

  // Project meeting: any member may read the status (spec 0004, read); a non
  // member gets 404. Personal meetings stay open to any signed-in caller, as
  // before (the probe never returns transcript text).
  if (UUID_RE.test(meetingId)) {
    const { data: meeting, error: meetingErr } = await supabase
      .from("meetings")
      .select("id, user_id, project_id, ended_at")
      .eq("id", meetingId)
      .maybeSingle();
    if (meetingErr) {
      console.error("[transcript/status] meeting lookup failed:", meetingErr);
      return NextResponse.json(
        { error: "Failed to load transcript status" },
        { status: 500 },
      );
    }
    if (meeting) {
      endedAt = (meeting.ended_at as string | null) ?? null;
      try {
        await checkMeetingAccess(supabase, userId, meeting, "read", {
          personalFallback: async () => true,
        });
      } catch (err) {
        const denied = accessErrorResponse(err);
        if (denied) return denied;
        throw err;
      }
    }
  }

  const { state, rawText, hasInsights, updatedAt, pipeline } =
    await getTranscriptState(supabase, meetingId);

  // `ready` from a transcript-text standpoint: there is text and we are not in
  // the middle of (re)generating it. Legacy rows may carry text with a stale
  // `not_started` state, so we infer readiness from the text too.
  const rawTextAvailable =
    rawText.trim().length > 0 && state !== "pending" && state !== "failed";

  return NextResponse.json({
    meetingId,
    state,
    rawTextAvailable,
    hasInsights,
    // Owner-facing readiness: text + AI insights both present.
    ready: rawTextAvailable && hasInsights,
    // The after meeting step list (spec 0005). Enum values only.
    steps: deriveRecapSteps({
      state,
      rawTextAvailable,
      hasInsights,
      pendingStale: isPendingStale(updatedAt),
      noRecordingFinal: isNoRecordingFinal(endedAt),
      pipeline,
    }),
  });
}
