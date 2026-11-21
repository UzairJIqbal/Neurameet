// Response shapes for the Proof Chain surfaces (spec 0004, W6). Browser safe.

export type Outcome = {
  said: {
    state: "quoted" | "hidden" | "no_quote" | "typed";
    meetingId?: string;
    meetingTitle?: string;
    quote?: string;
    speaker?: string;
    lineNumber?: number;
    /** Other promises merged into this task, shown as "+N more". */
    moreCount?: number;
  };
  task: {
    state: "linked" | "none";
    taskId?: string;
    key?: string;
    status?: string;
  };
  shipped: {
    state: "merged" | "reverted" | "manual" | "none";
    repoFullName?: string;
    prNumber?: number;
    prUrl?: string;
  };
};

export interface ActivityRow {
  id: string;
  kind: string;
  occurredAt: string;
  actorName: string | null;
  subjectType: string;
  subjectId: string;
  taskKey?: string;
  taskTitle?: string;
  meetingTitle?: string;
  memberName?: string;
  field?: string;
  from?: string | null;
  to?: string | null;
}

export const ACTIVITY_CATEGORY_KINDS = {
  github: [
    "repo.linked",
    "repo.unlinked",
    "task.pr_linked",
    "task.pr_state_changed",
    "task.completed_by_merge",
    "task.reopened_by_revert",
  ],
  tasks: [
    "task.created",
    "task.edited",
    "task.status_changed",
    "task.assigned",
    "task.unassigned",
    "task.completed_manual",
    "task.proposal_merged",
    "task.commented",
  ],
  meetings: ["meeting.created", "meeting.moved"],
  members: [
    "project.created",
    "project.ownership_transferred",
    "member.joined",
    "member.left",
    "member.restored",
    "member.removed",
    "member.role_changed",
  ],
} as const;

export type ActivityCategory = keyof typeof ACTIVITY_CATEGORY_KINDS;

export const ACTIVITY_CATEGORIES = Object.keys(
  ACTIVITY_CATEGORY_KINDS,
) as ActivityCategory[];

export type ActivityCategoryCounts = Record<"all" | ActivityCategory, number>;

export interface ActivityResponse {
  rows: ActivityRow[];
  nextBefore: string | null;
  /** On the first page only. Follows `actorId`, never `category`. */
  categoryCounts?: ActivityCategoryCounts;
}
