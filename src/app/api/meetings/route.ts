/* eslint-disable prettier/prettier */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase-server";
import { MeetingListItem } from "@/lib/meeting-types";
import { isProjectRole, type ProjectRole } from "@/lib/project-auth";

interface MeetingRow {
  id: string;
  title: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  stream_call_id: string;
  project_id: string | null;
  meeting_insights: { category: string | null; summary: string | null }[] | null;
}

const MEETING_COLUMNS =
  "id, title, status, started_at, ended_at, created_at, stream_call_id, project_id, meeting_insights(category, summary)";

// The caller's active project memberships (removed members are excluded, so a
// removed member stops seeing that project's meetings on the next request).
async function loadActiveRoles(
  supabase: SupabaseClient,
  userId: string,
): Promise<Map<string, ProjectRole>> {
  const { data, error } = await supabase
    .from("project_members")
    .select("project_id, role")
    .eq("user_id", userId)
    .is("removed_at", null);
  if (error) throw error;
  const roles = new Map<string, ProjectRole>();
  for (const row of (data ?? []) as { project_id: string; role: unknown }[]) {
    if (isProjectRole(row.role)) roles.set(row.project_id, row.role);
  }
  return roles;
}

function toListItem(
  row: MeetingRow,
  roles: Map<string, ProjectRole>,
): MeetingListItem {
  const insights = Array.isArray(row.meeting_insights) ? row.meeting_insights : [];
  const projectId = row.project_id ?? null;
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
    category: insights[0]?.category ?? null,
    hasInsights: insights.length > 0,
    streamCallId: row.stream_call_id,
    projectId,
    role: projectId ? (roles.get(projectId) ?? null) : null,
  };
}

// Personal meetings (project_id null) the caller created, plus the meetings of
// every project the caller is an active member of. `?projectId=` narrows the
// list to one project (404 when the caller is not an active member).
export async function GET(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      { error: "Unauthorized", meetings: [] },
      { status: 401 },
    );
  }

  try {
    const supabase = supabaseServer();
    const onlyProject = new URL(request.url).searchParams.get("projectId");

    const roles = await loadActiveRoles(supabase, userId);
    if (onlyProject && !roles.has(onlyProject)) {
      return NextResponse.json(
        { error: "Not found", meetings: [] },
        { status: 404 },
      );
    }
    const projectIds = onlyProject ? [onlyProject] : [...roles.keys()];

    const [personal, project] = await Promise.all([
      onlyProject
        ? Promise.resolve({ data: [] as MeetingRow[], error: null })
        : supabase
            .from("meetings")
            .select(MEETING_COLUMNS)
            .eq("user_id", userId)
            .is("project_id", null)
            .order("created_at", { ascending: false }),
      projectIds.length > 0
        ? supabase
            .from("meetings")
            .select(MEETING_COLUMNS)
            .in("project_id", projectIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as MeetingRow[], error: null }),
    ]);

    const error = personal.error ?? project.error;
    if (error) {
      console.error("Failed to load meetings:", error);
      return NextResponse.json(
        { error: "Failed to load meetings", meetings: [] },
        { status: 500 },
      );
    }

    const byId = new Map<string, MeetingRow>();
    for (const row of [
      ...((personal.data ?? []) as MeetingRow[]),
      ...((project.data ?? []) as MeetingRow[]),
    ]) {
      byId.set(row.id, row);
    }
    const meetings = [...byId.values()]
      .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
      .map((row) => toListItem(row, roles));

    return NextResponse.json({ meetings });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load meetings";
    console.error("Meetings list error:", err);
    return NextResponse.json(
      { error: message, meetings: [] },
      { status: 500 },
    );
  }
}
