import type { ProjectRole } from "@/lib/project-types";

export const PROJECT_MEETING_TYPES = [
  "code_review",
  "sprint_planning",
  "architecture",
  "standup",
  "other",
] as const;

export type ProjectMeetingType = (typeof PROJECT_MEETING_TYPES)[number];

export const MEETING_TYPE_LABELS: Record<ProjectMeetingType, string> = {
  code_review: "Code Review",
  sprint_planning: "Sprint Planning",
  architecture: "Architecture",
  standup: "Standup",
  other: "Other",
};

export const MEETING_DESCRIPTION_MAX = 1000;

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
  description?: string | null;
  scheduledEndAt?: string | null;
  meetingType?: ProjectMeetingType | null;
  organizerName?: string;
  /** Display and notice only, never who may join. */
  invitedUserIds?: string[];
  /** On a `?projectId=` list only. */
  summaryExcerpt?: string | null;
  /** A Viewer counts confirmed items only. */
  actionItemCount?: number;
  /** Never sent to a Viewer. */
  proposalCount?: number;
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
  description: string | null;
  scheduledEndAt: string | null;
  meetingType: ProjectMeetingType | null;
  organizerName: string;
  /** Display and notice only, never who may join. */
  invitedUserIds: string[];
}

export interface MeetingInsights {
  summary: string | null;
  keyPoints: string[];
  decisions: string[];
  category: string | null;
  detectedTopics: string[];
}

export type ActionItemReviewState =
  "auto" | "proposed" | "confirmed" | "rejected";

export interface ActionItem {
  id: string;
  title: string;
  assignee: string | null;
  dueDate: string | null;
  reviewState: ActionItemReviewState;
  /** Personal meetings only: the follow-up made from this item, if any. */
  followUpId?: string | null;
  followUpStatus?: FollowUpStatus | null;
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
  /** Never sent to a Viewer. Null when the meeting has no transcript. */
  transcriptText?: string | null;
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
  /** started_at, falling back to created_at, so groups can be sorted. */
  meetingStartedAt: string | null;
  actionTitle: string | null;
  assignee: string | null;
  dueDate: string | null;
}

export interface FollowUpDetail extends FollowUpItem {
  meetingStatus: string | null;
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

/** What POST /api/prep returns (types the Prep page and the Overview card share). */
export interface MeetingPrepSuggestions {
  context: string[];
  openActionItems: string[];
  discussionPoints: string[];
  questionsToAsk: string[];
}
