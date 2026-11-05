// The board's role matrix (spec 0004, AC-39, AC-40). Browser safe, so the
// board greys out the same moves the route refuses.

import type { ProjectRole } from "@/lib/project-types";
import type { TaskStatus } from "@/lib/tasks";

export type TaskRuleHead = {
  status: string;
  assignee_id: string | null;
};

export type TaskRulePatch = {
  status?: TaskStatus;
  assigneeId?: string | null;
};

export function isManagerRole(role: ProjectRole): boolean {
  return role === "owner" || role === "admin";
}

/** The 403 message for this change, or null when the role allows it. */
export function patchDenial(
  role: ProjectRole,
  userId: string,
  head: TaskRuleHead,
  patch: TaskRulePatch,
): string | null {
  if (role === "viewer") return "Viewers can't change tasks";
  const manager = isManagerRole(role);
  const reopening =
    head.status === "completed" &&
    patch.status !== undefined &&
    patch.status !== "completed";
  if (reopening && !manager) return "Only an Owner or Admin can reopen a task";
  if (manager) return null;

  if (head.assignee_id !== null && head.assignee_id !== userId) {
    return "You can only change your own or unassigned tasks";
  }
  if (patch.assigneeId !== undefined && patch.assigneeId !== head.assignee_id) {
    const takeIt = head.assignee_id === null && patch.assigneeId === userId;
    const dropIt = head.assignee_id === userId && patch.assigneeId === null;
    if (!takeIt && !dropIt) return "You can only assign a task to yourself";
  }
  return null;
}
