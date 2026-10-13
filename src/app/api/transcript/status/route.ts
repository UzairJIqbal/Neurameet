import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getTranscriptState } from "@/lib/transcript-state";

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
  const { state, rawText, hasInsights } = await getTranscriptState(
    supabase,
    meetingId,
  );

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
  });
}
