/* eslint-disable prettier/prettier */
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoaderOne } from "@/components/ui/loader";
import { LoadError } from "@/components/ui/load-error";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { relativeTime } from "@/lib/chatHistory";
import { listActivity, listMembers } from "@/lib/project-client";
import { activityDetail, activitySentence } from "@/lib/activity-text";
import type { ProjectDetail } from "@/lib/project-types";
import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_CATEGORY_KINDS,
  type ActivityCategory,
  type ActivityCategoryCounts,
  type ActivityRow,
} from "@/lib/proof-types";
import { MemberAvatar } from "./project-visuals";
import { useCardLoad } from "./useCardLoad";

const secondaryButton =
  "w-fit rounded-lg border border-surface-variant px-4 py-2 text-body-md text-on-surface hover:bg-surface-container-low disabled:opacity-50";
const fieldClass =
  "rounded-lg border border-surface-variant bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface";
const chipBase = "rounded-full px-3 py-1 text-body-md";
const chipOn = "bg-primary-container text-on-primary";
const chipOff = "border border-surface-variant text-on-surface-variant hover:bg-surface-container-low";

const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  github: "GitHub",
  tasks: "Tasks",
  meetings: "Meetings",
  members: "Members",
};

const categoryOf = (kind: string) =>
  ACTIVITY_CATEGORIES.find((category) =>
    (ACTIVITY_CATEGORY_KINDS[category] as readonly string[]).includes(kind),
  );

