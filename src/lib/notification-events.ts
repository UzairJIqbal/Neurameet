import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notify, projectAdminIds } from "@/lib/notifications";
import { findUserIdsByInviteEmail } from "@/lib/invitations";
import { getProjectRole, NEED_ROLES } from "@/lib/project-auth";
import { MINUTES_TZ } from "@/lib/minutes-types";
import { ROLE_LABELS, type ProjectRole } from "@/lib/project-types";
import { taskKey } from "@/lib/tasks";

// W8 AC-71: who hears about which event. Each helper reads what it needs, then
// calls notify. None of them throws, so a notification can never undo the write
// that caused it. Routes wrap these in after(); github-rules and the cron await.

type TaskFacts = {
  id: string;
  projectId: string;
  key: string;
  title: string;
  assigneeId: string | null;
  completionEvidence: string | null;
  link: string;
};

const taskLink = (projectId: string, taskId: string): string =>
  `/projects/${projectId}?tab=tasks&task=${taskId}`;

async function loadTaskFacts(
  supabase: SupabaseClient,
  taskId: string,
): Promise<TaskFacts | null> {
  const { data: task, error } = await supabase
    .from("tasks")
    .select("id, project_id, number, title, assignee_id, completion_evidence")
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw error;
  if (!task) return null;
  const { data: project, error: projectErr } = await supabase
    .from("projects")
    .select("task_prefix")
    .eq("id", task.project_id)
    .maybeSingle();
  if (projectErr) throw projectErr;
  if (!project) return null;
  return {
    id: task.id,
    projectId: task.project_id,
    key: taskKey(project.task_prefix, task.number),
    title: task.title,
    assigneeId: task.assignee_id,
    completionEvidence: task.completion_evidence,
    link: taskLink(task.project_id, task.id),
  };
}

async function projectName(
  supabase: SupabaseClient,
  projectId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("projects")
    .select("name")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw error;
  return (data as { name?: string } | null)?.name ?? null;
}

