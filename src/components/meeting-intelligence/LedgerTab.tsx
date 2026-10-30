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
  LedgerLinkState,
  LedgerResponse,
  LedgerReviewDecision,
} from "@/lib/meeting-types";
import {
  LEDGER_MATCH_FAILED_MESSAGE,
  requestLedgerMatch,
} from "@/lib/ledger-match-client";
import { fetchLedger, reviewLedgerLink } from "@/lib/ledger-client";
import TabEmptyState from "./EmptyState";

const formatDate = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString();

const STATUS_BADGE: Record<LedgerDerivedStatus, { label: string; className: string }> = {
  open: { label: "Open", className: "bg-surface-container-high text-on-surface-variant" },
  overdue: { label: "Overdue", className: "bg-error-container text-on-error-container" },
  kept: { label: "Kept", className: "bg-primary-container/15 text-primary-container" },
  reversed: { label: "Reversed", className: "bg-error-container text-error" },
};

const badgeBase =
  "rounded-full px-3 py-1 text-label-caps font-medium uppercase tracking-wider";

const LedgerItemCard = ({ item }: { item: LedgerItemView }) => {
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
      </div>

      <p className="font-body-md font-medium text-on-surface">{item.statement}</p>

      <blockquote className="flex gap-2 rounded-lg bg-surface-container-low px-4 py-3 text-body-md text-on-surface-variant">
        <Quote className="mt-1 h-4 w-4 shrink-0 text-primary-container" />
        <span className="flex flex-col gap-1">
          <span dir="auto" className="italic text-on-surface">
            {item.quote}
          </span>
          <span>
            {item.speaker ? `${item.speaker} · ` : ""}line {item.lineNumber}
          </span>
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
          {item.links.map((link) => (
            <li key={link.id} className="flex flex-col gap-1 text-body-md text-on-surface-variant">
              <span className="text-label-caps font-medium uppercase tracking-wider">
                Later meeting · {link.relation} · {link.state}
              </span>
              <span dir="auto" className="italic text-on-surface">
                {link.quote}
              </span>
              <span>
                {link.speaker ? `${link.speaker} · ` : ""}line {link.lineNumber}
              </span>
            </li>
          ))}
        </ul>
      )}
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
  quote: string;
  meta: string;
}) => (
  <blockquote className="flex flex-col gap-1 rounded-lg bg-surface-container-low px-4 py-3 text-body-md text-on-surface-variant">
    <span className="text-label-caps font-medium uppercase tracking-wider">{label}</span>
    <span dir="auto" className="italic text-on-surface">
      {quote}
    </span>
    <span>{meta}</span>
  </blockquote>
);

const earlierLabel = (link: LedgerIncomingLink): string =>
  `Earlier · ${link.sourceMeeting.title} · ${new Date(link.sourceMeeting.startedAt).toLocaleDateString()}`;

const quoteMeta = (speaker: string | null, lineNumber: number): string =>
  `${speaker ? `${speaker} · ` : ""}line ${lineNumber}`;

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

const primaryButton =
  "inline-flex w-fit items-center gap-2 rounded-lg bg-primary-container px-4 py-2 text-body-md font-semibold text-on-primary transition-colors hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60";
const outlineButton =
  "inline-flex w-fit items-center gap-2 rounded-lg border border-primary-container px-4 py-2 text-body-md font-semibold text-primary-container transition-colors hover:bg-primary-container/10 disabled:cursor-not-allowed disabled:opacity-60";

const MatchCard = ({
  link,
  saving,
  onReview,
}: {
  link: LedgerIncomingLink;
  saving: LedgerReviewDecision | null;
  onReview: (linkId: string, decision: LedgerReviewDecision) => void;
}) => {
  const relation = STATUS_BADGE[link.relation];
  const busy = saving !== null;
  const label = (decision: LedgerReviewDecision, text: string) =>
    saving === decision ? "Saving…" : text;

  return (
    <div className="flex flex-col gap-3 px-6 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`${badgeBase} ${relation.className}`}>{relation.label}</span>
        <span className={`${badgeBase} bg-surface-container-high text-on-surface-variant`}>
          {LINK_STATE_LABEL[link.state]}
        </span>
        <span className="text-body-md text-on-surface-variant">
          {Math.round(link.confidence * 100)}% confident
        </span>
      </div>

      <p className="font-body-md font-medium text-on-surface">{link.item.statement}</p>

      <LinkQuotes link={link} />

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
    </div>
  );
};

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
  refreshKey = 0,
  onReversalCount,
}: {
  meetingId: string;
  refreshKey?: number;
  onReversalCount?: (n: number) => void;
}) => {
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState<{ linkId: string; decision: LedgerReviewDecision } | null>(null);
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

  const reversed = data.incoming.filter(
    (link) => link.relation === "reversed" && link.state !== "rejected",
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body-md text-on-surface-variant">
          Decisions and promises, checked against your earlier meetings.
        </p>
        <button
          type="button"
          onClick={checkAgain}
          disabled={checking}
          className="inline-flex w-fit items-center gap-2 rounded-lg border border-primary-container px-4 py-2 text-body-md font-semibold text-primary-container transition-colors hover:bg-primary-container/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
          {checking ? "Checking…" : "Check again"}
        </button>
      </div>

      {data.reversalCount > 0 && reversed.length > 0 && <ReversalCard links={reversed} />}

      <div className="flex flex-col gap-3">
        <h2 className="text-headline-sm font-semibold text-on-surface">
          Matches found in this meeting
        </h2>
        {data.incoming.length === 0 ? (
          <TabEmptyState message="No earlier promises were mentioned here yet." />
        ) : (
          <div className="overflow-hidden rounded-xl border border-surface-variant bg-surface-container-lowest shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
            <div className="divide-y divide-surface-variant">
              {data.incoming.map((link) => (
                <MatchCard
                  key={link.id}
                  link={link}
                  saving={saving?.linkId === link.id ? saving.decision : null}
                  onReview={review}
                />
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
                <LedgerItemCard key={item.id} item={item} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LedgerTab;
