// Browser side wrappers for the project routes. Each call throws a
// ProjectClientError carrying the server's message and status, so a page can
// show the exact 422 or 409 text it got back.

import type {
  AcceptInviteResponse,
  CreateInvitationResponse,
  InvitationListResponse,
  InvitePreview,
  InviteKind,
  InviteRole,
  JoinRequestListResponse,
  MyInvitationDecision,
  MyInvitationDecisionResponse,
  MyInvitationsResponse,
  ProjectDetailResponse,
  ProjectListResponse,
  ProjectMembersResponse,
  ProjectRole,
  ProjectCard,
  ProjectInput,
  ProjectPatch,
  ResendInvitationResponse,
} from "@/lib/project-types";
import type {
  MyTasksResponse,
  ProposalsResponse,
  ReviewProposalInput,
  ReviewProposalResponse,
  TaskCommentResponse,
  TaskCommitsResponse,
  TaskDetailResponse,
  TaskPatchInput,
  TaskResponse,
  TasksResponse,
} from "@/lib/task-types";
import type { TaskPriority } from "@/lib/tasks";
import type {
  GitHubReposResponse,
  GitHubSummaryResponse,
  GitHubSyncResult,
} from "@/lib/github-types";
import type {
  ActivityResponse,
  ProjectLedgerResponse,
} from "@/lib/proof-types";
import type {
  MeetingListItem,
  MeetingPrepSuggestions,
  PrepLedgerItem,
} from "@/lib/meeting-types";

export class ProjectClientError extends Error {
  constructor(
    public status: number,
    message: string,
    /** The parsed error body, e.g. the fresh task a 409 carries. */
    public data: unknown = null,
  ) {
    super(message);
    this.name = "ProjectClientError";
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body
      ? { "Content-Type": "application/json", ...init.headers }
      : init?.headers,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new ProjectClientError(
      res.status,
      data.error ?? `Request failed (${res.status})`,
      data,
    );
  }
  return data as T;
}

const base = (id: string) => `/api/projects/${encodeURIComponent(id)}`;

export function listProjects(signal?: AbortSignal) {
  return request<ProjectListResponse>("/api/projects", { signal });
}