/** Runs one event's reads and notify, logging instead of throwing. */
async function quietly(kind: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (err) {
    console.error(
      `[notifications] ${kind} failed:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/** To the assignee, unless nobody is set or you assigned yourself. */
export function notifyTaskAssigned(
  supabase: SupabaseClient,
  taskId: string,
  version: number,
  actorId: string,
): Promise<void> {
  return quietly("task_assigned", async () => {
    const task = await loadTaskFacts(supabase, taskId);
    if (!task?.assigneeId || task.assigneeId === actorId) return;
    await notify(supabase, {
      userIds: [task.assigneeId],
      projectId: task.projectId,
      kind: "task_assigned",
      title: `You were assigned ${task.key}`,
      body: task.title,
      link: task.link,
      dedupeKey: `task_assigned:${task.id}:${version}`,
    });
  });
}

export function notifyProposalsReady(
  supabase: SupabaseClient,
  input: {
    projectId: string;
    meetingId: string;
    meetingTitle: string;
    count: number;
    processedAt: string;
  },
): Promise<void> {
  return quietly("proposals_ready", async () => {
    if (input.count <= 0) return;
    await notify(supabase, {
      userIds: await projectAdminIds(supabase, input.projectId),
      projectId: input.projectId,
      kind: "proposals_ready",
      title:
        input.count === 1
          ? "1 task proposal to review"
          : `${input.count} task proposals to review`,
      body: input.meetingTitle,
      link: `/projects/${input.projectId}?tab=tasks`,
      dedupeKey: `proposals_ready:${input.meetingId}:${input.processedAt}`,
    });
  });
}

export function notifyJoinRequest(
  supabase: SupabaseClient,
  input: { projectId: string; requestId: string; name: string },
): Promise<void> {
  return quietly("join_request", async () => {
    const name = await projectName(supabase, input.projectId);
    if (!name) return;
    await notify(supabase, {
      userIds: await projectAdminIds(supabase, input.projectId),
      projectId: input.projectId,
      kind: "join_request",
      title: `${input.name} asked to join ${name}`,
      body: "Review it on the Members tab.",
      link: `/projects/${input.projectId}?tab=members`,
      dedupeKey: `join_request:${input.requestId}`,
    });
  });
}

export function notifyJoinApproved(
  supabase: SupabaseClient,
  input: { projectId: string; requestId: string; userId: string; role: string },
): Promise<void> {
  return quietly("join_approved", async () => {
    const name = await projectName(supabase, input.projectId);
    if (!name) return;
    await notify(supabase, {
      userIds: [input.userId],
      projectId: input.projectId,
      kind: "join_approved",
      title: `You joined ${name}`,
      body: `Your role is ${input.role}.`,
      link: `/projects/${input.projectId}`,
      dedupeKey: `join_approved:${input.requestId}`,
    });
  });
}

/** To the assignee, on `completed` only. No assignee, no notice. */
export function notifyMergeCompleted(
  supabase: SupabaseClient,
  taskId: string,
): Promise<void> {
  return quietly("task_completed_by_merge", async () => {
    const task = await loadTaskFacts(supabase, taskId);
    if (!task?.assigneeId) return;
    const { data, error } = await supabase
      .from("task_links")
      .select("merge_sha, pr_number")
      .eq("task_id", taskId)
      .eq("pr_url", task.completionEvidence ?? "")
      .limit(1);
    if (error) throw error;
    const link = (data ?? [])[0] as
      { merge_sha: string | null; pr_number: number } | undefined;
    const proof = link?.merge_sha ?? link?.pr_number;
    if (proof === undefined) return;
    await notify(supabase, {
      userIds: [task.assigneeId],
      projectId: task.projectId,
      kind: "task_completed_by_merge",
      title: `${task.key} completed by a merge`,
      body: task.title,
      link: task.link,
      dedupeKey: `task_completed_by_merge:${task.id}:${proof}`,
    });
  });
}

/** To the assignee, on `reopened` only. */
export function notifyRevertReopened(
  supabase: SupabaseClient,
  taskId: string,
  revertPr: number,
): Promise<void> {
  return quietly("task_reopened_by_revert", async () => {
    const task = await loadTaskFacts(supabase, taskId);
    if (!task?.assigneeId) return;
    await notify(supabase, {
      userIds: [task.assigneeId],
      projectId: task.projectId,
      kind: "task_reopened_by_revert",
      title: `${task.key} reopened by a revert`,
      body: task.title,
      link: task.link,
      dedupeKey: `task_reopened_by_revert:${task.id}:${revertPr}`,
    });
  });
}

/** One notice per suggested code link; the dedupe key stops repeats on Sync. */
export function notifyKeptSuggestions(
  supabase: SupabaseClient,
  taskId: string,
): Promise<void> {
  return quietly("kept_suggestion", async () => {
    const { data: links, error } = await supabase
      .from("task_links")
      .select("id")
      .eq("task_id", taskId);
    if (error) throw error;
    const linkIds = (links ?? []).map((l: { id: string }) => l.id);
    if (linkIds.length === 0) return;
    const { data: suggested, error: ledgerErr } = await supabase
      .from("ledger_links")
      .select("id")
      .in("evidence_task_link_id", linkIds)
      .eq("state", "suggested");
    if (ledgerErr) throw ledgerErr;
    if (!suggested || suggested.length === 0) return;

    const task = await loadTaskFacts(supabase, taskId);
    if (!task) return;
    const admins = await projectAdminIds(supabase, task.projectId);
    for (const row of suggested as { id: string }[]) {
      await notify(supabase, {
        userIds: admins,
        projectId: task.projectId,
        kind: "kept_suggestion",
        title: "A merge may keep a promise",
        body: `${task.key}: check it in Decisions and Promises.`,
        link: `/projects/${task.projectId}?tab=promises`,
        dedupeKey: `kept_suggestion:${row.id}`,
      });
    }
  });
}

/** AC-71b: only someone linked by GitHub id, and a Developer or higher there. */
export function notifyPrReviewRequested(
  supabase: SupabaseClient,
  input: {
    projectId: string;
    repoId: number;
    repoFullName: string;
    prNumber: number;
    githubUserId: number;
  },
): Promise<void> {
  return quietly("pr_review_requested", async () => {
    const { data, error } = await supabase
      .from("user_settings")
      .select("user_id")
      .eq("github_user_id", input.githubUserId)
      .maybeSingle();
    if (error) throw error;
    const userId = (data as { user_id: string } | null)?.user_id;
    if (!userId) return;
    const role = await getProjectRole(supabase, userId, input.projectId);
    if (!role || !NEED_ROLES.content.includes(role)) return;
    await notify(supabase, {
      userIds: [userId],
      projectId: input.projectId,
      kind: "pr_review_requested",
      title: "Your review was requested",
      body: `${input.repoFullName} #${input.prNumber}`,
      link: `/projects/${input.projectId}?tab=github`,
      dedupeKey: `pr_review:${input.repoId}:${input.prNumber}:${input.githubUserId}`,
      email: false,
    });
  });
}

