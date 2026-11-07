import { after, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  NEED_ROLES,
  accessErrorResponse,
  requireProjectRole,
  type ProjectRole,
} from "@/lib/project-auth";
import { lookupProfiles, rpcErrorCode } from "@/lib/projects";
import { notifyTaskAssigned } from "@/lib/notification-events";
import {
  activeMemberIds,
  getTaskPrefix,
  likePattern,
  readTask,
  taskSelectFor,
  toTask,
  type TaskRow,
} from "@/lib/project-select";
import { embedTitle } from "@/agent/proposals";
import { decorateBoardTasks, setInitialPriority } from "@/lib/task-board";
import {
  BOARD_COLUMN_LIMIT,
  TASK_DESCRIPTION_MAX,
  TASK_STATUSES,
  TASK_TITLE_MAX,
  isIsoDate,
  isTaskPriority,
  isTaskStatus,
  parseTaskKeyQuery,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/tasks";
import type { TaskResponse, TasksResponse } from "@/lib/task-types";

type Params = { params: Promise<{ id: string }> };
type Supabase = ReturnType<typeof supabaseServer>;

type BoardFilters = {
  assigneeId: string | null;
  priority: TaskPriority | null;
  number: number | null;
  titleLike: string | null;
};

async function loadColumn(
  supabase: Supabase,
  projectId: string,
  status: TaskStatus,
  role: ProjectRole,
  filters: BoardFilters,
): Promise<{ rows: TaskRow[]; count: number }> {
  let query = supabase
    .from("tasks")
    .select(taskSelectFor(role), { count: "exact" })
    .eq("project_id", projectId)
    .eq("status", status);
  if (filters.assigneeId === "none") query = query.is("assignee_id", null);
  else if (filters.assigneeId)
    query = query.eq("assignee_id", filters.assigneeId);
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.number !== null) query = query.eq("number", filters.number);
  else if (filters.titleLike) query = query.ilike("title", filters.titleLike);

  const { data, error, count } = await query
    .order("position", { ascending: true })
    .order("number", { ascending: true })
    .limit(BOARD_COLUMN_LIMIT);
  if (error) throw error;
  const rows = (data ?? []) as unknown as TaskRow[];
  return { rows, count: count ?? rows.length };
}

// Member: the board, at most BOARD_COLUMN_LIMIT cards per column (AC-38).
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const supabase = supabaseServer();
    const { role } = await requireProjectRole(
      supabase,
      userId,
      id,
      NEED_ROLES.read,
    );

    const url = new URL(request.url);
    const statusParam = url.searchParams.get("status");
    if (statusParam && !isTaskStatus(statusParam)) {
      return NextResponse.json({ error: "Unknown status" }, { status: 422 });
    }
    const priority = url.searchParams.get("priority");
    if (priority && !isTaskPriority(priority)) {
      return NextResponse.json({ error: "Unknown priority" }, { status: 422 });
    }
    const statuses: readonly TaskStatus[] = isTaskStatus(statusParam)
      ? [statusParam]
      : TASK_STATUSES;
    const prefix = await getTaskPrefix(supabase, id);
    const q = (url.searchParams.get("q") ?? "").trim();
    const number = q ? parseTaskKeyQuery(q, prefix) : null;
    const filters: BoardFilters = {
      assigneeId: url.searchParams.get("assigneeId") || null,
      priority: isTaskPriority(priority) ? priority : null,
      number,
      titleLike: q && number === null ? likePattern(q) : null,
    };

    const columns = await Promise.all(
      statuses.map((s) => loadColumn(supabase, id, s, role, filters)),
    );

    const rows = columns.flatMap((c) => c.rows);
    const names = await lookupProfiles(
      rows.map((r) => r.assignee_id).filter((v): v is string => !!v),
    );
    const truncated: TasksResponse["truncated"] = {};
    columns.forEach((c, i) => {
      if (c.count > c.rows.length) truncated[statuses[i]] = c.count;
    });

    return NextResponse.json({
      tasks: await decorateBoardTasks(
        supabase,
        rows.map((r) => toTask(r, prefix, role, names)),
        role,
      ),
      truncated,
    } satisfies TasksResponse);
  } catch (err) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("[tasks] list failed:", err);
    return NextResponse.json(
      { error: "Failed to load tasks" },
      { status: 500 },
    );
  }
}