export function createProject(input: ProjectInput) {
  return request<{ project: ProjectCard }>("/api/projects", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getProject(id: string, signal?: AbortSignal) {
  return request<ProjectDetailResponse>(base(id), { signal });
}

export function renameProject(id: string, name: string) {
  return request<{ ok: true; name: string }>(base(id), {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function updateProject(id: string, patch: ProjectPatch) {
  return request<{ ok: true }>(base(id), {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteProject(id: string, confirmName: string) {
  return request<{ ok: true }>(base(id), {
    method: "DELETE",
    body: JSON.stringify({ confirmName }),
  });
}

export function listMyTasks(signal?: AbortSignal) {
  return request<MyTasksResponse>("/api/my-tasks", { signal });
}

export function listMembers(id: string, signal?: AbortSignal) {
  return request<ProjectMembersResponse>(`${base(id)}/members`, { signal });
}

export function changeMemberRole(
  id: string,
  userId: string,
  role: ProjectRole,
) {
  return request<{ ok: true; role: ProjectRole }>(
    `${base(id)}/members/${encodeURIComponent(userId)}`,
    { method: "PATCH", body: JSON.stringify({ role }) },
  );
}

export function removeMember(id: string, userId: string) {
  return request<{ ok: true }>(
    `${base(id)}/members/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );
}

export function transferOwnership(id: string, userId: string) {
  return request<{ ok: true }>(`${base(id)}/transfer`, {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
}

// ---- W2. Invitations and join requests ----

export function createInvitation(
  id: string,
  input: { kind: InviteKind; email?: string; role: InviteRole },
) {
  return request<CreateInvitationResponse>(`${base(id)}/invitations`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listInvitations(id: string, signal?: AbortSignal) {
  return request<InvitationListResponse>(`${base(id)}/invitations`, { signal });
}

export function revokeInvitation(id: string, invitationId: string) {
  return request<{ ok: true }>(
    `${base(id)}/invitations/${encodeURIComponent(invitationId)}`,
    { method: "DELETE" },
  );
}

export function resendInvitation(id: string, invitationId: string) {
  return request<ResendInvitationResponse>(
    `${base(id)}/invitations/${encodeURIComponent(invitationId)}/resend`,
    { method: "POST" },
  );
}

export function listJoinRequests(id: string, signal?: AbortSignal) {
  return request<JoinRequestListResponse>(`${base(id)}/join-requests`, {
    signal,
  });
}

export function decideJoinRequest(
  id: string,
  requestId: string,
  decision: "approve" | "deny",
) {
  return request<{ request: { id: string; status: string } }>(
    `${base(id)}/join-requests/${encodeURIComponent(requestId)}`,
    { method: "POST", body: JSON.stringify({ decision }) },
  );
}

export function previewInvitation(token: string, signal?: AbortSignal) {
  return request<InvitePreview>(
    `/api/invitations/preview?token=${encodeURIComponent(token)}`,
    { signal },
  );
}

export function acceptInvitation(token: string) {
  return request<AcceptInviteResponse>("/api/invitations/accept", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function listMyInvitations(signal?: AbortSignal) {
  return request<MyInvitationsResponse>("/api/invitations/mine", { signal });
}

export function decideMyInvitation(id: string, decision: MyInvitationDecision) {
  return request<MyInvitationDecisionResponse>(
    `/api/invitations/mine/${encodeURIComponent(id)}`,
    { method: "POST", body: JSON.stringify({ decision }) },
  );
}

// ---- W4: proposals, tasks, moving a meeting in ----

export function listProposals(id: string, signal?: AbortSignal) {
  return request<ProposalsResponse>(`${base(id)}/proposals`, { signal });
}

export function reviewProposal(proposalId: string, input: ReviewProposalInput) {
  return request<ReviewProposalResponse>(
    `/api/proposals/${encodeURIComponent(proposalId)}/review`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export type TaskFilters = {
  status?: string;
  priority?: string;
  assigneeId?: string;
  q?: string;
};

export function listTasks(
  id: string,
  filters: TaskFilters = {},
  signal?: AbortSignal,
) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
  const qs = params.toString();
  return request<TasksResponse>(`${base(id)}/tasks${qs ? `?${qs}` : ""}`, {
    signal,
  });
}

export function createTask(
  id: string,
  input: {
    title: string;
    description?: string | null;
    assigneeId?: string | null;
    dueDate?: string | null;
    priority?: TaskPriority;
  },
) {
  return request<TaskResponse>(`${base(id)}/tasks`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getTask(taskId: string, signal?: AbortSignal) {
  return request<TaskDetailResponse>(
    `/api/tasks/${encodeURIComponent(taskId)}`,
    { signal },
  );
}

export function addTaskComment(taskId: string, body: string) {
  return request<TaskCommentResponse>(
    `/api/tasks/${encodeURIComponent(taskId)}/comments`,
    { method: "POST", body: JSON.stringify({ body }) },
  );
}

export function deleteTaskComment(taskId: string, commentId: string) {
  return request<{ ok: true }>(
    `/api/tasks/${encodeURIComponent(taskId)}/comments/${encodeURIComponent(commentId)}`,
    { method: "DELETE" },
  );
}

export function getTaskCommits(taskId: string, signal?: AbortSignal) {
  return request<TaskCommitsResponse>(
    `/api/tasks/${encodeURIComponent(taskId)}/commits`,
    { signal },
  );
}

export function updateTask(taskId: string, input: TaskPatchInput) {
  return request<TaskResponse>(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function moveMeetingToProject(meetingId: string, projectId: string) {
  return request<{ meetingId: string; projectId: string }>(
    `/api/meetings/${encodeURIComponent(meetingId)}/project`,
    { method: "POST", body: JSON.stringify({ projectId }) },
  );
}

// ---- W5: GitHub ----

export function listGitHubRepos(id: string, signal?: AbortSignal) {
  return request<GitHubReposResponse>(`${base(id)}/github/repos`, { signal });
}

export function linkGitHubRepo(id: string, repoId: number) {
  return request<{ ok: true; repoId: number }>(`${base(id)}/github/repos`, {
    method: "POST",
    body: JSON.stringify({ repoId }),
  });
}

export function unlinkGitHubRepo(id: string, repoId: number) {
  return request<{ ok: true }>(`${base(id)}/github/repos/${repoId}`, {
    method: "DELETE",
  });
}

export function getGitHubSummary(id: string, signal?: AbortSignal) {
  return request<GitHubSummaryResponse>(`${base(id)}/github/summary`, {
    signal,
  });
}

export function syncGitHub(id: string) {
  return request<GitHubSyncResult>(`${base(id)}/github/sync`, {
    method: "POST",
  });
}

// ===== W6: Proof Chain =====

export function listProjectMeetings(id: string, signal?: AbortSignal) {
  return request<{ meetings: MeetingListItem[] }>(
    `/api/meetings?projectId=${encodeURIComponent(id)}`,
    { signal },
  );
}

/** Runs the AI only when you ask (AC-70b): call this from a click, never on load. */
export function prepareMeeting(title: string) {
  return request<{
    suggestions: MeetingPrepSuggestions;
    ledgerItems?: PrepLedgerItem[];
  }>("/api/prep", { method: "POST", body: JSON.stringify({ title }) });
}

export function getProjectLedger(
  id: string,
  filters: {
    kind?: string;
    status?: string;
    meetingId?: string;
    q?: string;
    tag?: string;
    cursor?: string | null;
  },
  signal?: AbortSignal,
) {
  const params = new URLSearchParams();
  if (filters.kind) params.set("kind", filters.kind);
  if (filters.status) params.set("status", filters.status);
  if (filters.meetingId) params.set("meetingId", filters.meetingId);
  if (filters.q) params.set("q", filters.q);
  if (filters.tag) params.set("tag", filters.tag);
  if (filters.cursor) params.set("cursor", filters.cursor);
  const query = params.toString();
  return request<ProjectLedgerResponse>(
    `${base(id)}/ledger${query ? `?${query}` : ""}`,
    { signal },
  );
}

export function listActivity(
  id: string,
  before: string | null,
  signal?: AbortSignal,
  filters: { category?: string; actorId?: string } = {},
) {
  const params = new URLSearchParams();
  if (before) params.set("before", before);
  if (filters.category) params.set("category", filters.category);
  if (filters.actorId) params.set("actorId", filters.actorId);
  const query = params.toString();
  return request<ActivityResponse>(
    `${base(id)}/activity${query ? `?${query}` : ""}`,
    { signal },
  );
}
