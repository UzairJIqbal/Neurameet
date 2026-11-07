import { after, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  NEED_ROLES,
  accessErrorResponse,
  requireProjectRole,
} from "@/lib/project-auth";
import { rpcErrorCode } from "@/lib/projects";
import { readTask } from "@/lib/project-select";
import { notifyTaskAssigned } from "@/lib/notification-events";
import { embedTitle } from "@/agent/proposals";
import { setInitialPriority } from "@/lib/task-board";
import {
  TASK_TITLE_MAX,
  isIsoDate,
  isTaskPriority,
  type TaskPriority,
} from "@/lib/tasks";
import type {
  ProposalDecision,
  ReviewProposalResponse,
} from "@/lib/task-types";

type Params = { params: Promise<{ id: string }> };

const NOT_FOUND = { error: "Proposal not found" };

// Raise codes from review_proposal, mapped to the spec's status and message.
const RPC_ERRORS: Record<string, { status: number; error: string }> = {
  not_found: { status: 404, error: "Proposal not found" },
  already_decided: { status: 409, error: "Already decided" },
  task_closed: { status: 409, error: "That task is closed" },
  quote_unverified: {
    status: 422,
    error: "This proposal has no matching transcript line",
  },
  assignee_not_member: {
    status: 422,
    error: "Assignee is no longer a member",
  },
};

type ParsedBody = {
  decision: ProposalDecision;
  title: string | null;
  assigneeGiven: boolean;
  assigneeId: string | null;
  dueDate: string | null;
  mergeIntoTaskId: string | null;
  confirmWithoutQuote: boolean;
  priority: TaskPriority | null;
};

function parseBody(
  raw: Record<string, unknown> | null,
): { ok: true; body: ParsedBody } | { ok: false; error: string } {
  const decision = raw?.decision;
  if (decision !== "confirm" && decision !== "reject" && decision !== "merge") {
    return { ok: false, error: "Decision must be confirm, reject, or merge" };
  }

  let title: string | null = null;
  if (raw?.title !== undefined) {
    if (typeof raw.title !== "string") {
      return { ok: false, error: "Title must be text" };
    }
    title = raw.title.trim();
    if (title.length < 1 || title.length > TASK_TITLE_MAX) {
      return {
        ok: false,
        error: `Title must be 1 to ${TASK_TITLE_MAX} characters`,
      };
    }
  }

  const assigneeGiven = raw !== null && "assigneeId" in raw;
  const assigneeId = raw?.assigneeId ?? null;
  if (assigneeId !== null && typeof assigneeId !== "string") {
    return { ok: false, error: "Assignee must be a member id or null" };
  }

  const dueDate = raw?.dueDate ?? null;
  if (dueDate !== null && !isIsoDate(dueDate)) {
    return { ok: false, error: "Due date must be YYYY-MM-DD" };
  }

  const merge = raw?.mergeIntoTaskId ?? null;
  if (decision === "merge" && typeof merge !== "string") {
    return { ok: false, error: "Pick the task to merge into" };
  }

  const priority = raw?.priority ?? null;
  if (priority !== null && !isTaskPriority(priority)) {
    return { ok: false, error: "Unknown priority" };
  }

  return {
    ok: true,
    body: {
      decision,
      title,
      assigneeGiven,
      assigneeId: assigneeId as string | null,
      dueDate: dueDate as string | null,
      mergeIntoTaskId: typeof merge === "string" ? merge : null,
      confirmWithoutQuote: raw?.confirmWithoutQuote === true,
      priority,
    },
  };
}

// Owner or Admin: confirm a proposal into a task, reject it, or merge it into
// an open task (AC-35, AC-36).
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const parsed = parseBody(raw);
  if (!parsed.ok)
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  const body = parsed.body;

  try {
    const supabase = supabaseServer();
    const { data: item, error: itemErr } = await supabase
      .from("action_items")
      .select("id, title, meeting_id")
      .eq("id", id)
      .maybeSingle();
    if (itemErr) throw itemErr;
    const row = item as {
      id: string;
      title: string;
      meeting_id: string;
    } | null;
    if (!row) return NextResponse.json(NOT_FOUND, { status: 404 });

    const { data: meeting, error: meetingErr } = await supabase
      .from("meetings")
      .select("project_id")
      .eq("id", row.meeting_id)
      .maybeSingle();
    if (meetingErr) throw meetingErr;
    const projectId =
      (meeting as { project_id: string | null } | null)?.project_id ?? null;
    if (!projectId) return NextResponse.json(NOT_FOUND, { status: 404 });

    const { role } = await requireProjectRole(
      supabase,
      userId,
      projectId,
      NEED_ROLES.manage,
      NOT_FOUND.error,
    );

    // A changed title gets its own vector; an unchanged one reuses the stored one.
    const titleChanged =
      body.decision === "confirm" &&
      body.title !== null &&
      body.title !== row.title;
    const embedding = titleChanged ? await embedTitle(body.title!) : null;

    const { data, error } = await supabase.rpc("review_proposal", {
      p_item: id,
      p_decision: body.decision,
      p_title: body.decision === "confirm" ? body.title : null,
      p_assignee: body.assigneeId,
      p_assignee_given: body.assigneeGiven,
      p_due: body.dueDate,
      p_merge_task: body.mergeIntoTaskId,
      p_embedding: embedding,
      p_actor: userId,
      p_confirm_without_quote: body.confirmWithoutQuote,
    });
    if (error) {
      const mapped = RPC_ERRORS[rpcErrorCode(error) ?? ""];
      if (mapped)
        return NextResponse.json(
          { error: mapped.error },
          { status: mapped.status },
        );
      throw error;
    }

    const result = (data ?? {}) as { taskId?: string; itemId?: string };
    const response: ReviewProposalResponse = {};
    if (result.taskId && body.decision === "confirm" && body.priority) {
      await setInitialPriority(supabase, result.taskId, body.priority);
    }
    if (result.taskId) {
      const task = await readTask(supabase, result.taskId, role);
      if (task) response.task = task;
    }
    const confirmedId = body.decision === "confirm" ? result.taskId : undefined;
    if (confirmedId) {
      after(() => notifyTaskAssigned(supabase, confirmedId, 1, userId));
    }
    if (result.itemId) response.item = { id: result.itemId };
    return NextResponse.json(response);
  } catch (err) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("[proposals] review failed:", err);
    return NextResponse.json(
      { error: "Failed to review the proposal" },
      { status: 500 },
    );
  }
}
