import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import { isProjectRole } from "@/lib/project-auth";
import {
  detailColumns,
  loadProjectCards,
  newProjectCard,
  parseProjectDetails,
  PROJECT_COLUMNS,
  type ProjectRow,
} from "@/lib/project-cards";
import { isTaskPrefix, parseProjectName } from "@/lib/projects";

type MembershipRow = {
  role: string;
  projects: ProjectRow | ProjectRow[] | null;
};

// Create a project; the caller becomes its Owner (one atomic rpc). The details
// follow in one update, so a failed update still leaves the project with its
// defaults, which the Owner can change on the Settings tab.
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const parsed = parseProjectName(body?.name);
  if (!parsed.ok)
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  if (!isTaskPrefix(body?.taskPrefix)) {
    return NextResponse.json(
      { error: "Prefix must be 2 to 5 capital letters" },
      { status: 422 },
    );
  }
  // status is not a create input: a new project is always Active.
  const details = parseProjectDetails({ ...body, status: undefined });
  if (!details.ok)
    return NextResponse.json({ error: details.error }, { status: 422 });

  try {
    const supabase = supabaseServer();
    const { data, error } = await supabase.rpc("create_project", {
      p_name: parsed.name,
      p_prefix: body?.taskPrefix,
      p_user: userId,
    });
    if (error || !data)
      throw error ?? new Error("create_project returned nothing");
    let row = data as ProjectRow;

    const columns = detailColumns(details.value);
    if (Object.keys(columns).length > 0) {
      const { error: detailError } = await supabase
        .from("projects")
        .update(columns)
        .eq("id", row.id);
      if (detailError) {
        console.error("[projects] details write failed:", detailError);
      } else {
        row = { ...row, ...columns } as ProjectRow;
      }
    }
    const project = await newProjectCard(row, userId);
    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    console.error("[projects] create failed:", err);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 },
    );
  }
}

// Your active projects as My Projects cards (AC-77d).
export async function GET() {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("project_members")
      .select(`role, projects(${PROJECT_COLUMNS})`)
      .eq("user_id", userId)
      .is("removed_at", null);
    if (error) throw error;

    const rows = ((data ?? []) as unknown as MembershipRow[]).flatMap((m) => {
      const p = Array.isArray(m.projects) ? m.projects[0] : m.projects;
      return p && isProjectRole(m.role) ? [{ project: p, role: m.role }] : [];
    });
    const projects = await loadProjectCards(supabase, rows);
    projects.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return NextResponse.json({ projects });
  } catch (err) {
    console.error("[projects] list failed:", err);
    return NextResponse.json(
      { error: "Failed to load projects" },
      { status: 500 },
    );
  }
}
