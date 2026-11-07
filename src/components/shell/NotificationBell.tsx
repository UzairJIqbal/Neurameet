"use client";

import React, { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import toast from "react-hot-toast";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { LoaderOne } from "@/components/ui/loader";
import { LoadError } from "@/components/ui/load-error";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { useVisibleRefetch } from "@/hooks/useVisibleRefetch";
import {
  BELL_REFETCH_MS,
  fetchNotifications,
  formatCount,
  markAllNotificationsRead,
  markNotificationsRead,
  notificationAge,
  NOTIFICATIONS_CHANGED_EVENT,
  type NotificationItem,
} from "@/lib/notification-client";

/** AC-72, AC-73: unread count, the latest 20, refreshed without any realtime. */
const NotificationBell = () => {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const { timedOut } = useLoadingTimeout(!loaded, {
    timeoutMs: 12000,
    retryNonce,
  });

  const refetch = useCallback(async () => {
    try {
      const data = await fetchNotifications();
      setItems(data.items);
      setUnread(data.unreadCount);
      setLoaded(true);
    } catch {
      // AC-73: a failed refetch keeps the last data and stays quiet.
    }
  }, []);

  useVisibleRefetch(() => void refetch(), BELL_REFETCH_MS, [
    NOTIFICATIONS_CHANGED_EVENT,
  ]);

  const openRow = (item: NotificationItem) => {
    setOpen(false);
    if (!item.readAt) void markNotificationsRead([item.id]).catch(() => {});
    router.push(item.link);
  };

  const markAll = async () => {
    try {
      await markAllNotificationsRead();
    } catch {
      toast.error("Couldn't mark those as read. Try again.");
    }
  };

  const retry = () => {
    setRetryNonce((n) => n + 1);
    void refetch();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
          }
          className="relative flex h-10 w-10 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-low"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-container px-1 text-[10px] font-bold text-on-primary">
              {formatCount(unread)}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(24rem,calc(100vw-2rem))] border border-outline-variant bg-surface-container-lowest p-0 text-on-surface"
      >
        <div className="flex items-center justify-between gap-3 border-b border-outline-variant px-4 py-3">
          <p className="text-body-md font-semibold">Notifications</p>
          <button
            type="button"
            onClick={() => void markAll()}
            disabled={unread === 0}
            className="text-body-md font-medium text-primary-container hover:underline disabled:text-on-surface-variant disabled:no-underline"
          >
            Mark all read
          </button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {!loaded && !timedOut && (
            <div className="flex justify-center py-8">
              <LoaderOne />
            </div>
          )}
          {!loaded && timedOut && (
            <LoadError onRetry={retry} onBack={() => setOpen(false)} />
          )}
          {loaded && items.length === 0 && (
            <p className="px-4 py-8 text-center text-body-md text-on-surface-variant">
              Nothing here yet.
            </p>
          )}
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => openRow(item)}
              className={`flex w-full flex-col gap-0.5 border-b border-outline-variant px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-surface-container-low ${
                item.readAt ? "" : "bg-surface-container-low"
              }`}
            >
              <span
                className={`truncate text-body-md text-on-surface ${
                  item.readAt ? "" : "font-semibold"
                }`}
              >
                {item.title}
              </span>
              <span className="truncate text-body-md text-on-surface-variant">
                {item.body}
              </span>
              <span className="text-xs text-on-surface-variant">
                {notificationAge(item.createdAt)}
                {item.projectName ? `, ${item.projectName}` : ""}
              </span>
            </button>
          ))}
        </div>
        <div className="border-t border-outline-variant px-4 py-3 text-center">
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="text-body-md font-medium text-primary-container hover:underline"
          >
            View all
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationBell;
