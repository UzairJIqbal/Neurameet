import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  NEED_ROLES,
  accessErrorResponse,
  requireProjectRole,
} from "@/lib/project-auth";
import { isUuid } from "@/lib/invitations";
import { isManagerRole } from "@/lib/task-rules";

type Params = { params: Promise<{ id: string; commentId: string }> };

const NOT_FOUND = { error: "Comment not found" };

// The author or an Owner or Admin (AC-70r). The commented event stays, and it
// never held the text.
export async function DELETE(_request: Request, { params }: Params) {
  const { id, commentId } = await params;
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(commentId)) return NextResponse.json(NOT_FOUND, { status: 404 });

  try {
    const supabase = supabaseServer();
    const { data, error: readErr } = await supabase
      .from("task_comments")
      .select("id, author_id, project_id")
      .eq("id", commentId)
      .eq("task_id", id)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!data) return NextResponse.json(NOT_FOUND, { status: 404 });
    const comment = data as { author_id: string; project_id: string };

    // A Viewer can't see comments, so this answers them the same as anyone
    // the comment isn't theirs to remove.
    const { role } = await requireProjectRole(
      supabase,
      userId,
      comment.project_id,
      NEED_ROLES.read,
      NOT_FOUND.error,
    );
    const mine = comment.author_id === userId && role !== "viewer";
    if (!mine && !isManagerRole(role)) {
      return NextResponse.json(
        { error: "Only the author or an Owner or Admin can delete a comment" },
        { status: 403 },
      );
    }

    const { error } = await supabase
      .from("task_comments")
      .delete()
      .eq("id", commentId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("[tasks] comment delete failed:", err);
    return NextResponse.json(
      { error: "Failed to delete the comment" },
      { status: 500 },
    );
  }
}
