import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  escapeHtml,
  sendWorkspaceEmail,
  workspaceEmailConfigured,
} from "@/lib/email";
import { syncProject } from "@/lib/github-rules";
import {
  activeProjectIds,
  countUnread,
  notificationScope,
} from "@/lib/notification-feed";
import {
  CRON_RUN_MS,
  CRON_SYNC_PROJECTS,
  DIGEST_DAILY_CAP,
  notify,
  primaryEmails,
  SETTINGS_EMAIL_PATH,
  TASK_DUE_CAP,
} from "@/lib/notifications";
import { pktToday } from "@/lib/project-select";
import { taskKey } from "@/lib/tasks";

// W8 AC-76: the one Hobby cron. Four jobs in order, each failing alone, all
// inside one run budget. The response carries counts and job names, never an email.

const DELIVERY_RETENTION_DAYS = 30;
const SYNC_MIN_LEFT_MS = 5_000;
const DIGEST_TASKS_SHOWN = 5;
const DIGEST_READ_LIMIT = 1000;
const SYNC_LINK_LIMIT = 200;
const DAY_MS = 86_400_000;

export type CronClock = { now: () => number; deadline: number };

export type DailyCronResult = {
  purged: number;
  taskDue: number;
  digests: number;
  synced: number;
  failed: string[];
};

export async function purgeDeliveries(
  supabase: SupabaseClient,
  clock: CronClock,
): Promise<number> {
  const before = new Date(clock.now() - DELIVERY_RETENTION_DAYS * DAY_MS);
  const { count, error } = await supabase
    .from("github_deliveries")
    .delete({ count: "exact" })
    .lt("received_at", before.toISOString());
  if (error) throw error;
  return count ?? 0;
}

