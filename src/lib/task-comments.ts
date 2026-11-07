import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { UNKNOWN_MEMBER, lookupProfiles } from "@/lib/projects";
import type { TaskComment } from "@/lib/task-types";

// A task's comments (spec 0004 AC-70r). Callers keep these from Viewers.

const COMMENTS_SHOWN = 50;

export const TASK_COMMENT_SELECT = "id, author_id, body, created_at";

export type TaskCommentRow = {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
};

export function toTaskComment(
  row: TaskCommentRow,
  names: Map<string, { name: string }>,
): TaskComment {
  const name = names.get(row.author_id)?.name;
  return {
    id: row.id,
    authorId: row.author_id,
    // A removed member's comments stay, and Clerk may no longer know them.
    authorName: !name || name === UNKNOWN_MEMBER ? "Former member" : name,
    body: row.body,
    createdAt: row.created_at,
  };
}

/** The latest 50, newest first, and whether older ones were left out. */
export async function readTaskComments(
  supabase: SupabaseClient,
  taskId: string,
): Promise<{ comments: TaskComment[]; commentsTruncated: boolean }> {
  const { data, error } = await supabase
    .from("task_comments")
    .select(TASK_COMMENT_SELECT)
    .eq("task_id", taskId)
    .order("created_at", { ascending: false })
    .limit(COMMENTS_SHOWN + 1);
  if (error) throw error;
  const rows = (data ?? []) as TaskCommentRow[];
  const shown = rows.slice(0, COMMENTS_SHOWN);
  const names = await lookupProfiles(shown.map((row) => row.author_id));
  return {
    comments: shown.map((row) => toTaskComment(row, names)),
    commentsTruncated: rows.length > COMMENTS_SHOWN,
  };
}