type NewTask = {
  title: string;
  description: string | null;
  assigneeId: string | null;
  dueDate: string | null;
  priority: TaskPriority;
};

function parseNewTask(
  raw: Record<string, unknown> | null,
): { ok: true; task: NewTask } | { ok: false; error: string } {
  const title = typeof raw?.title === "string" ? raw.title.trim() : "";
  if (title.length < 1 || title.length > TASK_TITLE_MAX) {
    return {
      ok: false,
      error: `Title must be 1 to ${TASK_TITLE_MAX} characters`,
    };
  }
  const desc = raw?.description ?? null;
  if (desc !== null && typeof desc !== "string") {
    return { ok: false, error: "Description must be text" };
  }
  const description = desc?.trim() || null;
  if (description && description.length > TASK_DESCRIPTION_MAX) {
    return {
      ok: false,
      error: `Description must be at most ${TASK_DESCRIPTION_MAX} characters`,
    };
  }
  const assigneeId = raw?.assigneeId ?? null;
  if (assigneeId !== null && typeof assigneeId !== "string") {
    return { ok: false, error: "Assignee must be a member id or null" };
  }
  const dueDate = raw?.dueDate ?? null;
  if (dueDate !== null && !isIsoDate(dueDate)) {
    return { ok: false, error: "Due date must be YYYY-MM-DD" };
  }
  const priority = raw?.priority ?? "medium";
  if (!isTaskPriority(priority)) {
    return { ok: false, error: "Unknown priority" };
  }
  return {
    ok: true,
    task: {
      title,
      description,
      assigneeId: (assigneeId as string | null) || null,
      dueDate: dueDate as string | null,
      priority,
    },
  };
}

// Developer or higher: a new task with the next key (AC-38).
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const supabase = supabaseServer();
    const { role } = await requireProjectRole(
      supabase,
      userId,
      id,
      NEED_ROLES.content,
    );

    const raw = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const parsed = parseNewTask(raw);
    if (!parsed.ok)
      return NextResponse.json({ error: parsed.error }, { status: 422 });
    const input = parsed.task;

    if (input.assigneeId) {
      const active = await activeMemberIds(supabase, id);
      if (!active.has(input.assigneeId)) {
        return NextResponse.json(
          { error: "Assignee is not a member of this project" },
          { status: 422 },
        );
      }
    }

    const embedding = await embedTitle(input.title);
    const { data, error } = await supabase.rpc("create_project_task", {
      p_project: id,
      p_title: input.title,
      p_description: input.description,
      p_assignee: input.assigneeId,
      p_due: input.dueDate,
      p_source_action_item: null,
      p_source_meeting: null,
      p_quote: null,
      p_quote_speaker: null,
      p_quote_line: null,
      p_embedding: embedding,
      p_actor: userId,
    });
    if (error) {
      console.error("[tasks] create rpc failed:", rpcErrorCode(error));
      throw error;
    }

    const taskId = (data as { id?: string } | null)?.id;
    if (taskId) await setInitialPriority(supabase, taskId, input.priority);
    const task = taskId ? await readTask(supabase, taskId, role) : null;
    if (!task) throw new Error("Created task not readable");
    if (taskId && input.assigneeId) {
      after(() => notifyTaskAssigned(supabase, taskId, 1, userId));
    }
    return NextResponse.json({ task } satisfies TaskResponse, { status: 201 });
  } catch (err) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("[tasks] create failed:", err);
    return NextResponse.json(
      { error: "Failed to create the task" },
      { status: 500 },
    );
  }
}
