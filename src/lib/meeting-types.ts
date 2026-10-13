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
}

export type FollowUpStatus = "pending" | "needs_attention" | "completed";
export type FollowUpPriority = "low" | "medium" | "high";

export type MeetingCategory =
  | "Product"
  | "Engineering"
  | "Sales"
  | "Design"
  | "Operations"
  | "General";

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
