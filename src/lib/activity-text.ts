// The sentence for one Activity row. Pure and browser safe, so a test can check
// every kind and the tab never builds wording of its own.

import { TASK_STATUS_LABELS, isTaskStatus } from "@/lib/tasks";
import type { ActivityRow } from "@/lib/proof-types";

const ROLE_WORDS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  developer: "Developer",
  viewer: "Viewer",
};

const statusWord = (value: string | null | undefined) =>
  value && isTaskStatus(value) ? TASK_STATUS_LABELS[value] : "another status";

export function activitySentence(row: ActivityRow): string {
  const actor = row.actorName ?? "Someone";
  const key = row.taskKey ?? "a task";
  const member = row.memberName ?? "a person";

  switch (row.kind) {
    case "task.created":
      return `${actor} created ${key}`;
    case "task.edited":
      return `${actor} changed the ${row.field ?? "details"} on ${key}`;
    case "task.status_changed":
      return `${actor} moved ${key} from ${statusWord(row.from)} to ${statusWord(row.to)}`;
    case "task.assigned":
      return `${actor} assigned ${key} to ${row.to ?? "a person"}`;
    case "task.unassigned":
      return `${actor} unassigned ${key}`;
    case "task.completed_manual":
      return `${actor} completed ${key} by hand`;
    case "task.completed_by_merge":
      return `${key} completed by a merged PR`;
    case "task.reopened_by_revert":
      return `${key} reopened, its PR was reverted`;
    case "task.pr_linked":
      return `A PR was linked to ${key}`;
    case "task.pr_state_changed":
      return `A PR on ${key} is now ${row.to ?? "changed"}`;
    case "task.proposal_merged":
      return `A promise was merged into ${key}`;
    case "meeting.created":
      return `${actor} added a meeting`;
    case "meeting.moved":
      return `${actor} moved a meeting into the project`;
    case "ledger.kept_confirmed":
      return `${actor} confirmed a promise as kept`;
    case "ledger.reversed_confirmed":
      return `${actor} confirmed a promise as reversed`;
    case "project.created":
      return `${actor} created the project`;
    case "project.ownership_transferred":
      return `${actor} transferred ownership to ${member}`;
    case "member.joined":
      return `${member} joined`;
    case "member.left":
      return `${member} left`;
    case "member.restored":
      return `${member} was restored`;
    case "member.removed":
      return `${actor} removed ${member}`;
    case "member.role_changed":
      return `${actor} changed ${member}'s role to ${ROLE_WORDS[row.to ?? ""] ?? "another role"}`;
    case "repo.linked":
      return `${actor} linked a repository`;
    case "repo.unlinked":
      return `${actor} unlinked a repository`;
    default:
      return "Something changed";
  }
}

/** The smaller line under a sentence, when the row has something to add. */
export function activityDetail(row: ActivityRow): string | null {
  if (row.itemStatement) return row.itemStatement;
  if (row.meetingTitle) return row.meetingTitle;
  if (row.taskTitle) return row.taskTitle;
  if (row.kind === "task.edited" && (row.from || row.to)) {
    return `${row.from || "None"} to ${row.to || "None"}`;
  }
  return null;
}
