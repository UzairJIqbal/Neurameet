/* eslint-disable prettier/prettier */
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { CalendarDays, Quote, User } from "lucide-react";
import { LoaderOne } from "@/components/ui/loader";
import { LoadError } from "@/components/ui/load-error";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { STATUS_BADGE, badgeBase } from "@/components/meeting-intelligence/LedgerTab";
import { getProjectLedger } from "@/lib/project-client";
import { reviewLedgerLink } from "@/lib/ledger-client";
import type { LedgerReviewDecision } from "@/lib/meeting-types";
import type { ProjectDetail } from "@/lib/project-types";
import type { ProjectLedgerItem, ProjectLedgerResponse, ReviewRow } from "@/lib/proof-types";
import OutcomeCard from "./OutcomeCard";
import TaskDrawer from "./TaskDrawer";

const selectClass =
  "rounded-lg border border-surface-variant bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface";
const primaryButton =
  "rounded-lg bg-primary-container px-4 py-2 text-body-md text-on-primary hover:bg-primary disabled:opacity-50";
const secondaryButton =
  "rounded-lg border border-surface-variant px-4 py-2 text-body-md text-on-surface hover:bg-surface-container-low disabled:opacity-50";
const card = "flex flex-col gap-3 rounded-xl border border-surface-variant bg-surface-container-lowest p-4";
const REVIEW_LIMIT = 50;

const dateOf = (iso: string) => new Date(iso).toLocaleDateString();

