import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  NEED_ROLES,
  accessErrorResponse,
  getProjectRole,
  requireProjectRole,
} from "@/lib/project-auth";
import { isAssignableRole, rpcErrorCode } from "@/lib/projects";

type Params = { params: Promise<{ id: string; userId: string }> };

const MEMBER_NOT_FOUND = { error: "Member not found" };
const TRANSFER_FIRST = { error: "Transfer ownership first" };

// Owner or Admin: change someone else's role. Only the Owner grants or removes Admin.
export async function PATCH(request: Request, { params }: Params) {
  const { id, userId: targetId } = await params;
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const supabase = supabaseServer();
    const { role: myRole } = await requireProjectRole(
      supabase,
      userId,
      id,
      NEED_ROLES.manage,
    );

    const body = (await request.json().catch(() => null)) as {
      role?: unknown;
    } | null;
    const nextRole = body?.role;
    if (!isAssignableRole(nextRole)) {
      return NextResponse.json(
        { error: "Role must be admin, developer, or viewer" },
        { status: 422 },
      );
    }
    if (targetId === userId) {
      return NextResponse.json(
        { error: "You can't change your own role" },
        { status: 409 },
      );
    }

    const current = await getProjectRole(supabase, targetId, id);
    if (!current) return NextResponse.json(MEMBER_NOT_FOUND, { status: 404 });
    if (current === "owner")
      return NextResponse.json(TRANSFER_FIRST, { status: 409 });
    if (myRole !== "owner" && (current === "admin" || nextRole === "admin")) {
      return NextResponse.json(
        { error: "Only the owner can change Admins" },
        { status: 403 },
      );
    }
    if (current === nextRole)
      return NextResponse.json({ ok: true, role: nextRole });

    const { error } = await supabase
      .from("project_members")
      .update({ role: nextRole })
      .eq("project_id", id)
      .eq("user_id", targetId)
      .is("removed_at", null);
    if (error) throw error;

    const { error: auditError } = await supabase.from("audit_log").insert({
      project_id: id,
      actor_id: userId,
      action: "member.role_changed",
      target_type: "member",
      target_id: targetId,
      detail: { from: current, to: nextRole },
    });
    if (auditError) console.error("[projects] audit write failed:", auditError);

    return NextResponse.json({ ok: true, role: nextRole });
  } catch (err) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("[projects] role change failed:", err);
    return NextResponse.json(
      { error: "Failed to change role" },
      { status: 500 },
    );
  }
}

// Leave the project yourself, or (Owner or Admin) remove someone.
export async function DELETE(_request: Request, { params }: Params) {
  const { id, userId: targetId } = await params;
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const supabase = supabaseServer();
    const leaving = targetId === userId;
    const { role: myRole } = await requireProjectRole(
      supabase,
      userId,
      id,
      leaving ? NEED_ROLES.read : NEED_ROLES.manage,
    );

    const targetRole = leaving
      ? myRole
      : await getProjectRole(supabase, targetId, id);
    if (!targetRole)
      return NextResponse.json(MEMBER_NOT_FOUND, { status: 404 });
    if (targetRole === "owner")
      return NextResponse.json(TRANSFER_FIRST, { status: 409 });

    const { error } = await supabase.rpc("remove_project_member", {
      p_project: id,
      p_user: targetId,
      p_actor: userId,
      p_actor_role: myRole,
    });
    if (error) {
      if (rpcErrorCode(error) === "not_removable") {
        return NextResponse.json({ error: "Not authorized" }, { status: 403 });
      }
      throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("[projects] remove member failed:", err);
    return NextResponse.json(
      { error: "Failed to remove member" },
      { status: 500 },
    );
  }
}
