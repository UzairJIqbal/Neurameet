/* eslint-disable prettier/prettier */
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { CalendarDays, Quote, RefreshCw, User } from "lucide-react";
import { LoaderOne } from "@/components/ui/loader";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { LoadError } from "@/components/ui/load-error";
import {
  LedgerDerivedStatus,
  LedgerIncomingLink,
  LedgerItemView,
  LedgerLink,
  LedgerLinkState,
  LedgerLiveOnlyMark,
  LedgerResponse,
  LedgerReviewDecision,
} from "@/lib/meeting-types";
import {
  LEDGER_MATCH_FAILED_MESSAGE,
  requestLedgerMatch,
} from "@/lib/ledger-match-client";
import { fetchLedger, reviewLedgerLink } from "@/lib/ledger-client";
import OutcomeCard from "@/components/projects/OutcomeCard";
import TaskDrawer from "@/components/projects/TaskDrawer";
import TabEmptyState from "./EmptyState";

const formatDate = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString();

export const STATUS_BADGE: Record<LedgerDerivedStatus, { label: string; className: string }> = {
  open: { label: "Open", className: "bg-surface-container-high text-on-surface-variant" },
  overdue: { label: "Overdue", className: "bg-error-container text-on-error-container" },
  kept: { label: "Kept", className: "bg-primary-container/15 text-primary-container" },
  reversed: { label: "Reversed", className: "bg-error-container text-error" },
};

export const badgeBase =
  "rounded-full px-3 py-1 text-label-caps font-medium uppercase tracking-wider";

// Live Ledger (spec 0002 AC-15): marks made during a call.
const LIVE_BADGE = `${badgeBase} border border-primary-container text-primary-container`;

const LiveBadge = () => <span className={LIVE_BADGE}>Marked live</span>;

const quoteMeta = (speaker: string | null, lineNumber: number | null): string =>
  [speaker, lineNumber === null ? null : `line ${lineNumber}`].filter(Boolean).join(" · ");

const itemMeta = (item: LedgerItemView): string =>
  item.source === "live_agreement"
    ? `Agreed live by ${item.agreedCount ?? 0} of ${item.totalCount ?? 0}`
    : quoteMeta(item.speaker, item.lineNumber);

const HIDDEN_QUOTE = "Hidden for viewers";

const primaryButton =
  "inline-flex w-fit items-center gap-2 rounded-lg bg-primary-container px-4 py-2 text-body-md font-semibold text-on-primary transition-colors hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60";
const outlineButton =
  "inline-flex w-fit items-center gap-2 rounded-lg border border-primary-container px-4 py-2 text-body-md font-semibold text-primary-container transition-colors hover:bg-primary-container/10 disabled:cursor-not-allowed disabled:opacity-60";

type ReviewHandler = (linkId: string, decision: LedgerReviewDecision) => void;

const savingLabel = (
  saving: LedgerReviewDecision | null,
  decision: LedgerReviewDecision,
  text: string,
): string => (saving === decision ? "Saving…" : text);

// The server refuses to confirm or undo a reverted PR's link, so those buttons
// are not offered (AC-55a).
const CodeLinkControls = ({
  link,
  saving,
  onReview,
}: {
  link: LedgerLink;
  saving: LedgerReviewDecision | null;
  onReview: ReviewHandler;
}) => {
  const busy = saving !== null;
  const reverted = link.pr?.reverted === true;
  if (link.state !== "suggested") {
    if (reverted) return null;
    return (
      <button type="button" disabled={busy} onClick={() => onReview(link.id, "reset")} className={`${outlineButton} mt-1`}>
        {savingLabel(saving, "reset", "Undo")}
      </button>
    );
  }
  return (
    <div className="mt-1 flex flex-wrap gap-2">
      {!reverted && (
        <button type="button" disabled={busy} onClick={() => onReview(link.id, "confirm")} className={primaryButton}>
          {savingLabel(saving, "confirm", "Confirm")}
        </button>
      )}
      <button type="button" disabled={busy} onClick={() => onReview(link.id, "reject")} className={outlineButton}>
        {savingLabel(saving, "reject", "Not a match")}
      </button>
    </div>
  );
};

