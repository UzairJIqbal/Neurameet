import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import { isProjectRole } from "@/lib/project-auth";
import { isTaskPrefix, parseProjectName } from "@/lib/projects";
import type { ProjectSummary } from "@/lib/project-types";

type ProjectRow = {
  id: string;
  name: string;
  task_prefix: string;
  created_at: string;
};
type MembershipRow = {
  role: string;
  projects: ProjectRow | ProjectRow[] | null;
};

// Create a project; the caller becomes its Owner (one atomic rpc).
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
    taskPrefix?: unknown;
  } | null;
  const parsed = parseProjectName(body?.name);
  if (!parsed.ok)
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  if (!isTaskPrefix(body?.taskPrefix)) {
    return NextResponse.json(
      { error: "Prefix must be 2 to 5 capital letters" },
      { status: 422 },
    );
  }

  try {
    const { data, error } = await supabaseServer().rpc("create_project", {
      p_name: parsed.name,
      p_prefix: body.taskPrefix,
      p_user: userId,
    });
    if (error || !data)
      throw error ?? new Error("create_project returned nothing");
    const row = data as ProjectRow;
    const project: ProjectSummary = {
      id: row.id,
      name: row.name,
      taskPrefix: row.task_prefix,
      role: "owner",
      memberCount: 1,
      createdAt: row.created_at,
    };
    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    console.error("[projects] create failed:", err);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 },
    );
  }
}

// Your active projects with your role and the active member count.
export async function GET() {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("project_members")
      .select("role, projects(id, name, task_prefix, created_at)")
      .eq("user_id", userId)
      .is("removed_at", null);
    if (error) throw error;

    const rows = ((data ?? []) as MembershipRow[]).flatMap((m) => {
      const p = Array.isArray(m.projects) ? m.projects[0] : m.projects;
      return p && isProjectRole(m.role) ? [{ project: p, role: m.role }] : [];
    });
    const ids = rows.map((r) => r.project.id);

    const counts = new Map<string, number>();
    if (ids.length > 0) {
      const { data: members, error: countError } = await supabase
        .from("project_members")
        .select("project_id")
        .in("project_id", ids)
        .is("removed_at", null);
      if (countError) throw countError;
      for (const m of (members ?? []) as { project_id: string }[]) {
        counts.set(m.project_id, (counts.get(m.project_id) ?? 0) + 1);
      }
    }

    const projects: ProjectSummary[] = rows
      .map(({ project, role }) => ({
        id: project.id,
        name: project.name,
        taskPrefix: project.task_prefix,
        role,
        memberCount: counts.get(project.id) ?? 1,
        createdAt: project.created_at,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return NextResponse.json({ projects });
  } catch (err) {
    console.error("[projects] list failed:", err);
    return NextResponse.json(
      { error: "Failed to load projects" },
      { status: 500 },
    );
  }
}