const ReviewCard = ({
  row,
  saving,
  onReview,
}: {
  row: ReviewRow;
  saving: LedgerReviewDecision | null;
  onReview: (id: string, decision: LedgerReviewDecision) => void;
}) => {
  const busy = saving !== null;
  const meta = [row.speaker, row.lineNumber === null ? null : `line ${row.lineNumber}`].filter(Boolean).join(" · ");
  return (
    <li className={card}>
      <p dir="auto" className="break-words text-body-md font-medium text-on-surface">{row.item.statement}</p>
      <p className="text-body-md text-on-surface-variant">
        {row.relation === "kept" ? "May be kept" : "May be reversed"} · {Math.round(row.confidence * 100)}% confident ·{" "}
        <Link href={`/meeting-intelligence/${row.meeting.id}`} className="text-primary underline">{row.meeting.title}</Link>
      </p>
      <div className="flex gap-2 rounded-lg bg-surface-container-low p-3 text-body-md text-on-surface">
        <Quote className="mt-1 h-4 w-4 shrink-0 text-primary-container" />
        <div className="flex min-w-0 flex-col gap-1">
          {row.pr ? (
            <>
              <span className="break-all font-mono text-label-mono text-on-surface-variant">
                {row.pr.repoFullName} #{row.pr.prNumber}{row.pr.reverted ? " · reverted" : ""}
              </span>
              <a href={row.pr.prUrl} target="_blank" rel="noopener noreferrer" dir="auto" className="w-fit break-words text-primary underline">
                {row.quote}
              </a>
            </>
          ) : (
            <>
              <span dir="auto" className="break-words italic">{row.quote}</span>
              {row.evidenceMeetingId && (
                <Link href={`/meeting-intelligence/${row.evidenceMeetingId}`} className="w-fit text-primary underline">
                  {meta || "Open the evidence"}
                </Link>
              )}
            </>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {/* The server refuses to confirm a reverted PR's link. */}
        {!row.pr?.reverted && (
          <button type="button" disabled={busy} onClick={() => onReview(row.id, "confirm")} className={primaryButton}>
            {saving === "confirm" ? "Saving…" : "Confirm"}
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => onReview(row.id, "reject")} className={secondaryButton}>
          {saving === "reject" ? "Saving…" : "Not a match"}
        </button>
      </div>
    </li>
  );
};

const ItemCard = ({ item, onOpenTask }: { item: ProjectLedgerItem; onOpenTask: (taskId: string) => void }) => {
  const status = STATUS_BADGE[item.derivedStatus];
  const isPromise = item.kind === "promise";
  const outside = item.links.some((link) => link.outsideProject);
  return (
    <li className={card}>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`${badgeBase} ${
            isPromise ? "bg-primary-container/15 text-primary-container" : "bg-secondary-container text-on-secondary-container"
          }`}
        >
          {isPromise ? "Promise" : "Decision"}
        </span>
        <span className={`${badgeBase} ${status.className}`}>{status.label}</span>
        <span className="text-body-md text-on-surface-variant">{dateOf(item.meeting.startedAt)}</span>
      </div>
      <p dir="auto" className="break-words text-body-md font-medium text-on-surface">{item.statement}</p>
      {isPromise && (item.assignee || item.dueDate) && (
        <div className="flex flex-wrap items-center gap-4 text-body-md text-on-surface-variant">
          {item.assignee && (
            <span className="inline-flex items-center gap-1"><User className="h-4 w-4" /> {item.assignee}</span>
          )}
          {item.dueDate && (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-4 w-4" /> Due {new Date(`${item.dueDate}T00:00:00`).toLocaleDateString()}
            </span>
          )}
        </div>
      )}
      <OutcomeCard outcome={item.outcome} onOpenTask={onOpenTask} />
      {outside && <p className="text-body-md text-on-surface-variant">Evidence outside this project</p>}
    </li>
  );
};

// Decisions and promises across the project's meetings (spec 0004 AC-57, AC-58).
const DecisionsTab = ({ project }: { project: ProjectDetail }) => {
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [data, setData] = useState<ProjectLedgerResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [saving, setSaving] = useState<{ id: string; decision: LedgerReviewDecision } | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const moreRef = useRef<AbortController | null>(null);
  const { timedOut } = useLoadingTimeout(isLoading, { retryNonce });

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    moreRef.current?.abort();
    setIsLoading(true);
    setFailed(false);
    setMoreFailed(false);
    setLoadingMore(false);
    getProjectLedger(project.id, { kind, status }, controller.signal)
      .then((json) => {
        if (!controller.signal.aborted) setData(json);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        console.error("Failed to load decisions and promises:", err);
        setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [project.id, kind, status, retryNonce]);

  useEffect(() => {
    if (timedOut) controllerRef.current?.abort();
  }, [timedOut]);

  useEffect(() => () => moreRef.current?.abort(), []);

  const retry = useCallback(() => setRetryNonce((k) => k + 1), []);

  const loadMore = async () => {
    if (!data?.nextCursor) return;
    const controller = new AbortController();
    moreRef.current = controller;
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const next = await getProjectLedger(project.id, { kind, status, cursor: data.nextCursor }, controller.signal);
      if (controller.signal.aborted) return;
      setData((current) =>
        current ? { ...next, items: [...current.items, ...next.items] } : next,
      );
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error("Failed to load more decisions and promises:", err);
      setMoreFailed(true);
    } finally {
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  };

  // After a review the first page and the group both come back fresh (AC-58a).
  const review = async (id: string, decision: LedgerReviewDecision) => {
    setSaving({ id, decision });
    const ok = await reviewLedgerLink(id, decision);
    if (!ok) {
      setSaving(null);
      toast.error("Could not save your review. Try again.");
      return;
    }
    moreRef.current?.abort();
    setLoadingMore(false);
    try {
      setData(await getProjectLedger(project.id, { kind, status }));
    } catch (err) {
      console.error("Failed to reload after a review:", err);
      toast.error("Your review saved, but the list did not refresh.");
    } finally {
      setSaving(null);
    }
  };

  const filters = (
    <div className="flex flex-wrap gap-3">
      <select aria-label="Filter by kind" value={kind} onChange={(e) => setKind(e.target.value)} className={selectClass}>
        <option value="">All kinds</option>
        <option value="promise">Promises</option>
        <option value="decision">Decisions</option>
      </select>
      <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} className={selectClass}>
        <option value="">Any status</option>
        <option value="open">Open</option>
        <option value="overdue">Overdue</option>
        <option value="kept">Kept</option>
        <option value="reversed">Reversed</option>
      </select>
    </div>
  );

  if (timedOut || (failed && !isLoading)) {
    return <LoadError message="We couldn't load decisions and promises." onRetry={retry} />;
  }

  return (
    <div className="flex flex-col gap-6">
      {data && data.canReview && data.needsReview.length > 0 && (
        <section aria-label="Needs your review" className="flex flex-col gap-3">
          <h2 className="text-headline-sm font-semibold text-on-surface">Needs your review</h2>
          {data.reviewCount > REVIEW_LIMIT && (
            <p className="text-body-md text-on-surface-variant">
              Showing {REVIEW_LIMIT} of {data.reviewCount}, review these to see the rest
            </p>
          )}
          <ul className="flex flex-col gap-3">
            {data.needsReview.map((row) => (
              <ReviewCard key={row.id} row={row} saving={saving?.id === row.id ? saving.decision : null} onReview={review} />
            ))}
          </ul>
        </section>
      )}

      {filters}

      {isLoading || !data ? (
        <LoaderOne />
      ) : data.items.length === 0 ? (
        <p className="text-body-md text-on-surface-variant">
          {kind || status
            ? "Nothing matches these filters. You can try a different filter."
            : "No decisions or promises yet. Add a meeting to this project, and they appear here once its transcript is processed."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.items.map((item) => (
            <ItemCard key={item.id} item={item} onOpenTask={setOpenTaskId} />
          ))}
        </ul>
      )}

      {!isLoading && data?.nextCursor && (
        <div className="flex flex-col items-start gap-2">
          {moreFailed && <p className="text-body-md text-error">We couldn&apos;t load more. You can try again.</p>}
          <button type="button" disabled={loadingMore} onClick={loadMore} className={secondaryButton}>
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

      {openTaskId && <TaskDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} />}
    </div>
  );
};

export default DecisionsTab;
