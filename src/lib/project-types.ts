// Shared project shapes for the routes and the UI (no server-only imports).

export type ProjectRole = "owner" | "admin" | "developer" | "viewer";

export const ROLE_LABELS: Record<ProjectRole, string> = {
  owner: "Owner",
  admin: "Admin",
  developer: "Developer",
  viewer: "Viewer",
};

export const PROJECT_NAME_MAX = 80;
export const TASK_PREFIX_PATTERN = /^[A-Z]{2,5}$/;

export interface ProjectSummary {
  id: string;
  name: string;
  taskPrefix: string;
  role: ProjectRole;
  memberCount: number;
  createdAt: string;
}

export interface ProjectDetail extends ProjectSummary {
  meetingCount: number;
}

// AC-70h: the only values a project's status, type, icon, and color can take.
// A color is a token key and an icon a lucide name, never free text.
export const PROJECT_DESCRIPTION_MAX = 500;
export const PROJECT_STATUSES = [
  "active",
  "planning",
  "on_hold",
  "completed",
] as const;
export const PROJECT_TYPES = [
  "web",
  "mobile",
  "ai_ml",
  "backend",
  "other",
] as const;
export const PROJECT_ICONS = [
  "folder",
  "code",
  "smartphone",
  "brain",
  "server",
  "globe",
  "rocket",
  "database",
] as const;
export const PROJECT_COLORS = [
  "primary",
  "secondary",
  "tertiary",
  "success",
  "warning",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type ProjectType = (typeof PROJECT_TYPES)[number];
export type ProjectIcon = (typeof PROJECT_ICONS)[number];
export type ProjectColor = (typeof PROJECT_COLORS)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Active",
  planning: "Planning",
  on_hold: "On Hold",
  completed: "Completed",
};

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  web: "Web Application",
  mobile: "Mobile Application",
  ai_ml: "AI / Machine Learning",
  backend: "Backend System",
  other: "Other",
};

export type ProjectDetails = {
  description: string | null;
  status: ProjectStatus;
  projectType: ProjectType;
  icon: ProjectIcon;
  color: ProjectColor;
};

export type ProjectAvatar = { name: string; imageUrl: string | null };

/** connected with no name means a repo this reader may not see named. */
export type ProjectRepoLine = { connected: boolean; name: string | null };

/** One My Projects card (AC-77d). */
export interface ProjectCard extends ProjectSummary, ProjectDetails {
  ownerName: string;
  repo: ProjectRepoLine;
  taskTotal: number;
  taskCompleted: number;
  nextMeeting: { title: string; startedAt: string } | null;
  updatedAt: string;
  avatars: ProjectAvatar[];
}

export type ProjectTaskStatusKey =
  "todo" | "in_progress" | "in_review" | "completed" | "blocked";

/** The project page's data. A count that failed to load is null (AC-70g). */
export interface ProjectFull extends ProjectDetail, ProjectDetails {
  ownerName: string;
  avatars: ProjectAvatar[];
  taskTotals: Record<ProjectTaskStatusKey, number> | null;
  openTaskCount: number | null;
  overdueTaskCount: number | null;
  upcomingMeetingCount: number | null;
  processedMeetingCount: number | null;
  decisionCount: number | null;
  /** Never sent to a Viewer. */
  linkedPrCount: number | null;
  github: {
    connected: boolean;
    /** A Viewer gets public repos only. */
    repos: Array<{ fullName: string; private: boolean }>;
    lastSyncedAt: string | null;
  };
}

export type ProjectInput = {
  name: string;
  taskPrefix: string;
  description?: string;
  projectType?: ProjectType;
  icon?: ProjectIcon;
  color?: ProjectColor;
};

export type ProjectPatch = {
  name?: string;
  description?: string | null;
  status?: ProjectStatus;
  projectType?: ProjectType;
  icon?: ProjectIcon;
  color?: ProjectColor;
};

export interface ProjectMember {
  userId: string;
  role: ProjectRole;
  joinedAt: string;
  name: string;
  email: string | null;
  imageUrl: string | null;
  /** Only when this member connected a GitHub account. */
  githubLogin: string | null;
  openTaskCount: number;
}

export interface ProjectListResponse {
  projects: ProjectCard[];
}

export interface ProjectDetailResponse {
  project: ProjectFull;
}

