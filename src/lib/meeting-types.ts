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

export interface MeetingDetailData {
  id: string;
  title: string;
  status: string;
  streamCallId: string;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
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
