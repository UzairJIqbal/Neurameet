import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  NEED_ROLES,
  accessErrorResponse,
  requireProjectRole,
} from "@/lib/project-auth";
import { rpcErrorCode } from "@/lib/projects";

// Owner only: hand ownership to an active Admin; you become an Admin.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const supabase = supabaseServer();
    await requireProjectRole(supabase, userId, id, NEED_ROLES.owner);

    const body = (await request.json().catch(() => null)) as {
      userId?: unknown;
    } | null;
    const target = body?.userId;
    if (typeof target !== "string" || target.length === 0) {
      return NextResponse.json({ error: "Choose an Admin" }, { status: 422 });
    }
    if (target === userId) {
      return NextResponse.json(
        { error: "You already own this project" },
        { status: 409 },
      );
    }

    const { error } = await supabase.rpc("transfer_project_ownership", {
      p_project: id,
      p_from: userId,
      p_to: target,
    });
    if (error) {
      const code = rpcErrorCode(error);
      if (code === "target_not_admin") {
        return NextResponse.json(
          { error: "Ownership can only go to an active Admin" },
          { status: 409 },
        );
      }
      if (code === "not_owner") {
        return NextResponse.json({ error: "Not authorized" }, { status: 403 });
      }
      throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("[projects] transfer failed:", err);
    return NextResponse.json(
      { error: "Failed to transfer ownership" },
      { status: 500 },
    );
  }
}