const whenLabel = (iso: string) => {
  const date = new Date(iso);
  const age = relativeTime(date.getTime());
  const clock = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${age === "now" ? "just now" : `${age} ago`} · ${clock}`;
};

/** Consecutive rows on one local day. The rows arrive newest first. */
const groupByDay = (rows: ActivityRow[]) => {
  const groups: { day: string; rows: ActivityRow[] }[] = [];
  for (const row of rows) {
    const day = new Date(row.occurredAt).toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const last = groups[groups.length - 1];
    if (last?.day === day) last.rows.push(row);
    else groups.push({ day, rows: [row] });
  }
  return groups;
};

const Row = ({ row }: { row: ActivityRow }) => {
  const detail = activityDetail(row);
  const category = categoryOf(row.kind);
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <MemberAvatar name={row.actorName ?? "Someone"} imageUrl={null} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="break-words text-body-md text-on-surface">{activitySentence(row)}</span>
        {detail && <span dir="auto" className="break-words text-body-md text-on-surface-variant">{detail}</span>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {category && (
          <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-xs font-medium text-on-surface-variant">
            {CATEGORY_LABELS[category]}
          </span>
        )}
        <time dateTime={row.occurredAt} className="font-mono text-label-mono text-on-surface-variant">
          {whenLabel(row.occurredAt)}
        </time>
      </div>
    </li>
  );
};

// The project's timeline, newest first. More rows load on scroll (spec 0004 AC-61, AC-70m).
const ActivityTab = ({ project }: { project: ProjectDetail }) => {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [category, setCategory] = useState<ActivityCategory | "">("");
  const [actorId, setActorId] = useState("");
  const [search, setSearch] = useState("");
  const [counts, setCounts] = useState<ActivityCategoryCounts | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const moreRef = useRef<AbortController | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const { timedOut } = useLoadingTimeout(isLoading, { retryNonce });
  const filters = useMemo(() => ({ category, actorId }), [category, actorId]);

  // Only fills the select: if it fails, "Everyone" stays.
  const loadPeople = useCallback((signal: AbortSignal) => listMembers(project.id, signal), [project.id]);
  const { data: people } = useCardLoad(loadPeople);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsLoading(true);
    setFailed(false);
    setLoadingMore(false);
    setMoreFailed(false);
    listActivity(project.id, null, controller.signal, filters)
      .then((json) => {
        if (controller.signal.aborted) return;
        setRows(json.rows);
        setNextBefore(json.nextBefore);
        if (json.categoryCounts) setCounts(json.categoryCounts);
        setHasLoaded(true);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        console.error("Failed to load activity:", err);
        setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => {
      controller.abort();
      moreRef.current?.abort();
    };
  }, [project.id, filters, retryNonce]);

  useEffect(() => {
    if (timedOut) controllerRef.current?.abort();
  }, [timedOut]);

  const loadMore = useCallback(async () => {
    if (!nextBefore) return;
    const controller = new AbortController();
    moreRef.current = controller;
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const json = await listActivity(project.id, nextBefore, controller.signal, filters);
      if (controller.signal.aborted) return;
      setRows((current) => [...current, ...json.rows]);
      setNextBefore(json.nextBefore);
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error("Failed to load more activity:", err);
      setMoreFailed(true);
    } finally {
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  }, [project.id, nextBefore, filters]);

  const needle = search.trim().toLowerCase();
  const searching = needle.length > 0;
  const shown = useMemo(
    () =>
      searching
        ? rows.filter((row) =>
            `${activitySentence(row)} ${activityDetail(row) ?? ""}`.toLowerCase().includes(needle),
          )
        : rows,
    [rows, needle, searching],
  );
  const days = useMemo(() => groupByDay(shown), [shown]);

  // A failed page stops the scroll trigger, so it can't retry in a loop. A search
  // stops it too, or a search with few matches would page through everything.
  const canAutoLoad = !!nextBefore && !loadingMore && !moreFailed && !isLoading && !searching;
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !canAutoLoad) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore();
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [canAutoLoad, loadMore]);

  const retry = () => setRetryNonce((k) => k + 1);

  if (timedOut || (failed && !isLoading)) {
    return <LoadError message="We couldn't load the activity." onRetry={retry} />;
  }
  if (!hasLoaded) return <LoaderOne />;
  if (rows.length === 0 && !isLoading && !category && !actorId) {
    return (
      <p className="text-body-md text-on-surface-variant">
        Task, meeting, and GitHub events will show up here.
      </p>
    );
  }

  const chip = (value: ActivityCategory | "", label: string, count: number | undefined) => (
    <button
      key={value || "all"}
      type="button"
      aria-pressed={category === value}
      onClick={() => setCategory(value)}
      className={`${chipBase} ${category === value ? chipOn : chipOff}`}
    >
      {label}
      {count === undefined ? "" : ` ${count}`}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {chip("", "All", counts?.all)}
        {ACTIVITY_CATEGORIES.map((value) => chip(value, CATEGORY_LABELS[value], counts?.[value]))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <select aria-label="Filter by person" value={actorId} onChange={(e) => setActorId(e.target.value)} className={`${fieldClass} max-w-full`}>
          <option value="">Everyone</option>
          {people?.members.map((member) => (
            <option key={member.userId} value={member.userId}>{member.name}</option>
          ))}
        </select>
        <input
          type="search"
          aria-label="Search activity"
          placeholder="Search activity"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${fieldClass} min-w-0 flex-1 sm:max-w-xs`}
        />
      </div>
      {searching && (
        <p className="text-body-md text-on-surface-variant">Search looks through the rows loaded so far.</p>
      )}

      {isLoading ? (
        <p className="text-body-md text-on-surface-variant">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="text-body-md text-on-surface-variant">
          {searching ? "No loaded rows match your search." : "Nothing matches these filters."}
        </p>
      ) : (
        days.map((group) => (
          <section key={group.day} aria-label={group.day} className="flex flex-col gap-2">
            <h3 className="text-label-caps uppercase tracking-wider text-on-surface-variant">{group.day}</h3>
            <ul className="divide-y divide-surface-variant rounded-lg border border-surface-variant bg-surface-container-lowest">
              {group.rows.map((row) => (
                <Row key={row.id} row={row} />
              ))}
            </ul>
          </section>
        ))
      )}

      {!isLoading && !!nextBefore && !loadingMore && (moreFailed || searching) && (
        <button type="button" onClick={loadMore} className={secondaryButton}>
          Load more
        </button>
      )}
      {loadingMore && <p className="text-body-md text-on-surface-variant">Loading…</p>}
      <div ref={sentinelRef} aria-hidden="true" />
    </div>
  );
};

export default ActivityTab;
