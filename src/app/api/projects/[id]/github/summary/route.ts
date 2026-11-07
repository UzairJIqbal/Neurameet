import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  NEED_ROLES,
  accessErrorResponse,
  requireProjectRole,
} from "@/lib/project-auth";
import { loadGitHubSummary } from "@/lib/github-summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Developer or higher: linked repos, last sync, and PRs linked to tasks (AC-70i).
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const supabase = supabaseServer();
    await requireProjectRole(supabase, userId, id, NEED_ROLES.content);
    return NextResponse.json(await loadGitHubSummary(supabase, id));
  } catch (err) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("[github] summary failed:", err);
    return NextResponse.json(
      { error: "Failed to load the GitHub summary" },
      { status: 500 },
    );
  }
}
