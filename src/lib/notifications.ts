import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  escapeHtml,
  sendWorkspaceEmail,
  workspaceEmailConfigured,
} from "@/lib/email";
import { workspaceEmailsSentToday } from "@/lib/invitations";

// W8 notifications (spec 0004-workspace-shell, AC-71 to AC-74). One row per
// person per event; only a newly inserted row can send an email. A notification
// never blocks or fails the action that caused it, so `notify` never throws.

export const EVENT_EMAIL_DAILY_CAP = 60;
export const DIGEST_DAILY_CAP = 20;
export const CRON_SYNC_PROJECTS = 5;
export const CRON_RUN_MS = 50_000;
export const TASK_DUE_CAP = 200;

export const NOTIFICATION_CATEGORIES = {
  tasks: [
    "task_assigned",
    "task_due",
    "task_completed_by_merge",
    "task_reopened_by_revert",
    "proposals_ready",
  ],
  meetings: ["meeting_scheduled"],
  github: ["pr_review_requested", "kept_suggestion"],
  projects: [
    "join_request",
    "join_approved",
    "project_invitation",
    "member_role_changed",
    "member_joined",
  ],
} as const;

export type NotificationCategory = keyof typeof NOTIFICATION_CATEGORIES;
export type NotificationKind =
  (typeof NOTIFICATION_CATEGORIES)[NotificationCategory][number];

export type NotifyInput = {
  userIds: string[];
  projectId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string;
  dedupeKey: string;
  email?: boolean;
};

/** An app path only: one leading slash, never an outside or protocol relative URL. */
export const isAppPath = (link: string): boolean => /^\/(?!\/)/.test(link);

const CLERK_BATCH = 100;

/** Primary email per user id, read in batches at send time. */
export async function primaryEmails(
  userIds: string[],
): Promise<Map<string, string>> {
  const emails = new Map<string, string>();
  const client = await clerkClient();
  for (let i = 0; i < userIds.length; i += CLERK_BATCH) {
    const { data } = await client.users.getUserList({
      userId: userIds.slice(i, i + CLERK_BATCH),
      limit: CLERK_BATCH,
    });
    for (const user of data) {
      const address = user.primaryEmailAddress?.emailAddress;
      if (address) emails.set(user.id, address);
    }
  }
  return emails;
}

/** The users who turned email off. A missing row means on, as in DEFAULT_PREFS. */
async function usersWithEmailOff(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("user_id")
    .in("user_id", userIds)
    .eq("email_notifications", false);
  if (error) throw error;
  return new Set((data ?? []).map((r: { user_id: string }) => r.user_id));
}

const appUrl = (path: string): string =>
  `${process.env.NEXT_PUBLIC_APP_URL ?? ""}${path}`;

export const SETTINGS_EMAIL_PATH = "/settings?tab=notifications";

function eventEmailHtml(title: string, body: string, link: string): string {
  const href = escapeHtml(appUrl(link));
  const settings = escapeHtml(appUrl(SETTINGS_EMAIL_PATH));
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #1a1a1a;">${escapeHtml(title)}</h2>
      <p style="color: #444;">${escapeHtml(body)}</p>
      <p><a href="${href}">Open in NeuraMeet</a></p>
      <p style="color: #888; font-size: 12px;">
        You can turn these emails off in <a href="${settings}">Settings</a>.
      </p>
    </div>`;
}

type NewRow = { id: string; user_id: string };

// AC-74: only for new rows, only with a sender set, the recipient's toggle on,
// and today's shared budget not spent. A failed send leaves emailed_at null.
async function emailNewRows(
  supabase: SupabaseClient,
  rows: NewRow[],
  input: NotifyInput,
): Promise<void> {
  if (!workspaceEmailConfigured()) return;
  const userIds = rows.map((r) => r.user_id);
  const off = await usersWithEmailOff(supabase, userIds);
  const wanted = rows.filter((r) => !off.has(r.user_id));
  if (wanted.length === 0) return;

  let sent = await workspaceEmailsSentToday(supabase);
  if (sent === null || sent >= EVENT_EMAIL_DAILY_CAP) return;
  const emails = await primaryEmails(wanted.map((r) => r.user_id));
  const html = eventEmailHtml(input.title, input.body, input.link);

  for (const row of wanted) {
    if (sent >= EVENT_EMAIL_DAILY_CAP) return;
    const to = emails.get(row.user_id);
    if (!to) continue;
    if (!(await sendWorkspaceEmail(to, input.title, html))) continue;
    sent += 1;
    const { error } = await supabase
      .from("notifications")
      .update({ emailed_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) console.error("[notifications] emailed_at failed:", error);
  }
}

/**
 * Writes one row per person for an event. Run it after the main write succeeds.
 * Routes wrap it in after(); code already outside the request awaits it.
 * Never throws. Returns the number of new rows.
 */
export async function notify(
  supabase: SupabaseClient,
  input: NotifyInput,
): Promise<number> {
  try {
    if (!isAppPath(input.link)) {
      console.error(`[notifications] rejected a link for ${input.kind}`);
      return 0;
    }
    const userIds = [...new Set(input.userIds)];
    if (userIds.length === 0) return 0;

    const { data, error } = await supabase
      .from("notifications")
      .upsert(
        userIds.map((userId) => ({
          user_id: userId,
          project_id: input.projectId,
          kind: input.kind,
          title: input.title,
          body: input.body,
          link: input.link,
          dedupe_key: input.dedupeKey,
        })),
        { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
      )
      .select("id, user_id");
    if (error) {
      console.error("[notifications] insert failed:", error);
      return 0;
    }
    const rows = (data ?? []) as NewRow[];
    if (rows.length > 0 && input.email !== false) {
      await emailNewRows(supabase, rows, input);
    }
    return rows.length;
  } catch (err) {
    console.error(
      "[notifications] notify failed:",
      err instanceof Error ? err.message : err,
    );
    return 0;
  }
}

/** Active Owner and Admins of a project, the people who act on reviews and requests. */
export async function projectAdminIds(
  supabase: SupabaseClient,
  projectId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId)
    .in("role", ["owner", "admin"])
    .is("removed_at", null);
  if (error) {
    console.error("[notifications] admin read failed:", error);
    return [];
  }
  return (data ?? []).map((r: { user_id: string }) => r.user_id);
}
