import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { searchAcrossMeetings } from "@/agent/rag";
import { isUuid } from "@/lib/invitations";
import { searchProjectChunks } from "@/lib/project-assistant";
import {
  NEED_ROLES,
  accessErrorResponse,
  requireProjectRole,
} from "@/lib/project-auth";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: unknown = await request.json().catch(() => null);
    const query =
      body && typeof body === "object"
        ? (body as { query?: unknown }).query
        : undefined;
    const projectId =
      body && typeof body === "object"
        ? (body as { projectId?: unknown }).projectId
        : undefined;

    if (typeof query !== "string" || !query.trim()) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    if (projectId !== undefined) {
      if (typeof projectId !== "string" || !isUuid(projectId)) {
        return NextResponse.json(
          { error: "Invalid project id" },
          { status: 422 },
        );
      }
      const supabase = supabaseServer();
      await requireProjectRole(supabase, userId, projectId, NEED_ROLES.content);
      const results = await searchProjectChunks(
        supabase,
        projectId,
        query.trim(),
      );
      return NextResponse.json({ results });
    }

    const results = await searchAcrossMeetings(userId, query.trim());

    return NextResponse.json({ results });
  } catch (err) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    const message = err instanceof Error ? err.message : "Search failed";
    console.error("Cross-meeting search error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
