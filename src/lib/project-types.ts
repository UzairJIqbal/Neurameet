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

export interface ProjectMember {
  userId: string;
  role: ProjectRole;
  joinedAt: string;
  name: string;
  email: string | null;
}

export interface ProjectListResponse {
  projects: ProjectSummary[];
}

export interface ProjectDetailResponse {
  project: ProjectDetail;
}

export interface ProjectMembersResponse {
  members: ProjectMember[];
  myRole: ProjectRole;
  me: string;
}

/** Prefix suggested from a project name: its capitals, else first letters. */
export function suggestTaskPrefix(name: string): string {
  const capitals = name.replace(/[^A-Z]/g, "");
  if (capitals.length >= 2) return capitals.slice(0, 5);
  const initials = name
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z]/g, "").charAt(0))
    .join("")
    .toUpperCase();
  if (initials.length >= 2) return initials.slice(0, 5);
  return name
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase()
    .slice(0, 3);
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

export interface InvitePreview {
  projectName: string;
  role: InviteRole;
  kind: InviteKind;
  status: InviteStatus;
  /** Only when status is "member", so the page can link to the project. */
  projectId?: string;
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
