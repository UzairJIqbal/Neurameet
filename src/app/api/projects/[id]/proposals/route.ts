import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  NEED_ROLES,
  accessErrorResponse,
  requireProjectRole,
} from "@/lib/project-auth";
import { activeMemberIds, getTaskPrefix } from "@/lib/project-select";
import { PROPOSALS_LIMIT, taskKey } from "@/lib/tasks";
import type { Proposal, ProposalsResponse } from "@/lib/task-types";

type Params = { params: Promise<{ id: string }> };

type MeetingRow = {
  id: string;
  title: string | null;
  started_at: string | null;
};
type ItemRow = {
  id: string;
  meeting_id: string;
  title: string;
  assignee: string | null;
  due_date: string | null;
  quote: string | null;
  quote_speaker: string | null;
  quote_line: number | null;
  quote_verified: boolean;
  proposed_assignee_id: string | null;
  duplicate_of_task_id: string | null;
  duplicate_score: number | null;
};

// Never selects `embedding` (AC-37).
const PROPOSAL_SELECT =
  "id, meeting_id, title, assignee, due_date, quote, quote_speaker, quote_line, quote_verified, proposed_assignee_id, duplicate_of_task_id, duplicate_score";

// Owner, Admin, Developer (read only): the project's pending proposals (AC-42).
export async function GET(_request: Request, { params }: Params) {
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
    const canReview = NEED_ROLES.manage.includes(role);

    const { data: meetingData, error: meetingErr } = await supabase
      .from("meetings")
      .select("id, title, started_at")
      .eq("project_id", id);
    if (meetingErr) throw meetingErr;
    const meetings = new Map(
      ((meetingData ?? []) as MeetingRow[]).map((m) => [m.id, m]),
    );
    if (meetings.size === 0) {
      return NextResponse.json({
        proposals: [],
        canReview,
      } satisfies ProposalsResponse);
    }

    const { data: itemData, error: itemErr } = await supabase
      .from("action_items")
      .select(PROPOSAL_SELECT)
      .in("meeting_id", [...meetings.keys()])
      .eq("review_state", "proposed");
    if (itemErr) throw itemErr;

    const time = (m: MeetingRow | undefined) =>
      m?.started_at ? new Date(m.started_at).getTime() : 0;
    const items = ((itemData ?? []) as ItemRow[])
      .sort(
        (a, b) =>
          time(meetings.get(b.meeting_id)) - time(meetings.get(a.meeting_id)) ||
          (a.quote_line ?? Number.MAX_SAFE_INTEGER) -
            (b.quote_line ?? Number.MAX_SAFE_INTEGER),
      )
      .slice(0, PROPOSALS_LIMIT);

    const duplicateIds = [
      ...new Set(items.map((i) => i.duplicate_of_task_id).filter(Boolean)),
    ] as string[];
    const [activeIds, prefix, duplicates] = await Promise.all([
      activeMemberIds(supabase, id),
      getTaskPrefix(supabase, id),
      loadDuplicates(supabase, id, duplicateIds),
    ]);

    const proposals: Proposal[] = items.map((item) => {
      const meeting = meetings.get(item.meeting_id);
      const dup = item.duplicate_of_task_id
        ? duplicates.get(item.duplicate_of_task_id)
        : undefined;
      return {
        id: item.id,
        meetingId: item.meeting_id,
        meetingTitle: meeting?.title || "Untitled meeting",
        meetingDate: meeting?.started_at ?? null,
        title: item.title,
        assignee: item.assignee,
        dueDate: item.due_date,
        quote: item.quote,
        quoteSpeaker: item.quote_speaker,
        quoteLine: item.quote_line,
        quoteVerified: item.quote_verified,
        proposedAssigneeId:
          item.proposed_assignee_id && activeIds.has(item.proposed_assignee_id)
            ? item.proposed_assignee_id
            : null,
        duplicate: dup
          ? {
              taskId: dup.id,
              key: taskKey(prefix, dup.number),
              title: dup.title,
              score: Number(item.duplicate_score ?? 0),
            }
          : null,
      };
    });

    return NextResponse.json({
      proposals,
      canReview,
    } satisfies ProposalsResponse);
  } catch (err) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("[proposals] list failed:", err);
    return NextResponse.json(
      { error: "Failed to load proposals" },
      { status: 500 },
    );
  }
}

// Only open tasks of this project count as a duplicate to show.
async function loadDuplicates(
  supabase: ReturnType<typeof supabaseServer>,
  projectId: string,
  ids: string[],
): Promise<Map<string, { id: string; number: number; title: string }>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from("tasks")
    .select("id, number, title, status")
    .eq("project_id", projectId)
    .in("id", ids)
    .neq("status", "completed");
  if (error) throw error;
  return new Map(
    ((data ?? []) as Array<{ id: string; number: number; title: string }>).map(
      (t) => [t.id, t],
    ),
  );
}
