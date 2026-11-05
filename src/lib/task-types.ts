// Task and proposal shapes for the routes and the UI (no server-only imports).

import type { TaskStatus } from "@/lib/tasks";
import type { TaskPrLink } from "@/lib/github-types";

export interface Task {
  id: string;
  key: string;
  number: number;
  title: string;
  description: string | null;
  status: TaskStatus;
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
  | "proposal_merged";

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

export interface TaskDetailResponse {
  task: Task;
  events: TaskEvent[];
  prLinks: TaskPrLink[];
  proofChain: TaskProofChain;
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
  completionEvidence?: string;
  ifVersion: number;
}
