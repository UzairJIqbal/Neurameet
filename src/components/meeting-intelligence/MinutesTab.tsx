/* eslint-disable prettier/prettier */
"use client";

import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Quote, User } from "lucide-react";
import { LoaderOne } from "@/components/ui/loader";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { LoadError } from "@/components/ui/load-error";
import {
  coverageText,
  MINUTES_DEADLINE_DAYS,
  MINUTES_DEFAULT_DEADLINE_DAYS,
  type MinutesDraft,
  type MinutesDraftLine,
  type MinutesResponse,
  type MinutesSection,
} from "@/lib/minutes-types";
import { fetchMinutes, openReview } from "@/lib/minutes-client";
import TabEmptyState from "./EmptyState";
import MinutesReview, { badgeBase, cardShell } from "./MinutesReview";

// Tasdeeq, Verified Minutes (spec 0003): the owner's draft with the transcript
// proof under every line, then the open review and the sealed record.

const SECTIONS: Array<{ section: MinutesSection; title: string }> = [
  { section: "summary", title: "Summary" },
  { section: "key_point", title: "Key points" },
  { section: "decision", title: "Decisions" },
  { section: "action_item", title: "Action items" },
];

const evidenceMeta = (lineNumber: number, speaker: string | null): string =>
  `Line ${lineNumber}${speaker ? ` · ${speaker}` : ""}`;

const MinutesLineCard = ({ line }: { line: MinutesDraftLine }) => (
  <div className="flex flex-col gap-3 px-6 py-4">
    <div className="flex flex-wrap items-center gap-2">
      <p className="font-body-md font-medium text-on-surface">{line.text}</p>
      {!line.supported && (
        <span className={`${badgeBase} bg-error-container text-error`}>Unsupported</span>
      )}
    </div>

    {line.section === "action_item" && line.assignee && (
      <span className="inline-flex items-center gap-1 text-body-md text-on-surface-variant">
        <User className="h-4 w-4" /> {line.assignee}
      </span>
    )}

    {line.evidence.map((e) => (
      <blockquote
        key={e.lineNumber}
        className="flex gap-2 rounded-lg bg-surface-container-low px-4 py-3 text-body-md text-on-surface-variant"
      >
        <Quote className="mt-1 h-4 w-4 shrink-0 text-primary-container" />
        <span className="flex flex-col gap-1">
          <span dir="auto" className="italic text-on-surface">
            &ldquo;{e.quote}&rdquo;
          </span>
          <span>{evidenceMeta(e.lineNumber, e.speaker)}</span>
        </span>
      </blockquote>
    ))}
  </div>
);

const OpenReviewBar = ({
  meetingId,
  onOpened,
}: {
  meetingId: string;
  onOpened: () => Promise<void>;
}) => {
  const [days, setDays] = useState<number>(MINUTES_DEFAULT_DEADLINE_DAYS);
  const [opening, setOpening] = useState(false);
  const open = async () => {
    setOpening(true);
    try {
      await openReview(meetingId, days);
      toast.success("Review opened. Attendees were emailed.");
      await onOpened();
    } catch (err) {
      console.error("[tasdeeq] open review failed:", err);
      toast.error(err instanceof Error ? err.message : "Could not open the review.");
    } finally {
      setOpening(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="inline-flex items-center gap-2 text-body-md text-on-surface-variant">
        Review deadline
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-lg border border-surface-variant bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface"
        >
          {MINUTES_DEADLINE_DAYS.map((d) => (
            <option key={d} value={d}>
              {d} working days
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={opening}
        onClick={() => void open()}
        className="inline-flex w-fit items-center gap-2 rounded-lg bg-primary-container px-4 py-2 text-body-md font-semibold text-on-primary transition-colors hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
      >
        {opening ? "Opening review" : "Open review"}
      </button>
      <span className="text-body-md text-on-surface-variant">
        Each attendee confirms the lines they said before you seal.
      </span>
    </div>
  );
};

const DraftView = ({
  draft,
  fromRecording,
  meetingId,
  onOpened,
}: {
  draft: MinutesDraft;
  fromRecording: boolean;
  meetingId: string;
  onOpened: () => Promise<void>;
}) => (
  <div className="flex flex-col gap-6">
    <div className="flex flex-col gap-1 rounded-lg bg-surface-container-low px-4 py-3 text-body-md text-on-surface-variant">
      <span>{coverageText(draft.coverage)}</span>
      {fromRecording && <span>Quotes are English translations of the recording</span>}
    </div>

    {SECTIONS.map(({ section, title }) => {
      const lines = draft.lines.filter((l) => l.section === section);
      if (lines.length === 0) return null;
      return (
        <section key={section} className="flex flex-col gap-3">
          <h2 className="text-headline-sm font-semibold text-on-surface">{title}</h2>
          <div className={cardShell}>
            <div className="divide-y divide-surface-variant">
              {lines.map((line, i) => (
                <MinutesLineCard key={`${section}-${i}`} line={line} />
              ))}
            </div>
          </div>
        </section>
      );
    })}

    <OpenReviewBar meetingId={meetingId} onOpened={onOpened} />
  </div>
);

const MinutesTab = ({ meetingId }: { meetingId: string }) => {
  const [data, setData] = useState<MinutesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const { timedOut } = useLoadingTimeout(isLoading, { retryNonce });

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setFailed(false);

    (async () => {
      try {
        const json = await fetchMinutes(meetingId);
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) {
          console.error("[tasdeeq] minutes fetch failed:", err);
          toast.error("Could not load the minutes.");
          setFailed(true);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [meetingId, retryNonce]);

  const retry = () => setRetryNonce((k) => k + 1);

  // Quiet refetch after an action, so the tab doesn't flash the loader.
  const reload = useCallback(async () => {
    try {
      setData(await fetchMinutes(meetingId));
    } catch (err) {
      console.error("[tasdeeq] minutes refetch failed:", err);
      toast.error("Could not refresh the minutes.");
    }
  }, [meetingId]);

  if (timedOut) {
    return <LoadError message="We couldn't load the minutes." onRetry={retry} />;
  }

  if (isLoading) return <LoaderOne />;

  if (failed || !data) {
    return <LoadError message="We couldn't load the minutes." onRetry={retry} />;
  }

  if (data.state === "not_open") {
    return <TabEmptyState message="Minutes not open for review yet" />;
  }

  if (data.state === "no_draft") {
    return (
      <TabEmptyState message="These minutes were made before Verified Minutes. Reprocess the meeting from the Summary tab to create them." />
    );
  }

  if (data.state === "review") {
    return <MinutesReview meetingId={meetingId} state={data} onChanged={reload} />;
  }

  return (
    <DraftView
      draft={data.draft}
      fromRecording={data.transcriptSource === "recording"}
      meetingId={meetingId}
      onOpened={reload}
    />
  );
};

export default MinutesTab;