// A merged PR as evidence (AC-55a). A Viewer's copy has no `pr` and no title.
const CodeLinkRow = ({
  link,
  canManage,
  saving,
  onReview,
}: {
  link: LedgerLink;
  canManage: boolean;
  saving: LedgerReviewDecision | null;
  onReview: ReviewHandler;
}) => (
  <li className="flex flex-col gap-1 text-body-md text-on-surface-variant">
    <span className="text-label-caps font-medium uppercase tracking-wider">
      Merged PR{link.pr ? ` · ${link.pr.repoFullName} #${link.pr.prNumber}` : ""} · {link.relation} · {link.state}
      {link.pr?.reverted ? " · reverted" : ""}
    </span>
    {link.pr ? (
      <a
        href={link.pr.prUrl}
        target="_blank"
        rel="noopener noreferrer"
        dir="auto"
        className="w-fit break-words text-primary underline"
      >
        {link.quote}
      </a>
    ) : (
      <span dir="auto">{link.quote ?? HIDDEN_QUOTE}</span>
    )}
    {canManage && <CodeLinkControls link={link} saving={saving} onReview={onReview} />}
  </li>
);

const LedgerItemCard = ({
  item,
  canManage,
  saving,
  onReview,
  onOpenTask,
}: {
  item: LedgerItemView;
  canManage: boolean;
  saving: { linkId: string; decision: LedgerReviewDecision } | null;
  onReview: ReviewHandler;
  onOpenTask: (taskId: string) => void;
}) => {
  const status = STATUS_BADGE[item.derivedStatus];
  const isPromise = item.kind === "promise";

  return (
    <div className="flex flex-col gap-3 px-6 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`${badgeBase} ${
            isPromise
              ? "bg-primary-container/15 text-primary-container"
              : "bg-secondary-container text-on-secondary-container"
          }`}
        >
          {isPromise ? "Promise" : "Decision"}
        </span>
        <span className={`${badgeBase} ${status.className}`}>{status.label}</span>
        {item.liveMark && <LiveBadge />}
      </div>

      <p className="font-body-md font-medium text-on-surface">{item.statement}</p>

      <blockquote className="flex gap-2 rounded-lg bg-surface-container-low px-4 py-3 text-body-md text-on-surface-variant">
        <Quote className="mt-1 h-4 w-4 shrink-0 text-primary-container" />
        <span className="flex flex-col gap-1">
          <span dir="auto" className="italic text-on-surface">
            {item.quote ?? HIDDEN_QUOTE}
          </span>
          <span>{itemMeta(item)}</span>
        </span>
      </blockquote>

      {isPromise && (item.assignee || item.dueDate) && (
        <div className="flex flex-wrap items-center gap-4 text-body-md text-on-surface-variant">
          {item.assignee && (
            <span className="inline-flex items-center gap-1">
              <User className="h-4 w-4" /> {item.assignee}
            </span>
          )}
          {item.dueDate && (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-4 w-4" /> Due {formatDate(item.dueDate)}
            </span>
          )}
        </div>
      )}

      {item.links.length > 0 && (
        <ul className="flex flex-col gap-2 border-l-2 border-surface-variant pl-4">
          {item.links.map((link) =>
            link.evidenceKind === "code" ? (
              <CodeLinkRow
                key={link.id}
                link={link}
                canManage={canManage}
                saving={saving?.linkId === link.id ? saving.decision : null}
                onReview={onReview}
              />
            ) : (
              <li key={link.id} className="flex flex-col gap-1 text-body-md text-on-surface-variant">
                <span className="text-label-caps font-medium uppercase tracking-wider">
                  Later meeting · {link.relation} · {link.state}
                </span>
                {link.outsideProject ? (
                  <span>Evidence outside this project</span>
                ) : (
                  <>
                    <span dir="auto" className="italic text-on-surface">
                      {link.quote ?? HIDDEN_QUOTE}
                    </span>
                    <span>{quoteMeta(link.speaker, link.lineNumber)}</span>
                  </>
                )}
              </li>
            ),
          )}
        </ul>
      )}

      {item.outcome && <OutcomeCard outcome={item.outcome} onOpenTask={onOpenTask} />}
    </div>
  );
};

const LINK_STATE_LABEL: Record<LedgerLinkState, string> = {
  suggested: "Suggested",
  confirmed: "Confirmed",
  rejected: "Not a match",
};

const QuoteBlock = ({
  label,
  quote,
  meta,
}: {
  label: string;
  quote: string | null;
  meta: string;
}) => (
  <blockquote className="flex flex-col gap-1 rounded-lg bg-surface-container-low px-4 py-3 text-body-md text-on-surface-variant">
    <span className="text-label-caps font-medium uppercase tracking-wider">{label}</span>
    <span dir="auto" className="italic text-on-surface">
      {quote ?? HIDDEN_QUOTE}
    </span>
    <span>{meta}</span>
  </blockquote>
);

const earlierLabel = (link: LedgerIncomingLink): string =>
  `Earlier · ${link.sourceMeeting.title} · ${new Date(link.sourceMeeting.startedAt).toLocaleDateString()}`;

const LinkQuotes = ({ link }: { link: LedgerIncomingLink }) => (
  <div className="grid gap-3 md:grid-cols-2">
    <QuoteBlock
      label={earlierLabel(link)}
      quote={link.item.quote}
      meta={quoteMeta(link.item.speaker, link.item.lineNumber)}
    />
    <QuoteBlock
      label="In this meeting"
      quote={link.quote}
      meta={quoteMeta(link.speaker, link.lineNumber)}
    />
  </div>
);

const MatchCard = ({
  link,
  canManage,
  saving,
  onReview,
}: {
  link: LedgerIncomingLink;
  canManage: boolean;
  saving: LedgerReviewDecision | null;
  onReview: ReviewHandler;
}) => {
  const relation = STATUS_BADGE[link.relation];
  const busy = saving !== null;
  const label = (decision: LedgerReviewDecision, text: string) =>
    savingLabel(saving, decision, text);

  return (
    <div className="flex flex-col gap-3 px-6 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`${badgeBase} ${relation.className}`}>{relation.label}</span>
        <span className={`${badgeBase} bg-surface-container-high text-on-surface-variant`}>
          {LINK_STATE_LABEL[link.state]}
        </span>
        {link.liveMark && <LiveBadge />}
        <span className="text-body-md text-on-surface-variant">
          {Math.round(link.confidence * 100)}% confident
        </span>
      </div>

      <p className="font-body-md font-medium text-on-surface">{link.item.statement}</p>

      <LinkQuotes link={link} />

      {canManage && (
      <div className="flex flex-wrap gap-2">
        {link.state === "suggested" ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => onReview(link.id, "confirm")}
              className={primaryButton}
            >
              {label("confirm", "Confirm")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onReview(link.id, "reject")}
              className={outlineButton}
            >
              {label("reject", "Not a match")}
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => onReview(link.id, "reset")}
            className={outlineButton}
          >
            {label("reset", "Undo")}
          </button>
        )}
      </div>
      )}
    </div>
  );
};

const LiveOnlyCard = ({ entry }: { entry: LedgerLiveOnlyMark }) => (
  <div className="flex flex-col gap-3 px-6 py-4">
    <div className="flex flex-wrap items-center gap-2">
      <LiveBadge />
    </div>
    <p className="font-body-md font-medium text-on-surface">{entry.item.statement}</p>
    <p className="text-body-md text-on-surface-variant">
      Marked live as {entry.mark === "open" ? "still open" : entry.mark}, no transcript evidence found
    </p>
    <QuoteBlock
      label={`Earlier · ${entry.sourceMeeting.title} · ${new Date(entry.sourceMeeting.startedAt).toLocaleDateString()}`}
      quote={entry.item.quote}
      meta={quoteMeta(entry.item.speaker, entry.item.lineNumber)}
    />
  </div>
);

const ReversalCard = ({ links }: { links: LedgerIncomingLink[] }) => (
  <div className="flex flex-col gap-4 rounded-xl bg-error-container px-6 py-4 text-error">
    <h2 className="text-headline-sm font-semibold">
      {links.length === 1
        ? "1 earlier decision was reversed in this meeting"
        : `${links.length} earlier decisions were reversed in this meeting`}
    </h2>
    {links.map((link) => (
      <div key={link.id} className="flex flex-col gap-2">
        <p className="font-body-md font-medium">{link.item.statement}</p>
        <LinkQuotes link={link} />
      </div>
    ))}
  </div>
);

const LedgerTab = ({
  meetingId,
  canManage,
  refreshKey = 0,
  onReversalCount,
}: {
  meetingId: string;
  canManage: boolean;
  refreshKey?: number;
  onReversalCount?: (n: number) => void;
}) => {
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState<{ linkId: string; decision: LedgerReviewDecision } | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const { timedOut } = useLoadingTimeout(isLoading, { retryNonce });

  // Kept in a ref so a new callback identity never refetches the ledger.
  const onCountRef = useRef(onReversalCount);
  useEffect(() => {
    onCountRef.current = onReversalCount;
  }, [onReversalCount]);

  const applyData = useCallback((json: LedgerResponse) => {
    setData(json);
    onCountRef.current?.(json.reversalCount);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setFailed(false);

    (async () => {
      try {
        const json = await fetchLedger(meetingId);
        if (!cancelled) applyData(json);
      } catch (err) {
        if (!cancelled) {
          console.error("[ledger] fetch failed:", err);
          toast.error("Could not load the ledger.");
          setFailed(true);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [meetingId, retryNonce, refreshKey, applyData]);

  const retry = () => setRetryNonce((k) => k + 1);

  // Silent refetch after a review: the current list stays until new data lands.
  const review = async (linkId: string, decision: LedgerReviewDecision) => {
    setSaving({ linkId, decision });
    const ok = await reviewLedgerLink(linkId, decision);
    if (!ok) {
      setSaving(null);
      toast.error("Could not save your review. Try again.");
      return;
    }
    try {
      applyData(await fetchLedger(meetingId));
    } catch (err) {
      console.error("[ledger] refetch after review failed:", err);
      toast.error("Could not load the ledger.");
    } finally {
      setSaving(null);
    }
  };

  const checkAgain = async () => {
    setChecking(true);
    const ok = await requestLedgerMatch(meetingId);
    setChecking(false);
    if (!ok) {
      toast.error(LEDGER_MATCH_FAILED_MESSAGE);
      return;
    }
    retry();
  };

  if (timedOut) {
    return <LoadError message="We couldn't load the ledger." onRetry={retry} />;
  }

  if (isLoading) return <LoaderOne />;

  if (failed || !data) {
    return <LoadError message="We couldn't load the ledger." onRetry={retry} />;
  }

  // Older cached responses may predate the Live Ledger fields.
  const liveOnly = data.liveOnly ?? [];
  const reversed = data.incoming.filter(
    (link) => link.relation === "reversed" && link.state !== "rejected",
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body-md text-on-surface-variant">
          Decisions and promises, checked against your earlier meetings.
        </p>
        {canManage && (
          <button
            type="button"
            onClick={checkAgain}
            disabled={checking}
            className={outlineButton}
          >
            <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
            {checking ? "Checking…" : "Check again"}
          </button>
        )}
      </div>

      {data.reversalCount > 0 && reversed.length > 0 && <ReversalCard links={reversed} />}

      <div className="flex flex-col gap-3">
        <h2 className="text-headline-sm font-semibold text-on-surface">
          Matches found in this meeting
        </h2>
        {data.incoming.length === 0 && liveOnly.length === 0 ? (
          <TabEmptyState message="No earlier promises were mentioned here yet." />
        ) : (
          <div className="overflow-hidden rounded-xl border border-surface-variant bg-surface-container-lowest shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
            <div className="divide-y divide-surface-variant">
              {data.incoming.map((link) => (
                <MatchCard
                  key={link.id}
                  link={link}
                  canManage={canManage}
                  saving={saving?.linkId === link.id ? saving.decision : null}
                  onReview={review}
                />
              ))}
              {liveOnly.map((entry) => (
                <LiveOnlyCard key={`live-${entry.item.id}`} entry={entry} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-headline-sm font-semibold text-on-surface">
          Said in this meeting
        </h2>
        {data.items.length === 0 ? (
          <TabEmptyState message="No decisions or promises found in this meeting." />
        ) : (
          <div className="overflow-hidden rounded-xl border border-surface-variant bg-surface-container-lowest shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
            <div className="divide-y divide-surface-variant">
              {data.items.map((item) => (
                <LedgerItemCard
                  key={item.id}
                  item={item}
                  canManage={canManage}
                  saving={saving}
                  onReview={review}
                  onOpenTask={setOpenTaskId}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {openTaskId && <TaskDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} />}
    </div>
  );
};

export default LedgerTab;
