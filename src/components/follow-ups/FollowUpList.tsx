/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, ListChecks, User } from "lucide-react";
import { LoaderOne } from "@/components/ui/loader";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { LoadError } from "@/components/ui/load-error";
import { ConfirmDelete } from "@/components/ui/confirm-delete";
import toast from "react-hot-toast";
import { FollowUpItem, FollowUpStatus } from "@/lib/meeting-types";
import FollowUpCheck from "./FollowUpCheck";

type Filter = "open" | "completed" | "all";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "completed", label: "Completed" },
  { key: "all", label: "All" },
];

interface MeetingGroup {
  meetingId: string;
  meetingTitle: string;
  meetingStartedAt: string | null;
  doneCount: number;
  totalCount: number;
  items: FollowUpItem[];
}

const isDone = (fu: FollowUpItem) => fu.status === "completed";

const matchesFilter = (fu: FollowUpItem, filter: Filter) =>
  filter === "all" || (filter === "completed" ? isDone(fu) : !isDone(fu));

// A date only value ("2026-11-20") is read as a local day, not UTC midnight,
// so it never shows as the day before.
export function parseDay(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
}

export function isOverdue(fu: FollowUpItem, now: Date = new Date()): boolean {
  if (!fu.dueDate || isDone(fu)) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return parseDay(fu.dueDate) < today;
}

// Groups by meeting, newest meeting first. Progress counts every follow-up of
// the meeting; only the items matching the filter are listed.
export function groupByMeeting(
  followUps: FollowUpItem[],
  filter: Filter,
): MeetingGroup[] {
  const groups = new Map<string, MeetingGroup>();
  for (const fu of followUps) {
    const group = groups.get(fu.meetingId) ?? {
      meetingId: fu.meetingId,
      meetingTitle: fu.meetingTitle ?? "Untitled meeting",
      meetingStartedAt: fu.meetingStartedAt,
      doneCount: 0,
      totalCount: 0,
      items: [],
    };
    group.totalCount += 1;
    if (isDone(fu)) group.doneCount += 1;
    if (matchesFilter(fu, filter)) group.items.push(fu);
    groups.set(fu.meetingId, group);
  }
  const time = (g: MeetingGroup) =>
    g.meetingStartedAt ? new Date(g.meetingStartedAt).getTime() : 0;
  return [...groups.values()]
    .filter((g) => g.items.length > 0)
    .sort((a, b) => time(b) - time(a));
}

const FollowUpRow = ({
  fu,
  onStatusChange,
  onDelete,
}: {
  fu: FollowUpItem;
  onStatusChange: (status: FollowUpStatus) => void;
  onDelete: () => void;
}) => {
  const title = fu.actionTitle ?? "Untitled action item";
  const done = isDone(fu);
  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div className="pt-0.5">
          <FollowUpCheck id={fu.id} status={fu.status} title={title} onChange={onStatusChange} />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <span
            className={`break-words text-body-md font-medium ${
              done ? "text-on-surface-variant line-through" : "text-on-surface"
            }`}
          >
            {title}
          </span>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm text-on-surface-variant">
            {fu.assignee && (
              <span className="inline-flex items-center gap-1">
                <User className="h-4 w-4" /> {fu.assignee}
              </span>
            )}
            {fu.dueDate && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-4 w-4" />
                {parseDay(fu.dueDate).toLocaleDateString()}
              </span>
            )}
            {isOverdue(fu) && (
              <span className="rounded-full bg-warning-container px-2.5 py-0.5 text-label-caps uppercase tracking-wider text-on-warning-container">
                Overdue
              </span>
            )}
            {fu.status === "needs_attention" && (
              <span className="rounded-full bg-error-container px-2.5 py-0.5 text-label-caps uppercase tracking-wider text-error">
                Needs attention
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2 pl-9 sm:pl-0">
        <Link
          href={`/follow-ups/${fu.id}`}
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-body-sm text-primary transition-colors hover:bg-primary/5"
        >
          Details
          <ArrowRight className="h-4 w-4" />
        </Link>
        <ConfirmDelete label="Delete follow-up" confirmLabel="Delete" onConfirm={onDelete} />
      </div>
    </li>
  );
};

