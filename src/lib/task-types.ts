// Task and proposal shapes for the routes and the UI (no server-only imports).

import type { TaskPriority, TaskStatus } from "@/lib/tasks";
import type { PrState, TaskPrLink } from "@/lib/github-types";
import type { Outcome } from "@/lib/proof-types";

/** One PR on a board card. Never sent to a Viewer. */
export interface TaskPrRef {
  repoFullName: string;
  prNumber: number;
  prUrl: string;
  state: PrState;
  reverted: boolean;
}

export interface Task {
  id: string;
  key: string;
  number: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  position: number;
  assigneeId: string | null;
  assigneeName: string | null;
  dueDate: string | null;
  sourceMeetingId: string | null;
  /** Absent for Viewers (AC-37). */
  quote?: string | null;
  quoteSpeaker?: string | null;
  quoteLine?: number | null;
  completionKind: "manual" | "merge" | null;
  completionEvidence?: string | null;
  completedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  /** Board rows only. */
  meetingTitle?: string | null;
  /** Board rows only, and never for a Viewer. */
  commentCount?: number;
  prRefs?: TaskPrRef[];
}

/** A row on My Tasks: your own task, with the project it lives in. */
export interface MyTask extends Task {
  projectId: string;
  projectName: string;
}

export interface MyTasksResponse {
  /** The server's date, so Overdue never depends on the browser's clock. */
  today: string;
  tasks: MyTask[];
  /** True when you have more open tasks than the cap. */
  truncated: boolean;
}

export type TaskEventKind =
  | "created"
  | "edited"
  | "status_changed"
  | "assigned"
  | "unassigned"
  | "completed_manual"
  | "completed_by_merge"
  | "reopened_by_revert"
  | "pr_linked"
  | "pr_state_changed"
  | "proposal_merged"
  | "commented";

export interface TaskEvent {
  id: string;
  kind: TaskEventKind;
  actorId: string | null;
  actorName: string | null;
  fromValue: string | null;
  toValue: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface TaskProofChain {
  meetingId: string | null;
  meetingTitle: string | null;
  quote?: string | null;
  quoteSpeaker?: string | null;
  quoteLine?: number | null;
}

/** Plain text. Never sent to a Viewer. */
export interface TaskComment {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface TaskCommit {
  /** The first 7 characters of the sha. */
  sha: string;
  /** The first line of the commit message. */
  message: string;
  authorLogin: string | null;
  url: string;
}

export interface TaskPrCommits {
  repoFullName: string;
  prNumber: number;
  commits: TaskCommit[];
}

export interface TaskCommitsResponse {
  pullRequests: TaskPrCommits[];
}

export interface TaskCommentResponse {
  comment: TaskComment;
}

export interface TaskDetailResponse {
  projectId: string;
  task: Task;
  events: TaskEvent[];
  prLinks: TaskPrLink[];
  proofChain: TaskProofChain;
  outcome?: Outcome;
  /** Latest first. Both absent for a Viewer. */
  comments?: TaskComment[];
  commentsTruncated?: boolean;
}

export interface TasksResponse {
  tasks: Task[];
  /** Capped statuses only, mapped to their total count. */
  truncated: Partial<Record<TaskStatus, number>>;
}

export interface TaskResponse {
  task: Task;
}

export interface Proposal {
  id: string;
  meetingId: string;
  meetingTitle: string;
  meetingDate: string | null;
  title: string;
  assignee: string | null;
  dueDate: string | null;
  quote: string | null;
  quoteSpeaker: string | null;
  quoteLine: number | null;
  quoteVerified: boolean;
  proposedAssigneeId: string | null;
  duplicate: {
    taskId: string;
    key: string;
    title: string;
    score: number;
  } | null;
}

export interface ProposalsResponse {
  proposals: Proposal[];
  canReview: boolean;
}

export type ProposalDecision = "confirm" | "reject" | "merge";

export interface ReviewProposalInput {
  decision: ProposalDecision;
  title?: string;
  /** Present means use it (null = Unassigned); absent means the suggestion. */
  assigneeId?: string | null;
  dueDate?: string | null;
  mergeIntoTaskId?: string;
  confirmWithoutQuote?: boolean;
  priority?: TaskPriority;
}

export interface ReviewProposalResponse {
  task?: Task;
  item?: { id: string };
}

export interface TaskPatchInput {
  status?: TaskStatus;
  position?: number;
  assigneeId?: string | null;
  title?: string;
  description?: string | null;
  dueDate?: string | null;
  priority?: TaskPriority;
  completionEvidence?: string;
  ifVersion: number;
}
