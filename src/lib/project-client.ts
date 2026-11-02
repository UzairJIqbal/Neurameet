// Browser side wrappers for the project routes. Each call throws a
// ProjectClientError carrying the server's message and status, so a page can
// show the exact 422 or 409 text it got back.

import type {
  ProjectDetailResponse,
  ProjectListResponse,
  ProjectMembersResponse,
  ProjectRole,
  ProjectSummary,
} from "@/lib/project-types";

export class ProjectClientError extends Error {
  constructor(
    public status: number,
    message: string,
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
    );
  }
  return data as T;
}

const base = (id: string) => `/api/projects/${encodeURIComponent(id)}`;

export function listProjects(signal?: AbortSignal) {
  return request<ProjectListResponse>("/api/projects", { signal });
}

export function createProject(name: string, taskPrefix: string) {
  return request<{ project: ProjectSummary }>("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name, taskPrefix }),
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

export function deleteProject(id: string, confirmName: string) {
  return request<{ ok: true }>(base(id), {
    method: "DELETE",
    body: JSON.stringify({ confirmName }),
  });
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
