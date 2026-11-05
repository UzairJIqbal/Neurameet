import type { ProjectRole } from "@/lib/project-types";

export interface MeetingListItem {
  id: string;
  title: string;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  category: string | null;
  hasInsights: boolean;
  streamCallId: string;
  /** Phase W: null for a personal meeting. */
  projectId?: string | null;
  /** Phase W: the caller's project role, null for a personal meeting. */
  role?: ProjectRole | null;
}

export type GuestAdmissionMode = "open" | "approval";

export interface MeetingDetailData {
  id: string;
  title: string;
  status: string;
  streamCallId: string;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  user_id: string;
  guestAdmissionMode: GuestAdmissionMode;
}

export interface MeetingInsights {
  summary: string | null;
  keyPoints: string[];
  decisions: string[];
  category: string | null;
  detectedTopics: string[];
}

export interface ActionItem {
  id: string;
  title: string;
  assignee: string | null;
  dueDate: string | null;
}

export interface MeetingDetailResponse {
  meeting: MeetingDetailData;
  insights: MeetingInsights | null;
  actionItems: ActionItem[];
  attendanceCount: number;
  /** Phase W: null for a personal meeting. */
  projectId?: string | null;
  /** W3: the project name for members, null for a personal meeting. */
  projectName?: string | null;
  /** Phase W: the caller's project role, null for a personal meeting. */
  role?: ProjectRole | null;
  /** Host controls: the creator on a personal meeting, Owner or Admin on a project meeting. */
  canManage?: boolean;
}

export type FollowUpStatus = "pending" | "needs_attention" | "completed";
export type FollowUpPriority = "low" | "medium" | "high";

export type MeetingCategory =
  "Product" | "Engineering" | "Sales" | "Design" | "Operations" | "General";

export const MEETING_CATEGORIES: MeetingCategory[] = [
  "Product",
  "Engineering",
  "Sales",
  "Design",
  "Operations",
  "General",
];

export interface AttendanceRow {
  id: string;
  userId: string;
  participantEmail: string | null;
  participantName: string | null;
  sessionStartedAt: string;
  sessionEndedAt: string | null;
  micToggles: number;
  cameraToggles: number;
  talkTimeSeconds: number;
}

export interface FollowUpItem {
  id: string;
  meetingId: string;
  actionItemId: string;
  status: FollowUpStatus;
  priority: FollowUpPriority;
  notes: string | null;
  updatedAt: string;
  meetingTitle: string | null;
  actionTitle: string | null;
  assignee: string | null;
  dueDate: string | null;
}

export interface FollowUpDetail extends FollowUpItem {
  meetingStatus: string | null;
  meetingStartedAt: string | null;
}

export interface SpeakerInsight {
  name: string;
  email: string | null;
  present: boolean; // appears in attendance_events
  sessions: number; // number of attendance rows aggregated
  totalTalkTimeSeconds: number; // summed talk_time_seconds
  totalDurationSeconds: number; // summed (ended_at - started_at) for ended rows
  talkTimeRatio: number; // totalTalkTimeSeconds / totalDurationSeconds (0 if no duration)
  micToggles: number;
  cameraToggles: number;
  contributions: string[]; // AI from transcript; [] if no transcript / not found
  keyTopics: string[]; // AI from transcript; [] if none
  lowEngagement: boolean;
  lowEngagementReason: string | null;
}

export interface SpeakerEngagementResponse {
  meetingId: string;
  hasTranscript: boolean;
  hasAttendance: boolean;
  overallSummary: string; // AI overall takeaway; fallback note when no transcript
  speakers: SpeakerInsight[];
}

// Promise Ledger (spec 0001). Stored item status; "overdue" is derived at read
// time from the client's local date and is never stored.
export type LedgerKind = "decision" | "promise";
export type LedgerQuoteLanguage = "en" | "ur" | "mixed";
export type LedgerItemStatus = "open" | "kept" | "reversed";
export type LedgerDerivedStatus = LedgerItemStatus | "overdue";
export type LedgerRelation = "kept" | "reversed";
export type LedgerLinkState = "suggested" | "confirmed" | "rejected";
export type LedgerReviewDecision = "confirm" | "reject" | "reset";
// Live Ledger (spec 0002): where an item came from, and the owner's live mark.
export type LedgerItemSource = "transcript" | "live_agreement";
export type LedgerLiveMark = "kept" | "open" | "reversed";

export interface LedgerItem {
  id: string;
  meetingId: string;
  actionItemId: string | null;
  kind: LedgerKind;
  statement: string;
  quote: string;
  quoteLanguage: LedgerQuoteLanguage;
  speaker: string | null;
  assignee: string | null;
  dueDate: string | null;
  lineNumber: number;
  status: LedgerItemStatus;
  createdAt: string;
  source: LedgerItemSource;
  /** Live Agreement items only: "agreed by N of M". */
  agreedCount: number | null;
  totalCount: number | null;
}

/** A merged PR behind a code link. Viewers never get it. */
export interface LedgerLinkPr {
  repoFullName: string;
  prNumber: number;
  prUrl: string;
  reverted: boolean;
}

export interface LedgerLink {
  id: string;
  itemId: string;
  evidenceKind: "meeting" | "code";
  /** Null on a code link, which has no meeting and no transcript line. */
  evidenceMeetingId: string | null;
  relation: LedgerRelation;
  /** On a code link this is the PR title, blank for Viewers. */
  quote: string;
  speaker: string | null;
  lineNumber: number | null;
  confidence: number;
  state: LedgerLinkState;
  decidedAt: string | null;
  createdAt: string;
  pr?: LedgerLinkPr;
}

export interface LedgerItemView extends LedgerItem {
  derivedStatus: LedgerDerivedStatus;
  links: LedgerLink[];
  /** The latest live mark on this item from a later call, if any. */
  liveMark: LedgerLiveMark | null;
}

export interface LedgerIncomingLink extends LedgerLink {
  item: LedgerItem;
  sourceMeeting: { id: string; title: string; startedAt: string };
  /** The owner's live mark on this item during this meeting, if any. */
  liveMark: LedgerLiveMark | null;
}

/** A live mark made in this meeting that no transcript link backs (AC-15). */
export interface LedgerLiveOnlyMark {
  mark: LedgerLiveMark;
  item: LedgerItem;
  sourceMeeting: { id: string; title: string; startedAt: string };
}

export interface LedgerResponse {
  items: LedgerItemView[];
  incoming: LedgerIncomingLink[];
  liveOnly: LedgerLiveOnlyMark[];
  reversalCount: number;
}

// Prep hook (spec 0001, AC-15): open ledger items related to an upcoming
// meeting, ranked by similarity, never generated by the LLM.
export interface PrepLedgerItem {
  id: string;
  kind: LedgerKind;
  statement: string;
  quote: string;
  assignee: string | null;
  dueDate: string | null;
  derivedStatus: "open" | "overdue";
  sourceMeeting: { id: string; title: string; startedAt: string };
}