export interface ProjectMembersResponse {
  members: ProjectMember[];
  myRole: ProjectRole;
  me: string;
}

/** Prefix suggested from a project name: first letters of up to 5 words. */
export function suggestTaskPrefix(name: string): string {
  const words = name
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z]/g, ""))
    .filter(Boolean);
  const initials = words
    .slice(0, 5)
    .map((w) => w.charAt(0))
    .join("")
    .toUpperCase();
  if (initials.length >= 2) return initials;
  // One word: at least 2 letters are still needed, so take its first few.
  return (words[0] ?? "").toUpperCase().slice(0, 3);
}

/** Roles a caller may set on someone else (the server checks again). */
export function assignableRoles(
  myRole: ProjectRole,
  targetRole: ProjectRole,
): ProjectRole[] {
  if (targetRole === "owner") return [];
  if (myRole === "owner") return ["admin", "developer", "viewer"];
  if (myRole === "admin" && targetRole !== "admin") {
    return ["developer", "viewer"];
  }
  return [];
}

/** Whether a caller may remove someone else (the server checks again). */
export function canRemoveMember(
  myRole: ProjectRole,
  targetRole: ProjectRole,
): boolean {
  if (targetRole === "owner") return false;
  if (myRole === "owner") return true;
  return (
    myRole === "admin" &&
    (targetRole === "developer" || targetRole === "viewer")
  );
}

// ---- W2. Invitations and join requests (spec 0004-invitations) ----

export type InviteKind = "email" | "link";
export type InviteRole = Exclude<ProjectRole, "owner">;
export type InviteStatus = "valid" | "member" | "pending";

export interface InvitationSummary {
  id: string;
  kind: InviteKind;
  email: string | null;
  role: InviteRole;
  expiresAt: string;
  createdAt: string;
  createdByName: string;
}

export interface InvitationListResponse {
  invitations: InvitationSummary[];
}

export interface CreateInvitationResponse {
  invitation: {
    id: string;
    kind: InviteKind;
    email: string | null;
    role: InviteRole;
    expiresAt: string;
  };
  link: string;
  emailSent: boolean;
}

export interface ResendInvitationResponse {
  /** Shows once. The old link stopped working. */
  link: string;
  emailed: boolean;
}

export interface InvitePreview {
  projectName: string;
  role: InviteRole;
  kind: InviteKind;
  status: InviteStatus;
  /** Only when status is "member", so the page can link to the project. */
  projectId?: string;
  inviterName: string;
  description: string | null;
  icon: ProjectIcon;
  color: ProjectColor;
  memberCount: number;
  taskCount: number;
  meetingCount: number;
  createdAt: string;
  invitedAt: string;
  repoConnected: boolean;
  /** Only for a public repo. */
  repoName?: string;
  /** Only on an email invite whose address matches your verified email. */
  team?: ProjectAvatar[];
  invitationId?: string;
}

/** An active email invite for your verified email. Never carries a token. */
export interface MyInvitation {
  id: string;
  projectId: string;
  projectName: string;
  description: string | null;
  icon: ProjectIcon;
  color: ProjectColor;
  role: InviteRole;
  inviterName: string;
  invitedAt: string;
  expiresAt: string;
}

export interface MyInvitationsResponse {
  invitations: MyInvitation[];
}

export type MyInvitationDecision = "accept" | "decline";

export interface MyInvitationDecisionResponse {
  status: "joined" | "declined";
  projectId: string;
}

export interface AcceptInviteResponse {
  status: "joined" | "pending";
  projectId: string;
}

export interface JoinRequestSummary {
  id: string;
  displayName: string;
  email: string | null;
  role: InviteRole;
  createdAt: string;
}

export interface JoinRequestListResponse {
  requests: JoinRequestSummary[];
}

/** Roles a caller may put on a new invite (the server checks again, AC-14). */
export function inviteRoleOptions(
  myRole: ProjectRole,
  kind: InviteKind,
): InviteRole[] {
  if (myRole === "owner" && kind === "email") {
    return ["admin", "developer", "viewer"];
  }
  if (myRole === "owner" || myRole === "admin") return ["developer", "viewer"];
  return [];
}

export const canManageInvites = (role: ProjectRole): boolean =>
  role === "owner" || role === "admin";
