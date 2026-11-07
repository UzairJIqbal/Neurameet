import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import type { SupabaseClient } from "@supabase/supabase-js";
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
import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_CATEGORY_KINDS,
  type ActivityCategory,
  type ActivityCategoryCounts,
  type ActivityResponse,
} from "@/lib/proof-types";
import type { ProjectRole } from "@/lib/project-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const COMMENTED = "task.commented";
const ACTOR_ID = /^[A-Za-z0-9_-]{1,100}$/;

const isCategory = (value: string): value is ActivityCategory =>
  (ACTIVITY_CATEGORIES as string[]).includes(value);

/** Comments are hidden from a Viewer, so the fact of one is too (spec line 304). */
const kindsFor = (category: ActivityCategory, role: ProjectRole): string[] =>
  ACTIVITY_CATEGORY_KINDS[category].filter(
    (kind) => role !== "viewer" || kind !== COMMENTED,
  );

async function loadCategoryCounts(
  supabase: SupabaseClient,
  projectId: string,
  role: ProjectRole,
  actorId: string | null,
): Promise<ActivityCategoryCounts> {
  const countOf = async (kinds: string[] | null) => {
    let query = supabase
      .from("project_activity")
      .select("row_id", { count: "exact", head: true })
      .eq("project_id", projectId);
    if (actorId) query = query.eq("actor_id", actorId);
    if (kinds) query = query.in("kind", kinds);
    else if (role === "viewer") query = query.neq("kind", COMMENTED);
    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
  };
  const [all, github, tasks, meetings, members] = await Promise.all([
    countOf(null),
    ...ACTIVITY_CATEGORIES.map((category) => countOf(kindsFor(category, role))),
  ]);
  return { all, github, tasks, meetings, members };
}

// Member: the project's timeline, newest first (AC-61, AC-70m).
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const search = new URL(request.url).searchParams;
  const rawCategory = search.get("category");
  const actorId = search.get("actorId");
  if (rawCategory && !isCategory(rawCategory)) {
    return NextResponse.json({ error: "Unknown category" }, { status: 422 });
  }
  const category = rawCategory && isCategory(rawCategory) ? rawCategory : null;
  if (actorId && !ACTOR_ID.test(actorId)) {
    return NextResponse.json({ error: "Unknown person" }, { status: 422 });
  }
  const rawBefore = search.get("before");
  const before = rawBefore ? parseCursor(rawBefore, "activity") : null;
  if (rawBefore && !before) {
    return NextResponse.json({ error: "Invalid cursor" }, { status: 422 });
  }

  try {
    const supabase = supabaseServer();
    const { role } = await requireProjectRole(
      supabase,
      userId,
      id,
      NEED_ROLES.read,
    );

    let query = supabase
      .from("project_activity")
      .select(
        "row_id, occurred_at, actor_id, kind, subject_type, subject_id, detail",
      )
      .eq("project_id", id);
    if (actorId) query = query.eq("actor_id", actorId);
    if (category) query = query.in("kind", kindsFor(category, role));
    else if (role === "viewer") query = query.neq("kind", COMMENTED);
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
      ...(before
        ? {}
        : {
            categoryCounts: await loadCategoryCounts(
              supabase,
              id,
              role,
              actorId,
            ),
          }),
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
