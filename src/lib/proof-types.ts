// Response shapes for the Proof Chain surfaces (spec 0004, W6). Browser safe.

import type {
  LedgerDerivedStatus,
  LedgerItem,
  LedgerLinkPr,
  LedgerLinkState,
  LedgerRelation,
} from "@/lib/meeting-types";
import type { ProjectAvatar } from "@/lib/project-types";

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
    state: "linked" | "waiting" | "rejected" | "none" | "decision";
    taskId?: string;
    key?: string;
    status?: string;
  };
  shipped: {
    state: "merged" | "reverted" | "manual" | "none" | "not_applicable";
    repoFullName?: string;
    prNumber?: number;
    prUrl?: string;
  };
  kept: {
    state: "kept" | "partial" | "reversed" | "review" | "none" | "no_promise";
    keptCount?: number;
    total?: number;
  };
};

export interface ProjectLedgerLink {
  id: string;
  evidenceKind: "meeting" | "code";
  relation: LedgerRelation;
  state: LedgerLinkState;
  /** A confirmed meeting link whose evidence is not in this project (AC-62b). */
  outsideProject?: boolean;
}

export interface ProjectLedgerItem extends LedgerItem {
  derivedStatus: LedgerDerivedStatus;
  meeting: { id: string; title: string; startedAt: string };
  links: ProjectLedgerLink[];
  outcome: Outcome;
  /** The source meeting's `meeting_insights.category`. */
  tag: string | null;
  /** First 5 of the source meeting's `meeting_participants`. */
  participants: ProjectAvatar[];
}

export interface ReviewRow {
  id: string;
  evidenceKind: "meeting" | "code";
  relation: LedgerRelation;
  confidence: number;
  /** The transcript quote, or the PR title on a code link. */
  quote: string | null;
  speaker: string | null;
  lineNumber: number | null;
  evidenceMeetingId: string | null;
  pr?: LedgerLinkPr;
  item: { id: string; statement: string };
  meeting: { id: string; title: string };
}

export interface ProjectLedgerResponse {
  items: ProjectLedgerItem[];
  nextCursor: string | null;
  canReview: boolean;
  needsReview: ReviewRow[];
  reviewCount: number;
}

export interface ActivityRow {
  id: string;
  kind: string;
  occurredAt: string;
  actorName: string | null;
  subjectType: string;
  subjectId: string;
  taskKey?: string;
  taskTitle?: string;
  itemStatement?: string;
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
  meetings: [
    "meeting.created",
    "meeting.moved",
    "ledger.kept_confirmed",
    "ledger.reversed_confirmed",
  ],
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
