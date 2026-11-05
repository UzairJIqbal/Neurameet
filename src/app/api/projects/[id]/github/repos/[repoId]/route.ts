import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  NEED_ROLES,
  accessErrorResponse,
  requireProjectRole,
} from "@/lib/project-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; repoId: string }> };

const NOT_LINKED = { error: "That repository is not linked to this project" };

// Owner only: unlink. Old task_links stay, so the history survives (AC-47).
export async function DELETE(_request: Request, { params }: Params) {
  const { id, repoId } = await params;
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Number(repoId);
  if (!Number.isSafeInteger(parsed)) {
    return NextResponse.json(NOT_LINKED, { status: 404 });
  }

  try {
    const supabase = supabaseServer();
    await requireProjectRole(supabase, userId, id, NEED_ROLES.owner);

    const { data, error } = await supabase
      .from("github_repos")
      .delete()
      .eq("repo_id", parsed)
      .eq("project_id", id)
      .select("repo_id");
    if (error) throw error;
    if ((data ?? []).length === 0) {
      return NextResponse.json(NOT_LINKED, { status: 404 });
    }

    const { error: auditError } = await supabase.from("audit_log").insert({
      project_id: id,
      actor_id: userId,
      action: "repo.unlinked",
      target_type: "github_repo",
      target_id: String(parsed),
      detail: { repoId: parsed },
    });
    if (auditError) console.error("[github] audit failed:", auditError);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("[github] repo unlink failed:", err);
    return NextResponse.json(
      { error: "Failed to unlink the repository" },
      { status: 500 },
    );
  }
}
