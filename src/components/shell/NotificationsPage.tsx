"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCheck,
  CheckSquare,
  Circle,
  CircleCheck,
  FolderKanban,
  GitPullRequest,
  Video,
} from "lucide-react";
import toast from "react-hot-toast";
import { LoaderOne } from "@/components/ui/loader";
import { LoadError } from "@/components/ui/load-error";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationsRead,
  markNotificationsUnread,
  notificationAge,
  type NotificationCategoryKey,
  type NotificationCounts,
  type NotificationItem,
} from "@/lib/notification-client";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "tasks", label: "Tasks" },
  { key: "meetings", label: "Meetings" },
  { key: "github", label: "GitHub" },
  { key: "projects", label: "Projects" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

const isFilterKey = (value: string | undefined): value is FilterKey =>
  FILTERS.some((f) => f.key === value);

const CATEGORY_LABELS: Record<NotificationCategoryKey, string> = {
  tasks: "Task",
  meetings: "Meeting",
  github: "GitHub",
  projects: "Project",
};

const CATEGORY_ICONS: Record<NotificationCategoryKey, React.ReactNode> = {
  tasks: <CheckSquare className="h-4 w-4" />,
  meetings: <Video className="h-4 w-4" />,
  github: <GitPullRequest className="h-4 w-4" />,
  projects: <FolderKanban className="h-4 w-4" />,
};

const EMPTY_COUNTS: NotificationCounts = {
  all: 0,
  tasks: 0,
  meetings: 0,
  github: 0,
  projects: 0,
};

const queryFor = (filter: FilterKey) =>
  filter === "all"
    ? {}
    : filter === "unread"
      ? { unread: true }
      : { category: filter };

const countFor = (
  filter: FilterKey,
  counts: NotificationCounts,
  unread: number,
): number => (filter === "unread" ? unread : counts[filter]);

/** AC-72a: everything addressed to you, 20 at a time. */
const NotificationsPage = ({ initialFilter }: { initialFilter?: string }) => {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterKey>(
    isFilterKey(initialFilter) ? initialFilter : "all",
  );
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [counts, setCounts] = useState<NotificationCounts>(EMPTY_COUNTS);
  const [unread, setUnread] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const { timedOut } = useLoadingTimeout(isLoading, {
    timeoutMs: 12000,
    retryNonce,
  });

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setFailed(false);
    fetchNotifications({ ...queryFor(filter), signal: controller.signal })
      .then((data) => {
        setItems(data.items);
        setCounts(data.categoryCounts);
        setUnread(data.unreadCount);
        setNextCursor(data.nextCursor);
        setIsLoading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setFailed(true);
        setIsLoading(false);
      });
    return () => controller.abort();
  }, [filter, retryNonce]);

  const loadMore = useCallback(async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const data = await fetchNotifications({
        ...queryFor(filter),
        cursor: nextCursor,
      });
      setItems((prev) => [...prev, ...data.items]);
      setNextCursor(data.nextCursor);
    } catch {
      toast.error("Couldn't load more. Try again.");
    } finally {
      setLoadingMore(false);
    }
  }, [filter, nextCursor]);

  const applyRead = (item: NotificationItem, readAt: string | null) => {
    setItems((prev) =>
      prev.map((row) => (row.id === item.id ? { ...row, readAt } : row)),
    );
    setUnread((n) => Math.max(0, n + (readAt ? -1 : 1)));
  };

  const toggleRead = async (item: NotificationItem) => {
    const wasRead = Boolean(item.readAt);
    applyRead(item, wasRead ? null : new Date().toISOString());
    try {
      await (wasRead
        ? markNotificationsUnread([item.id])
        : markNotificationsRead([item.id]));
    } catch {
      applyRead(item, item.readAt);
      toast.error("Couldn't change that. Try again.");
    }
  };

  const openRow = (item: NotificationItem) => {
    if (!item.readAt) void toggleRead(item);
    router.push(item.link);
  };

  const markAll = async () => {
    try {
      await markAllNotificationsRead();
      setRetryNonce((n) => n + 1);
    } catch {
      toast.error("Couldn't mark those as read. Try again.");
    }
  };

  const retry = () => setRetryNonce((n) => n + 1);

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-5 py-2">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-headline-md font-semibold text-on-surface">
            Notifications
          </h1>
          <p className="text-body-md text-on-surface-variant">
            {unread} unread, only notifications addressed to you
          </p>
        </div>
        <button
          type="button"
          onClick={() => void markAll()}
          disabled={unread === 0}
          className="flex items-center gap-2 rounded-card bg-surface-container-lowest shadow-card px-3 py-2 text-body-md font-medium text-on-surface transition-colors hover:bg-surface-container-low disabled:text-on-surface-variant"
        >
          <CheckCheck className="h-4 w-4" />
          Mark all as read
        </button>
      </header>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1 text-body-md font-medium transition-colors ${
              filter === f.key
                ? "bg-primary-container text-on-primary"
                : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container"
            }`}
          >
            {f.label} {countFor(f.key, counts, unread)}
          </button>
        ))}
      </div>

      {isLoading && !timedOut && (
        <div className="flex justify-center py-12">
          <LoaderOne />
        </div>
      )}
      {((isLoading && timedOut) || failed) && <LoadError onRetry={retry} />}

      {!isLoading && !failed && items.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-card bg-surface-container-lowest shadow-card px-6 py-12 text-center">
          <Bell className="h-6 w-6 text-on-surface-variant" />
          <p className="text-body-md text-on-surface-variant">
            Nothing here yet. Notifications addressed to you will show up here.
          </p>
        </div>
      )}

      {!isLoading && !failed && items.length > 0 && (
        <ul className="overflow-hidden rounded-card bg-surface-container-lowest shadow-card">
          {items.map((item) => (
            <li
              key={item.id}
              className={`flex items-start gap-3 border-b border-outline-variant px-4 py-3 last:border-b-0 ${
                item.readAt ? "" : "bg-surface-container-low"
              }`}
            >
              <button
                type="button"
                onClick={() => openRow(item)}
                className="flex min-w-0 flex-1 items-start gap-3 text-left"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary-container text-on-secondary-container">
                  {CATEGORY_ICONS[item.category]}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span
                    className={`text-body-md text-on-surface ${
                      item.readAt ? "" : "font-semibold"
                    }`}
                  >
                    {item.title}
                  </span>
                  <span className="text-body-md text-on-surface-variant">
                    {item.body}
                  </span>
                  <span className="text-xs text-on-surface-variant">
                    {CATEGORY_LABELS[item.category]},{" "}
                    {notificationAge(item.createdAt)}
                    {item.projectName ? `, ${item.projectName}` : ""}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => void toggleRead(item)}
                aria-label={item.readAt ? "Mark as unread" : "Mark as read"}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container"
              >
                {item.readAt ? (
                  <Circle className="h-4 w-4" />
                ) : (
                  <CircleCheck className="h-4 w-4 text-primary-container" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {!isLoading && nextCursor && (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="self-center rounded-card bg-surface-container-lowest shadow-card px-4 py-2 text-body-md font-medium text-on-surface transition-colors hover:bg-surface-container-low disabled:text-on-surface-variant"
        >
          {loadingMore ? "Loading..." : "Load more"}
        </button>
      )}
    </section>
  );
};

export default NotificationsPage;