async function prefixesOf(
  supabase: SupabaseClient,
  projectIds: string[],
): Promise<Map<string, string>> {
  if (projectIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("projects")
    .select("id, task_prefix")
    .in("id", projectIds);
  if (error) throw error;
  return new Map(
    (data ?? []).map((p: { id: string; task_prefix: string }) => [
      p.id,
      p.task_prefix,
    ]),
  );
}

type DueTaskRow = {
  id: string;
  project_id: string;
  number: number;
  title: string;
  assignee_id: string;
  due_date: string;
};

const DUE_TASK_COLUMNS = "id, project_id, number, title, assignee_id, due_date";

export async function writeTaskDue(
  supabase: SupabaseClient,
  clock: CronClock,
): Promise<number> {
  const today = pktToday();
  const { data, error } = await supabase
    .from("tasks")
    .select(DUE_TASK_COLUMNS)
    .eq("due_date", today)
    .neq("status", "completed")
    .not("assignee_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(TASK_DUE_CAP);
  if (error) throw error;

  const rows = (data ?? []) as DueTaskRow[];
  const prefixes = await prefixesOf(supabase, [
    ...new Set(rows.map((r) => r.project_id)),
  ]);
  let written = 0;
  for (const task of rows) {
    if (clock.now() >= clock.deadline) break;
    const prefix = prefixes.get(task.project_id);
    if (!prefix) continue;
    written += await notify(supabase, {
      userIds: [task.assignee_id],
      projectId: task.project_id,
      kind: "task_due",
      title: `${taskKey(prefix, task.number)} is due today`,
      body: task.title,
      link: `/projects/${task.project_id}?tab=tasks&task=${task.id}`,
      dedupeKey: `task_due:${task.id}:${task.due_date}`,
      email: false,
    });
  }
  return written;
}

type DigestCandidate = { tasks: DueTaskRow[]; hasUnread: boolean };

/** Keeps a row only when its user is still an active member of its project. */
async function membersOf(
  supabase: SupabaseClient,
  projectIds: string[],
): Promise<Set<string>> {
  if (projectIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("project_members")
    .select("project_id, user_id")
    .in("project_id", projectIds)
    .is("removed_at", null);
  if (error) throw error;
  return new Set(
    (data ?? []).map(
      (m: { project_id: string; user_id: string }) =>
        `${m.project_id}|${m.user_id}`,
    ),
  );
}

async function digestCandidates(
  supabase: SupabaseClient,
  clock: CronClock,
  today: string,
): Promise<Map<string, DigestCandidate>> {
  const since = new Date(clock.now() - DAY_MS).toISOString();
  const [tasks, unread] = await Promise.all([
    supabase
      .from("tasks")
      .select(DUE_TASK_COLUMNS)
      .lte("due_date", today)
      .neq("status", "completed")
      .not("assignee_id", "is", null)
      .order("due_date", { ascending: true })
      .limit(DIGEST_READ_LIMIT),
    supabase
      .from("notifications")
      .select("user_id, project_id, kind")
      .is("read_at", null)
      .gte("created_at", since)
      .limit(DIGEST_READ_LIMIT),
  ]);
  if (tasks.error) throw tasks.error;
  if (unread.error) throw unread.error;

  const taskRows = (tasks.data ?? []) as DueTaskRow[];
  const unreadRows = (unread.data ?? []) as {
    user_id: string;
    project_id: string | null;
    kind: string;
  }[];
  const members = await membersOf(supabase, [
    ...new Set([
      ...taskRows.map((t) => t.project_id),
      ...unreadRows.flatMap((n) => (n.project_id ? [n.project_id] : [])),
    ]),
  ]);

  const candidates = new Map<string, DigestCandidate>();
  const entry = (userId: string): DigestCandidate => {
    const found = candidates.get(userId);
    if (found) return found;
    const created: DigestCandidate = { tasks: [], hasUnread: false };
    candidates.set(userId, created);
    return created;
  };
  for (const task of taskRows) {
    if (members.has(`${task.project_id}|${task.assignee_id}`)) {
      entry(task.assignee_id).tasks.push(task);
    }
  }
  for (const row of unreadRows) {
    const inScope =
      row.kind === "project_invitation" ||
      members.has(`${row.project_id}|${row.user_id}`);
    if (inScope) entry(row.user_id).hasUnread = true;
  }
  return candidates;
}

type SettingsRow = {
  user_id: string;
  email_notifications: boolean;
  digest_emails: boolean;
  digest_sent_on: string | null;
};

// AC-76a: both toggles on, not sent today, oldest send first (no row or null first).
async function pickDigestUsers(
  supabase: SupabaseClient,
  userIds: string[],
  today: string,
): Promise<string[]> {
  if (userIds.length === 0) return [];
  const [settings, sent] = await Promise.all([
    supabase
      .from("user_settings")
      .select("user_id, email_notifications, digest_emails, digest_sent_on")
      .in("user_id", userIds),
    supabase
      .from("user_settings")
      .select("user_id", { count: "exact", head: true })
      .eq("digest_sent_on", today),
  ]);
  if (settings.error) throw settings.error;
  if (sent.error) throw sent.error;

  const left = DIGEST_DAILY_CAP - (sent.count ?? 0);
  if (left <= 0) return [];
  const byUser = new Map(
    ((settings.data ?? []) as SettingsRow[]).map((r) => [r.user_id, r]),
  );
  const lastSent = (id: string): string => byUser.get(id)?.digest_sent_on ?? "";
  return userIds
    .filter((id) => {
      const row = byUser.get(id);
      if (!row) return true;
      return (
        row.email_notifications &&
        row.digest_emails &&
        row.digest_sent_on !== today
      );
    })
    .sort((a, b) => lastSent(a).localeCompare(lastSent(b)))
    .slice(0, left);
}

/** Claimed before sending, so a second run the same day can't send twice. */
async function claimDigestDay(
  supabase: SupabaseClient,
  userId: string,
  today: string,
): Promise<boolean> {
  const { error: seedError } = await supabase
    .from("user_settings")
    .upsert(
      { user_id: userId },
      { onConflict: "user_id", ignoreDuplicates: true },
    );
  if (seedError) throw seedError;
  const { data, error } = await supabase
    .from("user_settings")
    .update({ digest_sent_on: today })
    .eq("user_id", userId)
    .or(`digest_sent_on.is.null,digest_sent_on.lt.${today}`)
    .select("user_id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

function digestHtml(lines: string[], unread: number): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const items = lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("");
  const settings = escapeHtml(`${base}${SETTINGS_EMAIL_PATH}`);
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #1a1a1a;">Your NeuraMeet digest</h2>
      ${items ? `<p style="color: #444;">Tasks due today or overdue:</p><ul>${items}</ul>` : ""}
      <p style="color: #444;">Unread notifications: ${unread}</p>
      <p style="color: #888; font-size: 12px;">
        You can turn these emails off in <a href="${settings}">Settings</a>.
      </p>
    </div>`;
}

export async function sendDigests(
  supabase: SupabaseClient,
  clock: CronClock,
): Promise<number> {
  if (!workspaceEmailConfigured()) return 0;
  const today = pktToday();
  const candidates = await digestCandidates(supabase, clock, today);
  const users = await pickDigestUsers(supabase, [...candidates.keys()], today);
  if (users.length === 0) return 0;

  const emails = await primaryEmails(users);
  const prefixes = await prefixesOf(supabase, [
    ...new Set(
      users
        .flatMap((u) => candidates.get(u)?.tasks ?? [])
        .map((t) => t.project_id),
    ),
  ]);

  let sent = 0;
  for (const userId of users) {
    if (clock.now() >= clock.deadline) break;
    const to = emails.get(userId);
    if (!to || !(await claimDigestDay(supabase, userId, today))) continue;
    const lines = (candidates.get(userId)?.tasks ?? [])
      .slice(0, DIGEST_TASKS_SHOWN)
      .map(
        (t) =>
          `${taskKey(prefixes.get(t.project_id) ?? "", t.number)} ${t.title}`,
      );
    const scope = notificationScope(await activeProjectIds(supabase, userId));
    const unread = await countUnread(supabase, userId, scope);
    // A failed send is logged by the sender, and that day's digest is lost.
    const delivered = await sendWorkspaceEmail(
      to,
      "Your NeuraMeet digest",
      digestHtml(lines, unread),
    );
    if (delivered) sent += 1;
  }
  return sent;
}

type SyncLinkRow = { tasks: { project_id: string } | { project_id: string }[] };

/** The longest waiting projects with open or draft links, first 5 distinct. */
export async function syncOpenProjects(
  supabase: SupabaseClient,
  clock: CronClock,
): Promise<number> {
  const { data, error } = await supabase
    .from("task_links")
    .select("tasks!inner(project_id)")
    .in("state", ["open", "draft"])
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .limit(SYNC_LINK_LIMIT);
  if (error) throw error;

  const projectIds = new Set<string>();
  for (const row of (data ?? []) as unknown as SyncLinkRow[]) {
    const task = Array.isArray(row.tasks) ? row.tasks[0] : row.tasks;
    if (task) projectIds.add(task.project_id);
    if (projectIds.size === CRON_SYNC_PROJECTS) break;
  }

  let synced = 0;
  for (const projectId of projectIds) {
    const left = clock.deadline - clock.now();
    if (left < SYNC_MIN_LEFT_MS) break;
    await syncProject(supabase, projectId, { now: clock.now, maxMs: left });
    synced += 1;
  }
  return synced;
}

export async function runDailyCron(
  supabase: SupabaseClient,
  now: () => number = Date.now,
): Promise<DailyCronResult> {
  const clock: CronClock = { now, deadline: now() + CRON_RUN_MS };
  const result: DailyCronResult = {
    purged: 0,
    taskDue: 0,
    digests: 0,
    synced: 0,
    failed: [],
  };
  const job = async (
    name: string,
    run: () => Promise<number>,
    store: (count: number) => void,
  ): Promise<void> => {
    try {
      store(await run());
    } catch (err) {
      console.error(
        `[cron] ${name} failed:`,
        err instanceof Error ? err.message : err,
      );
      result.failed.push(name);
    }
  };

  await job(
    "purge",
    () => purgeDeliveries(supabase, clock),
    (n) => (result.purged = n),
  );
  await job(
    "task_due",
    () => writeTaskDue(supabase, clock),
    (n) => (result.taskDue = n),
  );
  await job(
    "digest",
    () => sendDigests(supabase, clock),
    (n) => (result.digests = n),
  );
  await job(
    "sync",
    () => syncOpenProjects(supabase, clock),
    (n) => (result.synced = n),
  );
  return result;
}
