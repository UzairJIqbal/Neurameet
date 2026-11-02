import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  NEED_ROLES,
  accessErrorResponse,
  requireProjectRole,
} from "@/lib/project-auth";
import { rpcErrorCode } from "@/lib/projects";
import { isUuid } from "@/lib/invitations";

type Params = { params: Promise<{ id: string; requestId: string }> };

type DecidedRow = {
  id: string;
  display_name: string;
  email: string | null;
  role: string;
  status: string;
  decided_at: string | null;
  created_at: string;
};

const NOT_FOUND = { error: "Join request not found" };

// Owner or Admin: approve or deny once; a second decision is 409 (AC-21).
export async function POST(request: Request, { params }: Params) {
  const { id, requestId } = await params;
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const supabase = supabaseServer();
    await requireProjectRole(supabase, userId, id, NEED_ROLES.manage);

    const body = (await request.json().catch(() => null)) as {
      decision?: unknown;
    } | null;
    const decision = body?.decision;
    if (decision !== "approve" && decision !== "deny") {
      return NextResponse.json(
        { error: "Decision must be approve or deny" },
        { status: 422 },
      );
    }
    if (!isUuid(requestId))
      return NextResponse.json(NOT_FOUND, { status: 404 });

    const { data, error } = await supabase.rpc("decide_join_request", {
      p_request: requestId,
      p_project: id,
      p_actor: userId,
      p_decision: decision,
    });
    if (error) {
      const code = rpcErrorCode(error);
      if (code === "not_found")
        return NextResponse.json(NOT_FOUND, { status: 404 });
      if (code === "already_decided") {
        return NextResponse.json(
          { error: "This request was already decided" },
          { status: 409 },
        );
      }
      throw error;
    }

    const row = data as DecidedRow;
    return NextResponse.json({
      request: {
        id: row.id,
        displayName: row.display_name,
        email: row.email,
        role: row.role,
        status: row.status,
        decidedAt: row.decided_at,
        createdAt: row.created_at,
      },
    });
  } catch (err) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("[join-requests] decide failed:", err);
    return NextResponse.json(
      { error: "Failed to decide join request" },
      { status: 500 },
    );
  }
}
