import { after, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  NEED_ROLES,
  accessErrorResponse,
  requireProjectRole,
} from "@/lib/project-auth";
import { lookupProfiles, rpcErrorCode } from "@/lib/projects";
import { notifyTaskAssigned } from "@/lib/notification-events";
import {
  readTask,
  taskLinkSelectFor,
  toTaskEvent,
  toTaskPrLink,
  type TaskEventRow,
  type TaskLinkRow,
} from "@/lib/project-select";
import {
  EVIDENCE_MAX_CHARS,
  TASK_DESCRIPTION_MAX,
  TASK_TITLE_MAX,
  isIsoDate,
  isTaskPriority,
  isTaskStatus,
  needsRenumber,
} from "@/lib/tasks";
import { patchDenial, type TaskRulePatch } from "@/lib/task-rules";
import { outcomeForTask } from "@/lib/proof-chain";
import { readTaskComments } from "@/lib/task-comments";
import type { TaskDetailResponse, TaskResponse } from "@/lib/task-types";

type Params = { params: Promise<{ id: string }> };
type Supabase = ReturnType<typeof supabaseServer>;

const NOT_FOUND = { error: "Task not found" };
const FORBIDDEN = (error: string) =>
  NextResponse.json({ error }, { status: 403 });

type TaskHead = {
  id: string;
  project_id: string;
  status: string;
  assignee_id: string | null;
  version: number;
  position: number;
};

async function loadHead(
  supabase: Supabase,
  id: string,
): Promise<TaskHead | null> {
  const { data, error } = await supabase
    .from("tasks")
    .select("id, project_id, status, assignee_id, version, position")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as TaskHead | null) ?? null;
}

// Member: one task with its events, PR links, and Proof Chain.
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const supabase = supabaseServer();
    const head = await loadHead(supabase, id);
    if (!head) return NextResponse.json(NOT_FOUND, { status: 404 });
    const { role } = await requireProjectRole(
      supabase,
      userId,
      head.project_id,
      NEED_ROLES.read,
      NOT_FOUND.error,
    );

    const task = await readTask(supabase, id, role);
    if (!task) return NextResponse.json(NOT_FOUND, { status: 404 });

    const { data: eventData, error: eventErr } = await supabase
      .from("task_events")
      .select("id, kind, actor_id, from_value, to_value, detail, created_at")
      .eq("task_id", id)
      .order("created_at", { ascending: true });
    if (eventErr) throw eventErr;
    // A Viewer gets no comments and no way to count them (AC-70r).
    const eventRows = ((eventData ?? []) as TaskEventRow[]).filter(
      (e) => role !== "viewer" || e.kind !== "commented",
    );
    const names = await lookupProfiles(
      eventRows.map((e) => e.actor_id).filter((v): v is string => !!v),
    );

    const { data: linkData, error: linkErr } = await supabase
      .from("task_links")
      .select(taskLinkSelectFor(role))
      .eq("task_id", id)
      .order("created_at", { ascending: true });
    if (linkErr) throw linkErr;
    const linkRows = (linkData ?? []) as unknown as TaskLinkRow[];

    let meetingTitle: string | null = null;
    if (task.sourceMeetingId) {
      const { data: meeting } = await supabase
        .from("meetings")
        .select("title")
        .eq("id", task.sourceMeetingId)
        .maybeSingle();
      meetingTitle =
        (meeting as { title?: string | null } | null)?.title ?? null;
    }

    const response: TaskDetailResponse = {
      projectId: head.project_id,
      task,
      events: eventRows.map((e) => toTaskEvent(e, role, names)),
      prLinks: linkRows.map((row) => toTaskPrLink(row, role)),
      proofChain: {
        meetingId: task.sourceMeetingId,
        meetingTitle,
        ...(role === "viewer"
          ? {}
          : {
              quote: task.quote ?? null,
              quoteSpeaker: task.quoteSpeaker ?? null,
              quoteLine: task.quoteLine ?? null,
            }),
      },
      outcome: await outcomeForTask(supabase, task, role),
      ...(role === "viewer" ? {} : await readTaskComments(supabase, id)),
    };
    return NextResponse.json(response);
  } catch (err) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("[tasks] read failed:", err);
    return NextResponse.json(
      { error: "Failed to load the task" },
      { status: 500 },
    );
  }
}

type ParsedPatch =
  | { ok: true; patch: Record<string, unknown>; ifVersion: number }
  | { ok: false; error: string };

