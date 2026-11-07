import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  NEED_ROLES,
  accessErrorResponse,
  requireProjectRole,
} from "@/lib/project-auth";
import { lookupProfiles, rpcErrorCode } from "@/lib/projects";
import { type TaskCommentRow, toTaskComment } from "@/lib/task-comments";
import { TASK_COMMENT_MAX } from "@/lib/tasks";
import type { TaskCommentResponse } from "@/lib/task-types";

type Params = { params: Promise<{ id: string }> };

const NOT_FOUND = "Task not found";

// Developer or higher, on any task in the project (AC-70r).
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = (await request.json().catch(() => null)) as {
    body?: unknown;
  } | null;
  const body = typeof raw?.body === "string" ? raw.body.trim() : "";
  if (body.length < 1 || body.length > TASK_COMMENT_MAX) {
    return NextResponse.json(
      { error: `A comment needs 1 to ${TASK_COMMENT_MAX} characters` },
      { status: 422 },
    );
  }

  try {
    const supabase = supabaseServer();
    const { data: head, error: headErr } = await supabase
      .from("tasks")
      .select("project_id")
      .eq("id", id)
      .maybeSingle();
    if (headErr) throw headErr;
    if (!head) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    await requireProjectRole(
      supabase,
      userId,
      (head as { project_id: string }).project_id,
      NEED_ROLES.content,
      NOT_FOUND,
    );

    const { data, error } = await supabase.rpc("add_task_comment", {
      p_task: id,
      p_actor: userId,
      p_body: body,
    });
    if (error) {
      if (rpcErrorCode(error) === "task_not_found") {
        return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
      }
      throw error;
    }
    const names = await lookupProfiles([userId]);
    const response: TaskCommentResponse = {
      comment: toTaskComment(data as TaskCommentRow, names),
    };
    return NextResponse.json(response, { status: 201 });
  } catch (err) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("[tasks] comment failed:", err);
    return NextResponse.json(
      { error: "Failed to add the comment" },
      { status: 500 },
    );
  }
}
