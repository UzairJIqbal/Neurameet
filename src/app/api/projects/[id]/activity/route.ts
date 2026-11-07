import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  NEED_ROLES,
  accessErrorResponse,
  requireProjectRole,
} from "@/lib/project-auth";
import {
  PAGE_SIZE,
  cursorFilter,
  pageOf,
  parseCursor,
} from "@/lib/project-select";
import {
  loadActivityLookups,
  toActivityRow,
  type ActivitySourceRow,
} from "@/lib/project-activity";
import type { ActivityResponse } from "@/lib/proof-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Member: the project's timeline, newest first (AC-61).
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rawBefore = new URL(request.url).searchParams.get("before");
  const before = rawBefore ? parseCursor(rawBefore, "activity") : null;
  if (rawBefore && !before) {
    return NextResponse.json({ error: "Invalid cursor" }, { status: 422 });
  }

  try {
    const supabase = supabaseServer();
    await requireProjectRole(supabase, userId, id, NEED_ROLES.read);

    let query = supabase
      .from("project_activity")
      .select(
        "row_id, occurred_at, actor_id, kind, subject_type, subject_id, detail",
      )
      .eq("project_id", id);
    if (before) query = query.or(cursorFilter("occurred_at", "row_id", before));

    const { data, error } = await query
      .order("occurred_at", { ascending: false })
      .order("row_id", { ascending: false })
      .limit(PAGE_SIZE + 1);
    if (error) throw error;

    const { page, next } = pageOf(
      (data ?? []) as ActivitySourceRow[],
      (row) => `${row.occurred_at}|${row.row_id}`,
    );
    const lookups = await loadActivityLookups(supabase, id, page);
    return NextResponse.json({
      rows: page.map((row) => toActivityRow(row, lookups)),
      nextBefore: next,
    } satisfies ActivityResponse);
  } catch (err) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("[project-activity] read failed:", err);
    return NextResponse.json(
      { error: "Failed to load activity" },
      { status: 500 },
    );
  }
}