const MeetingGroupCard = ({
  group,
  onStatusChange,
  onDelete,
}: {
  group: MeetingGroup;
  onStatusChange: (id: string, status: FollowUpStatus) => void;
  onDelete: (id: string) => void;
}) => {
  const percent = Math.round((group.doneCount / group.totalCount) * 100);
  return (
    <article className="overflow-hidden rounded-card border border-surface-variant bg-surface-container-lowest shadow-card">
      <header className="flex flex-col gap-3 border-b border-surface-variant px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Link
            href={`/meeting-intelligence/${group.meetingId}`}
            className="break-words text-headline-sm font-semibold text-on-surface hover:text-primary hover:underline"
          >
            {group.meetingTitle}
          </Link>
          {group.meetingStartedAt && (
            <span className="text-body-sm text-on-surface-variant">
              {new Date(group.meetingStartedAt).toLocaleDateString()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-container"
            role="progressbar"
            aria-valuenow={group.doneCount}
            aria-valuemin={0}
            aria-valuemax={group.totalCount}
            aria-label={`${group.meetingTitle} progress`}
          >
            <div className="h-full rounded-full bg-success" style={{ width: `${percent}%` }} />
          </div>
          <span className="whitespace-nowrap text-body-sm text-on-surface-variant">
            {group.doneCount} of {group.totalCount} done
          </span>
        </div>
      </header>
      <ul className="divide-y divide-surface-variant">
        {group.items.map((fu) => (
          <FollowUpRow
            key={fu.id}
            fu={fu}
            onStatusChange={(status) => onStatusChange(fu.id, status)}
            onDelete={() => onDelete(fu.id)}
          />
        ))}
      </ul>
    </article>
  );
};

const FollowUpList = () => {
  const [followUps, setFollowUps] = useState<FollowUpItem[]>([]);
  const [filter, setFilter] = useState<Filter>("open");
  const [isLoading, setIsLoading] = useState(true);
  const [retryNonce, setRetryNonce] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);

  const handleDeleteFollowUp = async (id: string) => {
    try {
      const res = await fetch(`/api/follow-ups/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? `Delete failed: ${res.status}`);
      }
      setFollowUps((prev) => prev.filter((f) => f.id !== id));
      toast.success("Follow-up deleted");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to delete follow-up";
      toast.error(msg);
    }
  };

  const handleStatusChange = (id: string, status: FollowUpStatus) =>
    setFollowUps((prev) => prev.map((f) => (f.id === id ? { ...f, status } : f)));

  const { timedOut } = useLoadingTimeout(isLoading, {
    timeoutMs: 12000,
    retryNonce,
  });

  useEffect(() => {
    // Abort on retry or unmount so a stale response never overwrites state.
    const controller = new AbortController();
    controllerRef.current = controller;
    const fetchFollowUps = async () => {
      try {
        setIsLoading(true);
        const res = await fetch("/api/follow-ups", {
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`API error: ${res.status}`);
        }

        const data = (await res.json()) as { followUps: FollowUpItem[] };
        setFollowUps(data.followUps ?? []);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("Failed to load follow-ups:", err);
        toast.error("Failed to load follow-ups");
        setFollowUps([]);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    fetchFollowUps();
    return () => controller.abort();
  }, [retryNonce]);

  // A load that hit the timeout is abandoned: its late response must not
  // replace the retry view.
  useEffect(() => {
    if (timedOut) controllerRef.current?.abort();
  }, [timedOut]);

  if (timedOut) {
    return (
      <LoadError
        message="We couldn't load your follow-ups."
        onRetry={() => setRetryNonce((k) => k + 1)}
        listHref="/follow-ups"
        listLabel="Back to follow-ups"
      />
    );
  }

  if (isLoading) return <LoaderOne />;

  const counts: Record<Filter, number> = {
    open: followUps.filter((f) => !isDone(f)).length,
    completed: followUps.filter(isDone).length,
    all: followUps.length,
  };
  const groups = groupByMeeting(followUps, filter);

  return (
    <section className="flex w-full flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg">
          Follow-ups
        </h1>
        <p className="text-body-md text-on-surface-variant">
          Action items from your meetings, grouped by meeting.
        </p>
      </header>

      {followUps.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-surface-variant bg-surface-container-lowest px-6 py-16 text-center">
          <ListChecks className="h-10 w-10 text-on-surface-variant" />
          <p className="text-body-lg text-on-surface-variant">
            No follow-ups yet.
          </p>
          <p className="text-body-md text-on-surface-variant">
            They appear after a meeting&apos;s summary is created.
          </p>
        </div>
      ) : (
        <>
          <nav role="tablist" className="flex gap-2 overflow-x-auto border-b border-surface-variant">
            {FILTERS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={key === filter}
                onClick={() => setFilter(key)}
                className={
                  key === filter
                    ? "whitespace-nowrap border-b-2 border-primary px-3 py-2 text-body-md font-medium text-primary"
                    : "whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-body-md text-on-surface-variant hover:text-on-surface"
                }
              >
                {label} ({counts[key]})
              </button>
            ))}
          </nav>

          {groups.length === 0 ? (
            <p className="rounded-card bg-surface-container-lowest px-6 py-10 text-center text-body-md text-on-surface-variant shadow-card">
              Nothing here.
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              {groups.map((group) => (
                <MeetingGroupCard
                  key={group.meetingId}
                  group={group}
                  onStatusChange={handleStatusChange}
                  onDelete={handleDeleteFollowUp}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default FollowUpList;
