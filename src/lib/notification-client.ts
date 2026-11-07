// Browser side types and wrappers for the notification and counts routes.

export const BELL_REFETCH_MS = 60_000;

export const NOTIFICATIONS_CHANGED_EVENT = "neurameet:notifications-changed";

export type NotificationCategoryKey =
  "tasks" | "meetings" | "github" | "projects";

export type NotificationItem = {
  id: string;
  projectId: string | null;
  projectName: string | null;
  kind: string;
  category: NotificationCategoryKey;
  title: string;
  body: string;
  link: string;
  readAt: string | null;
  createdAt: string;
};

export type NotificationCounts = Record<
  NotificationCategoryKey | "all",
  number
>;

export type NotificationsResponse = {
  items: NotificationItem[];
  unreadCount: number;
  categoryCounts: NotificationCounts;
  nextCursor: string | null;
};

export type MyCounts = {
  openTasks: number;
  upcomingMeetings: number;
  unread: number;
  prReviews: number;
};

export type NotificationQuery = {
  cursor?: string | null;
  unread?: boolean;
  category?: NotificationCategoryKey;
  signal?: AbortSignal;
};

export async function fetchNotifications(
  query: NotificationQuery = {},
): Promise<NotificationsResponse> {
  const params = new URLSearchParams();
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.unread) params.set("unread", "1");
  if (query.category) params.set("category", query.category);
  const qs = params.toString();
  const res = await fetch(`/api/notifications${qs ? `?${qs}` : ""}`, {
    signal: query.signal,
  });
  if (!res.ok) throw new Error(`Notifications failed (${res.status})`);
  return (await res.json()) as NotificationsResponse;
}

async function postRead(body: Record<string, unknown>): Promise<void> {
  const res = await fetch("/api/notifications/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Mark read failed (${res.status})`);
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}

export const markNotificationsRead = (ids: string[]) => postRead({ ids });
export const markNotificationsUnread = (ids: string[]) =>
  postRead({ ids, unread: true });
export const markAllNotificationsRead = () => postRead({ all: true });

export async function fetchMyCounts(signal?: AbortSignal): Promise<MyCounts> {
  const res = await fetch("/api/my-counts", { signal });
  if (!res.ok) throw new Error(`Counts failed (${res.status})`);
  return (await res.json()) as MyCounts;
}

/** The unread number the bell and the page show: "99+" above 99. */
export const formatCount = (count: number): string =>
  count > 99 ? "99+" : String(count);

/** "just now", "3m ago", "5h ago", "2d ago". */
export function notificationAge(iso: string, now: number = Date.now()): string {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
