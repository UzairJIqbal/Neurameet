import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isProjectRole } from "@/lib/project-auth";
import { pktToday, TASK_SELECT_VIEWER, toTask } from "@/lib/project-select";
import type { TaskRow } from "@/lib/project-select";
import type { ProjectRole } from "@/lib/project-types";
import { supabaseServer } from "@/lib/supabase-server";
import { decorateBoardTasks } from "@/lib/task-board";
import type { MyTask, Task } from "@/lib/task-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Db = ReturnType<typeof supabaseServer>;

const OPEN_LIMIT = 200;
const COMPLETED_LIMIT = 50;

type ProjectInfo = { role: ProjectRole; name: string; prefix: string };

// Your active projects only: a removed membership never reaches the task query.
async function readMyProjects(
  supabase: Db,
  userId: string,
): Promise<Map<string, ProjectInfo>> {
  const { data: members, error } = await supabase
    .from("project_members")
    .select("project_id, role")
    .eq("user_id", userId)
    .is("removed_at", null);
  if (error) throw error;
  const roles = new Map<string, ProjectRole>();
  for (const row of (members ?? []) as Array<{
    project_id: string;
    role: string;
  }>) {
    if (isProjectRole(row.role)) roles.set(row.project_id, row.role);
  }
  const projects = new Map<string, ProjectInfo>();
  if (roles.size === 0) return projects;
  const { data, error: projectError } = await supabase
    .from("projects")
    .select("id, name, task_prefix")
    .in("id", [...roles.keys()]);
  if (projectError) throw projectError;
  for (const row of (data ?? []) as Array<{
    id: string;
    name: string;
    task_prefix: string;
  }>) {
    const role = roles.get(row.id);
    if (role) {
      projects.set(row.id, { role, name: row.name, prefix: row.task_prefix });
    }
  }
  return projects;
}

async function readMyTaskRows(
  supabase: Db,
  userId: string,
  projectIds: string[],
): Promise<{ rows: TaskRow[]; truncated: boolean }> {
  const [open, completed] = await Promise.all([
    supabase
      .from("tasks")
      .select(TASK_SELECT_VIEWER, { count: "exact" })
      .eq("assignee_id", userId)
      .in("project_id", projectIds)
      .neq("status", "completed")
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .limit(OPEN_LIMIT),
    supabase
      .from("tasks")
      .select(TASK_SELECT_VIEWER)
      .eq("assignee_id", userId)
      .in("project_id", projectIds)
      .eq("status", "completed")
      .order("completed_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .limit(COMPLETED_LIMIT),
  ]);
  if (open.error) throw open.error;
  if (completed.error) throw completed.error;
  const openRows = (open.data ?? []) as unknown as TaskRow[];
  return {
    rows: [...openRows, ...((completed.data ?? []) as unknown as TaskRow[])],
    truncated: (open.count ?? openRows.length) > OPEN_LIMIT,
  };
}

// The base select holds no quote, so no role gets one here. PR refs follow the
// Viewer rule project by project.
async function toMyTasks(
  supabase: Db,
  rows: TaskRow[],
  projects: Map<string, ProjectInfo>,
): Promise<MyTask[]> {
  const hidden: Task[] = [];
  const shown: Task[] = [];
  for (const row of rows) {
    const project = projects.get(row.project_id);
    if (!project) continue;
    const task = toTask(row, project.prefix, "viewer", new Map());
    (project.role === "viewer" ? hidden : shown).push(task);
  }
  const [hiddenTasks, shownTasks] = await Promise.all([
    decorateBoardTasks(supabase, hidden, "viewer"),
    decorateBoardTasks(supabase, shown, "developer"),
  ]);
  const byId = new Map(
    [...hiddenTasks, ...shownTasks].map((task) => [task.id, task]),
  );
  return rows.flatMap((row) => {
    const task = byId.get(row.id);
    const project = projects.get(row.project_id);
    if (!task || !project) return [];
    return [{ ...task, projectId: row.project_id, projectName: project.name }];
  });
}

/** Your assigned tasks across your active projects (AC-77). */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const supabase = supabaseServer();
    const today = pktToday();
    const projects = await readMyProjects(supabase, userId);
    if (projects.size === 0) {
      return NextResponse.json({ today, tasks: [], truncated: false });
    }
    const { rows, truncated } = await readMyTaskRows(supabase, userId, [
      ...projects.keys(),
    ]);
    const tasks = await toMyTasks(supabase, rows, projects);
    return NextResponse.json({ today, tasks, truncated });
  } catch (err) {
    console.error("[my-tasks] read failed:", err);
    return NextResponse.json(
      { error: "Failed to load your tasks" },
      { status: 500 },
    );
  }
}
