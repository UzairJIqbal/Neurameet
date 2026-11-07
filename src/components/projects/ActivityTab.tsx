/* eslint-disable prettier/prettier */
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { LoaderOne } from "@/components/ui/loader";
import { LoadError } from "@/components/ui/load-error";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { listActivity } from "@/lib/project-client";
import { activityDetail, activitySentence } from "@/lib/activity-text";
import type { ProjectDetail } from "@/lib/project-types";
import type { ActivityRow } from "@/lib/proof-types";

const secondaryButton =
  "w-fit rounded-lg border border-surface-variant px-4 py-2 text-body-md text-on-surface hover:bg-surface-container-low disabled:opacity-50";

const Row = ({ row }: { row: ActivityRow }) => {
  const detail = activityDetail(row);
  return (
    <li className="flex flex-col gap-1 px-4 py-3">
      <span className="break-words text-body-md text-on-surface">{activitySentence(row)}</span>
      {detail && <span dir="auto" className="break-words text-body-md text-on-surface-variant">{detail}</span>}
      <time dateTime={row.occurredAt} className="font-mono text-label-mono text-on-surface-variant">
        {new Date(row.occurredAt).toLocaleString()}
      </time>
    </li>
  );
};

// The project's timeline, newest first. More rows load on scroll (spec 0004 AC-61).
const ActivityTab = ({ project }: { project: ProjectDetail }) => {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const moreRef = useRef<AbortController | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const { timedOut } = useLoadingTimeout(isLoading, { retryNonce });

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsLoading(true);
    setFailed(false);
    listActivity(project.id, null, controller.signal)
      .then((json) => {
        if (controller.signal.aborted) return;
        setRows(json.rows);
        setNextBefore(json.nextBefore);
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
  }, [project.id, retryNonce]);

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
      const json = await listActivity(project.id, nextBefore, controller.signal);
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
  }, [project.id, nextBefore]);

  // A failed page stops the scroll trigger, so it can't retry in a loop.
  const canAutoLoad = !!nextBefore && !loadingMore && !moreFailed && !isLoading;
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
  if (isLoading) return <LoaderOne />;
  if (rows.length === 0) {
    return (
      <p className="text-body-md text-on-surface-variant">
        Nothing has happened here yet. When you add a meeting or a task, it shows up here.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-surface-variant rounded-xl border border-surface-variant bg-surface-container-lowest">
        {rows.map((row) => (
          <Row key={row.id} row={row} />
        ))}
      </ul>
      {moreFailed && (
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
