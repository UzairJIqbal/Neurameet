import { NextResponse } from "next/server";
import { SYNC_AUDIT_ACTION } from "@/lib/project-cards";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  NEED_ROLES,
  accessErrorResponse,
  requireProjectRole,
} from "@/lib/project-auth";
import { syncProject } from "@/lib/github-rules";
import type { GitHubSyncResult } from "@/lib/github-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

const SYNC_COOLDOWN_MS = 60_000;

// Owner or Admin: read PR state again and apply the same rules as the webhook (AC-54).
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const supabase = supabaseServer();
    await requireProjectRole(supabase, userId, id, NEED_ROLES.manage);

    const { data: last, error: lastError } = await supabase
      .from("audit_log")
      .select("created_at")
      .eq("project_id", id)
      .eq("action", SYNC_AUDIT_ACTION)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastError) throw lastError;
    const lastAt = (last as { created_at: string } | null)?.created_at;
    if (lastAt && Date.now() - new Date(lastAt).getTime() < SYNC_COOLDOWN_MS) {
      return NextResponse.json(
        { error: "GitHub was synced under a minute ago. Try again shortly." },
        { status: 429 },
      );
    }

    // Written first, so a run that fails partway still counts against the limit.
    const { error: auditError } = await supabase.from("audit_log").insert({
      project_id: id,
      actor_id: userId,
      action: SYNC_AUDIT_ACTION,
      target_type: "project",
      target_id: id,
    });
    if (auditError) throw auditError;

    const result: GitHubSyncResult = await syncProject(supabase, id);
    return NextResponse.json(result);
  } catch (err) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("[github] sync failed:", err);
    return NextResponse.json(
      { error: "Failed to sync with GitHub" },
      { status: 500 },
    );
  }
}