/** To the member whose role changed. In app only (AC-71c). */
export function notifyMemberRoleChanged(
  supabase: SupabaseClient,
  input: {
    projectId: string;
    userId: string;
    role: ProjectRole;
    auditId: string;
  },
): Promise<void> {
  return quietly("member_role_changed", async () => {
    const name = await projectName(supabase, input.projectId);
    if (!name) return;
    await notify(supabase, {
      userIds: [input.userId],
      projectId: input.projectId,
      kind: "member_role_changed",
      title: `Your role changed in ${name}`,
      body: `Your role is ${ROLE_LABELS[input.role]}.`,
      link: `/projects/${input.projectId}`,
      dedupeKey: `member_role_changed:${input.projectId}:${input.userId}:${input.auditId}`,
      email: false,
    });
  });
}

/** To the Owner and Admins, except the person who joined or approved. In app only. */
export function notifyMemberJoined(
  supabase: SupabaseClient,
  input: {
    projectId: string;
    userId: string;
    name: string;
    role: ProjectRole;
    actorId: string;
  },
): Promise<void> {
  return quietly("member_joined", async () => {
    const name = await projectName(supabase, input.projectId);
    if (!name) return;
    const { data, error } = await supabase
      .from("project_members")
      .select("joined_at")
      .eq("project_id", input.projectId)
      .eq("user_id", input.userId)
      .maybeSingle();
    if (error) throw error;
    const joinedAt = (data as { joined_at: string } | null)?.joined_at;
    if (!joinedAt) return;
    const admins = await projectAdminIds(supabase, input.projectId);
    await notify(supabase, {
      userIds: admins.filter(
        (id) => id !== input.userId && id !== input.actorId,
      ),
      projectId: input.projectId,
      kind: "member_joined",
      title: `${input.name} joined ${name}`,
      body: `Their role is ${ROLE_LABELS[input.role]}.`,
      link: `/projects/${input.projectId}?tab=members`,
      dedupeKey: `member_joined:${input.projectId}:${input.userId}:${joinedAt}`,
      email: false,
    });
  });
}

/** To the person an email invite names, once they have an account. In app only. */
export function notifyProjectInvitation(
  supabase: SupabaseClient,
  input: {
    projectId: string;
    invitationId: string;
    email: string;
    role: ProjectRole;
  },
): Promise<void> {
  return quietly("project_invitation", async () => {
    const name = await projectName(supabase, input.projectId);
    if (!name) return;
    const userIds = await findUserIdsByInviteEmail(input.email);
    if (userIds.length === 0) return;
    const { data, error } = await supabase
      .from("project_members")
      .select("user_id")
      .eq("project_id", input.projectId)
      .in("user_id", userIds)
      .is("removed_at", null);
    if (error) throw error;
    const members = new Set(
      ((data ?? []) as { user_id: string }[]).map((m) => m.user_id),
    );
    await notify(supabase, {
      userIds: userIds.filter((id) => !members.has(id)),
      projectId: input.projectId,
      kind: "project_invitation",
      title: `You were invited to ${name}`,
      body: `Your role would be ${ROLE_LABELS[input.role]}.`,
      link: "/projects",
      dedupeKey: `project_invitation:${input.invitationId}`,
      email: false,
    });
  });
}

const startInPkt = (startsAt: string): string =>
  `${new Date(startsAt).toLocaleString("en-US", {
    timeZone: MINUTES_TZ,
    dateStyle: "medium",
    timeStyle: "short",
  })} PKT`;

/** To the invited members still in the project, except the person who scheduled it. */
export function notifyMeetingScheduled(
  supabase: SupabaseClient,
  input: {
    meetingId: string;
    projectId: string;
    title: string;
    startsAt: string;
    invitedUserIds: string[];
    schedulerId: string;
  },
): Promise<void> {
  return quietly("meeting_scheduled", async () => {
    const invited = input.invitedUserIds.filter(
      (id) => id !== input.schedulerId,
    );
    if (invited.length === 0) return;
    const name = await projectName(supabase, input.projectId);
    if (!name) return;
    const { data, error } = await supabase
      .from("project_members")
      .select("user_id")
      .eq("project_id", input.projectId)
      .in("user_id", invited)
      .is("removed_at", null);
    if (error) throw error;
    await notify(supabase, {
      userIds: ((data ?? []) as { user_id: string }[]).map((m) => m.user_id),
      projectId: input.projectId,
      kind: "meeting_scheduled",
      title: `New meeting in ${name}`,
      body: `${input.title}, ${startInPkt(input.startsAt)}`,
      link: `/projects/${input.projectId}?tab=meetings`,
      dedupeKey: `meeting_scheduled:${input.meetingId}:${input.startsAt}`,
    });
  });
}
