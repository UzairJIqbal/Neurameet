// Response shapes for the Proof Chain surfaces (spec 0004, W6). Browser safe.

import type {
  LedgerDerivedStatus,
  LedgerItem,
  LedgerLinkPr,
  LedgerLinkState,
  LedgerRelation,
} from "@/lib/meeting-types";

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

export interface ActivityResponse {
  rows: ActivityRow[];
  nextBefore: string | null;
}
