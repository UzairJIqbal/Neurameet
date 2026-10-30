import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import { LedgerJudgeError, runLedgerMatch } from "@/agent/ledger-match";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let meetingId: string | undefined;
  try {
    const body = (await request.json()) as { meetingId?: unknown };
    meetingId = typeof body.meetingId === "string" ? body.meetingId : undefined;
  } catch {
    meetingId = undefined;
  }
  if (!meetingId) {
    return NextResponse.json(
      { error: "meetingId is required" },
      { status: 400 },
    );
  }

  try {
    const supabase = supabaseServer();

    const { data: meeting, error: meetingErr } = await supabase
      .from("meetings")
      .select("id")
      .eq("id", meetingId)
      .eq("user_id", userId)
      .maybeSingle();
    if (meetingErr) throw meetingErr;
    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    const { data: transcript, error: transcriptErr } = await supabase
      .from("transcripts")
      .select("raw_text")
      .eq("meeting_id", meetingId)
      .maybeSingle();
    if (transcriptErr) throw transcriptErr;
    const rawText = (transcript as { raw_text: string | null } | null)
      ?.raw_text;
    if (!rawText || !rawText.trim()) {
      return NextResponse.json(
        { error: "This meeting has no transcript yet" },
        { status: 409 },
      );
    }

    // Candidates are ranked against this meeting's chunks, so embed must run first.
    const { data: chunks, error: chunksErr } = await supabase
      .from("meeting_chunks")
      .select("id")
      .eq("meeting_id", meetingId)
      .limit(1);
    if (chunksErr) throw chunksErr;
    if (!chunks || chunks.length === 0) {
      return NextResponse.json(
        { error: "This meeting is not indexed for chat yet" },
        { status: 409 },
      );
    }

    const result = await runLedgerMatch(supabase, {
      meetingId,
      userId,
      rawText,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof LedgerJudgeError) {
      console.error("[ledger] judge failed", { meetingId, err: err.cause });
      return NextResponse.json(
        { error: "Promise matching is unavailable right now" },
        { status: 502 },
      );
    }
    console.error("[ledger] match failed", { meetingId, err });
    return NextResponse.json(
      { error: "Failed to match promises" },
      { status: 500 },
    );
  }
}
