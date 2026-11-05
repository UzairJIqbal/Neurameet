import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  NEED_ROLES,
  accessErrorResponse,
  requireProjectRole,
} from "@/lib/project-auth";
import { rpcErrorCode } from "@/lib/projects";

type Params = { params: Promise<{ id: string }> };

const NOT_FOUND = { error: "Meeting not found" };
const CANT_LEAVE = { error: "Meetings can't leave a project" };
const MINUTES_REVIEW = { error: "Finish or cancel the minutes review first" };

// Meeting creator with Developer or higher in the target: move a personal
// meeting into a project; its follow ups become proposals (W3 AC-24, AC-25).
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    projectId?: unknown;
  } | null;
  const projectId = body?.projectId;
  if (typeof projectId !== "string" || !projectId) {
    return NextResponse.json({ error: "Pick a project" }, { status: 422 });
  }

  try {
    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("meetings")
      .select("id, user_id, project_id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    const meeting = data as {
      id: string;
      user_id: string | null;
      project_id: string | null;
    } | null;
    if (!meeting || meeting.user_id !== userId) {
      return NextResponse.json(NOT_FOUND, { status: 404 });
    }
    if (meeting.project_id)
      return NextResponse.json(CANT_LEAVE, { status: 409 });

    await requireProjectRole(supabase, userId, projectId, NEED_ROLES.content);

    const { error: rpcErr } = await supabase.rpc("move_meeting_to_project", {
      p_meeting: id,
      p_project: projectId,
      p_actor: userId,
    });
    if (rpcErr) {
      const code = rpcErrorCode(rpcErr);
      if (code === "minutes_review")
        return NextResponse.json(MINUTES_REVIEW, { status: 409 });
      if (code === "not_movable")
        return NextResponse.json(CANT_LEAVE, { status: 409 });
      throw rpcErr;
    }
    return NextResponse.json({ meetingId: id, projectId });
  } catch (err) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("[meetings] move to project failed:", err);
    return NextResponse.json(
      { error: "Failed to move the meeting" },
      { status: 500 },
    );
  }
}
