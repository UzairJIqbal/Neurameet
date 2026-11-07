import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// W8 AC-70d: the counts on the Meetings tab. They come from one project filter,
// paged past the default row cap, so a busy project still counts every row.

const PAGE = 1000;
const EXCERPT_LENGTH = 160;

export type MeetingStats = {
  decisions: number;
  actionItems: number;
  proposals: number;
};

export const summaryExcerpt = (summary: string | null | undefined) => {
  const text = summary?.trim();
  if (!text) return null;
  return text.length > EXCERPT_LENGTH
    ? `${text.slice(0, EXCERPT_LENGTH).trimEnd()}...`
    : text;
};

async function readAll<T>(
  readPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await readPage(from, from + PAGE - 1);
    if (error) throw error;
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

/** A Viewer's action items are confirmed ones, and proposals stay zero. */
export async function loadProjectMeetingStats(
  supabase: SupabaseClient,
  projectId: string,
  isViewer: boolean,
): Promise<Map<string, MeetingStats>> {
  const [decisions, actionItems] = await Promise.all([
    readAll<{ meeting_id: string }>((from, to) =>
      supabase
        .from("ledger_items")
        .select("id, meeting_id, meetings!inner(project_id)")
        .eq("meetings.project_id", projectId)
        .eq("kind", "decision")
        .order("id")
        .range(from, to),
    ),
    readAll<{ meeting_id: string; review_state: string }>((from, to) =>
      supabase
        .from("action_items")
        .select("id, meeting_id, review_state, meetings!inner(project_id)")
        .eq("meetings.project_id", projectId)
        .order("id")
        .range(from, to),
    ),
  ]);

  const stats = new Map<string, MeetingStats>();
  const statsOf = (meetingId: string) => {
    let row = stats.get(meetingId);
    if (!row) {
      row = { decisions: 0, actionItems: 0, proposals: 0 };
      stats.set(meetingId, row);
    }
    return row;
  };
  for (const row of decisions) statsOf(row.meeting_id).decisions += 1;
  for (const { meeting_id: id, review_state: state } of actionItems) {
    if (state === "rejected") continue;
    if (isViewer && state !== "confirmed") continue;
    statsOf(id).actionItems += 1;
    if (state === "proposed" && !isViewer) statsOf(id).proposals += 1;
  }
  return stats;
}