/** Validates the body by hand and returns only the keys update_task reads. */
function parsePatch(raw: Record<string, unknown> | null): ParsedPatch {
  if (!raw) return { ok: false, error: "Body is required" };
  const ifVersion = raw.ifVersion;
  if (typeof ifVersion !== "number" || !Number.isInteger(ifVersion)) {
    return { ok: false, error: "ifVersion is required" };
  }
  const patch: Record<string, unknown> = {};

  if ("status" in raw) {
    if (!isTaskStatus(raw.status))
      return { ok: false, error: "Unknown status" };
    patch.status = raw.status;
  }
  if ("position" in raw) {
    if (typeof raw.position !== "number" || !Number.isFinite(raw.position)) {
      return { ok: false, error: "Position must be a number" };
    }
    patch.position = raw.position;
  }
  if ("assigneeId" in raw) {
    if (raw.assigneeId !== null && typeof raw.assigneeId !== "string") {
      return { ok: false, error: "Assignee must be a member id or null" };
    }
    patch.assigneeId = raw.assigneeId || null;
  }
  if ("title" in raw) {
    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    if (title.length < 1 || title.length > TASK_TITLE_MAX) {
      return {
        ok: false,
        error: `Title must be 1 to ${TASK_TITLE_MAX} characters`,
      };
    }
    patch.title = title;
  }
  if ("description" in raw) {
    if (raw.description !== null && typeof raw.description !== "string") {
      return { ok: false, error: "Description must be text" };
    }
    const description = (raw.description as string | null)?.trim() || null;
    if (description && description.length > TASK_DESCRIPTION_MAX) {
      return {
        ok: false,
        error: `Description must be at most ${TASK_DESCRIPTION_MAX} characters`,
      };
    }
    patch.description = description;
  }
  if ("dueDate" in raw) {
    if (raw.dueDate !== null && !isIsoDate(raw.dueDate)) {
      return { ok: false, error: "Due date must be YYYY-MM-DD" };
    }
    patch.dueDate = raw.dueDate;
  }
  if ("priority" in raw) {
    if (!isTaskPriority(raw.priority)) {
      return { ok: false, error: "Unknown priority" };
    }
    patch.priority = raw.priority;
  }
  if ("completionEvidence" in raw) {
    if (typeof raw.completionEvidence !== "string") {
      return { ok: false, error: "Evidence must be text" };
    }
    patch.completionEvidence = raw.completionEvidence.trim();
  }
  return { ok: true, patch, ifVersion };
}

/** Renumbers the column when the dropped card sits too close to a neighbour. */
async function renumberIfTight(
  supabase: Supabase,
  projectId: string,
  taskId: string,
): Promise<boolean> {
  const head = await loadHead(supabase, taskId);
  if (!head) return false;
  const neighbour = async (dir: "below" | "above") => {
    const query = supabase
      .from("tasks")
      .select("position")
      .eq("project_id", projectId)
      .eq("status", head.status)
      .neq("id", taskId);
    const { data } = await (
      dir === "below"
        ? query
            .lte("position", head.position)
            .order("position", { ascending: false })
        : query
            .gte("position", head.position)
            .order("position", { ascending: true })
    ).limit(1);
    const row = ((data ?? []) as Array<{ position: number }>)[0];
    return row ? Number(row.position) : null;
  };
  const [below, above] = await Promise.all([
    neighbour("below"),
    neighbour("above"),
  ]);
  const tight = [below, above].some(
    (p) => p !== null && needsRenumber(p, Number(head.position)),
  );
  if (!tight) return false;
  const { error } = await supabase.rpc("renumber_task_column", {
    p_project: projectId,
    p_status: head.status,
  });
  if (error) console.error("[tasks] renumber failed:", error);
  return !error;
}

const RPC_ERRORS: Record<string, { status: number; error: string }> = {
  not_found: { status: 404, error: NOT_FOUND.error },
  assignee_not_member: { status: 422, error: "Assignee is no longer a member" },
  evidence_required: {
    status: 422,
    error: "Add evidence to complete the task",
  },
};

// Board edits with ifVersion (AC-39, AC-40). 200 and 409 both return the task.
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const parsed = parsePatch(raw);
  if (!parsed.ok)
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  const { patch, ifVersion } = parsed;

  try {
    const supabase = supabaseServer();
    const head = await loadHead(supabase, id);
    if (!head) return NextResponse.json(NOT_FOUND, { status: 404 });
    const { role } = await requireProjectRole(
      supabase,
      userId,
      head.project_id,
      NEED_ROLES.read,
      NOT_FOUND.error,
    );

    const denial = patchDenial(role, userId, head, patch as TaskRulePatch);
    if (denial) return FORBIDDEN(denial);

    const stale = async () =>
      NextResponse.json(
        {
          error: "Someone else changed this task. It has been refreshed.",
          task: await readTask(supabase, id, role),
        },
        { status: 409 },
      );
    if (head.version !== ifVersion) return stale();

    const completing =
      patch.status === "completed" && head.status !== "completed";
    const evidence = (patch.completionEvidence as string | undefined) ?? "";
    if (
      completing &&
      (evidence.length < 1 || evidence.length > EVIDENCE_MAX_CHARS)
    ) {
      return NextResponse.json(
        { error: `Evidence must be 1 to ${EVIDENCE_MAX_CHARS} characters` },
        { status: 422 },
      );
    }

    const { error } = await supabase.rpc("update_task", {
      p_task: id,
      p_actor: userId,
      p_patch: patch,
      p_if_version: ifVersion,
    });
    if (error) {
      const code = rpcErrorCode(error) ?? "";
      if (code === "stale") return stale();
      const mapped = RPC_ERRORS[code];
      if (mapped)
        return NextResponse.json(
          { error: mapped.error },
          { status: mapped.status },
        );
      throw error;
    }

    if (patch.position !== undefined) {
      await renumberIfTight(supabase, head.project_id, id);
    }
    const task = await readTask(supabase, id, role);
    if (!task) return NextResponse.json(NOT_FOUND, { status: 404 });
    // update_task returns only the id, so the key uses ifVersion + 1, never a later read.
    if (patch.assigneeId && patch.assigneeId !== head.assignee_id) {
      after(() => notifyTaskAssigned(supabase, id, ifVersion + 1, userId));
    }
    return NextResponse.json({ task } satisfies TaskResponse);
  } catch (err) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("[tasks] update failed:", err);
    return NextResponse.json(
      { error: "Failed to update the task" },
      { status: 500 },
    );
  }
}
