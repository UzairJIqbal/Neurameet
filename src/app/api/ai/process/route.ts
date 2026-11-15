import { after, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import { accessErrorResponse, checkMeetingAccess } from "@/lib/project-auth";
import {
  maybeRunLedgerMatch,
  PROCESS_BUSY,
  processMeeting,
} from "@/agent/meeting-pipeline";

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { meetingId, emailNotifications } = body as {
      meetingId?: string;
      emailNotifications?: boolean;
    };

    if (!meetingId) {
      return NextResponse.json(
        { error: "Meeting ID is required" },
        { status: 400 },
      );
    }

    const supabase = supabaseServer();

    // Access check: the creator of a personal meeting, or an Owner or Admin of
    // a project meeting ("manage" need), may run extraction on it.
    const { data: owned, error: ownErr } = await supabase
      .from("meetings")
      .select("id, user_id, project_id, title, started_at, created_at")
      .eq("id", meetingId)
      .maybeSingle();

    if (ownErr || !owned) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    try {
      await checkMeetingAccess(supabase, userId, owned, "manage");
    } catch (accessErr) {
      const denied = accessErrorResponse(accessErr);
      if (denied) return denied;
      throw accessErr;
    }

    const outcome = await processMeeting(supabase, {
      meeting: owned,
      actorUserId: userId,
      emailNotifications: emailNotifications === true,
      source: "page",
    });

    if (outcome.status === "busy") {
      return NextResponse.json({ error: PROCESS_BUSY }, { status: 409 });
    }
    if (outcome.status === "error") {
      return NextResponse.json(
        { error: outcome.error },
        { status: outcome.httpStatus },
      );
    }

    const { notify } = outcome;
    after(async () => {
      if (notify) await notify();
      await maybeRunLedgerMatch(supabase, meetingId, "page");
    });

    return NextResponse.json({
      success: true,
      insights: outcome.insights,
      actionItemCount: outcome.actionItemCount,
      emailSent: outcome.emailSent,
      ...(outcome.proposalCount !== undefined
        ? { proposalCount: outcome.proposalCount }
        : {}),
    });
  } catch (err) {
    console.error("AI processing error:", err);
    return NextResponse.json(
      { error: "AI is busy right now, please try again in a minute" },
      { status: 500 },
    );
  }
}
