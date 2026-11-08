/* eslint-disable prettier/prettier */
"use client";

import { SkeletonCard } from "@/components/ui/skeleton";
import React, { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Quote } from "lucide-react";
import { LoadError } from "@/components/ui/load-error";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import {
  listMembers,
  listProposals,
  ProjectClientError,
  reviewProposal,
} from "@/lib/project-client";
import type { ProjectDetail, ProjectMember } from "@/lib/project-types";
import type {
  Proposal,
  ProposalDecision,
  ReviewProposalInput,
} from "@/lib/task-types";
import MeetingProposals from "./MeetingProposals";
import {
  ProposalFields,
  confirmInput,
  draftFor,
  type Draft,
} from "./proposal-draft";

const primaryButton =
  "rounded-full bg-primary-container px-4 py-2 text-body-md text-on-primary hover:bg-primary disabled:opacity-50";
const secondaryButton =
  "rounded-full border border-surface-variant px-4 py-2 text-body-md text-on-surface hover:bg-surface-container-low disabled:opacity-50";

const errorText = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

type CardProps = {
  proposal: Proposal;
  members: ProjectMember[];
  canReview: boolean;
  busy: boolean;
  onDecide: (p: Proposal, input: ReviewProposalInput) => void;
};

const ProposalCard = ({
  proposal: p,
  members,
  canReview,
  busy,
  onDecide,
}: CardProps) => {
  const [draft, setDraft] = useState<Draft>(() => draftFor(p));
  const disabled = !canReview || busy;

  const confirm = () => {
    if (
      !p.quoteVerified &&
      !window.confirm("Confirm without a transcript line?")
    )
      return;
    onDecide(p, confirmInput(p, draft));
  };

  const decide = (decision: ProposalDecision) =>
    decision === "merge" && p.duplicate
      ? onDecide(p, { decision, mergeIntoTaskId: p.duplicate.taskId })
      : onDecide(p, { decision });

  return (
    <li className="flex flex-col gap-3 rounded-card bg-surface-container-lowest p-4 shadow-card">
      <p className="text-body-md text-on-surface-variant">
        {p.meetingTitle}
        {p.meetingDate && (
          <span className="font-mono text-label-mono">
            {" "}
            · {p.meetingDate.slice(0, 10)}
          </span>
        )}
      </p>

      {p.quoteVerified && p.quote ? (
        <blockquote className="flex gap-2 rounded-lg bg-surface-container-low p-3 text-body-md text-on-surface">
          <Quote
            className="mt-1 h-4 w-4 shrink-0 text-primary-container"
            aria-hidden
          />
          <span>
            &ldquo;{p.quote}&rdquo;
            <span className="block font-mono text-label-mono text-on-surface-variant">
              {[p.quoteSpeaker, p.quoteLine ? `line ${p.quoteLine}` : null]
                .filter(Boolean)
                .join(", ")}
            </span>
          </span>
        </blockquote>
      ) : (
        <p className="text-body-md text-error">No matching transcript line</p>
      )}

      <ProposalFields
        draft={draft}
        members={members}
        disabled={disabled}
        onChange={setDraft}
      />

      {p.duplicate && (
        <p className="text-body-md text-on-surface-variant">
          Looks like{" "}
          <span className="font-mono text-label-mono">{p.duplicate.key}</span>{" "}
          {p.duplicate.title}
        </p>
      )}

      {canReview && (
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => decide("reject")}
            className={secondaryButton}
          >
            Reject
          </button>
          {p.duplicate && (
            <button
              type="button"
              disabled={busy}
              onClick={() => decide("merge")}
              className={secondaryButton}
            >
              Merge into {p.duplicate.key}
            </button>
          )}
          <button
            type="button"
            disabled={busy || draft.title.trim().length === 0}
            onClick={confirm}
            className={primaryButton}
          >
            Confirm
          </button>
        </div>
      )}
    </li>
  );
};

// The review gate (AC-30 to AC-36): AI proposals wait here until an Owner or
// Admin confirms, rejects, or merges them. Developers see them read only. The
// section is not shown at zero (AC-70c). With `meetingId` it shows that meeting's
// rows with bulk confirm (AC-70w).
const ProposalsPanel = ({
  project,
  meetingId,
  onChanged,
}: {
  project: Pick<ProjectDetail, "id">;
  meetingId?: string;
  onChanged?: () => void;
}) => {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [canReview, setCanReview] = useState(false);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const { timedOut } = useLoadingTimeout(isLoading && !loaded, {
    timeoutMs: 12000,
    retryNonce,
  });

  const fetchProposals = useCallback(
    async (signal?: AbortSignal) => {
      const data = await listProposals(project.id, signal);
      setProposals(data.proposals);
      setCanReview(data.canReview);
    },
    [project.id],
  );

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    const load = async () => {
      try {
        setIsLoading(true);
        const [, memberData] = await Promise.all([
          fetchProposals(controller.signal),
          listMembers(project.id, controller.signal),
        ]);
        setMembers(memberData.members);
        setLoaded(true);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("Failed to load proposals:", err);
        toast.error(errorText(err, "Failed to load proposals"));
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [fetchProposals, project.id, retryNonce]);

  useEffect(() => {
    if (timedOut) controllerRef.current?.abort();
  }, [timedOut]);

  useEffect(() => {
    const onFocus = () => {
      fetchProposals().catch((err) =>
        console.error("Proposals refresh failed:", err),
      );
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchProposals]);

  const decide = async (p: Proposal, input: ReviewProposalInput) => {
    setBusyId(p.id);
    try {
      const res = await reviewProposal(p.id, input);
      setProposals((prev) => prev.filter((x) => x.id !== p.id));
      if (input.decision === "reject") toast.success("Proposal rejected");
      else if (res.task)
        toast.success(
          `${res.task.key} ${input.decision === "merge" ? "updated" : "created"}`,
        );
      if (input.decision !== "reject") onChanged?.();
    } catch (err) {
      toast.error(errorText(err, "Failed to review the proposal"));
      if (err instanceof ProjectClientError && err.status === 409) {
        fetchProposals().catch(() => undefined);
      }
    } finally {
      setBusyId(null);
    }
  };

  const reload = useCallback(() => setRetryNonce((k) => k + 1), []);

  if (timedOut)
    return (
      <LoadError
        compact
        message="We couldn't load the proposals."
        onRetry={reload}
      />
    );
  if (!loaded && isLoading) return <SkeletonCard />;
  if (!loaded)
    return (
      <LoadError
        compact
        message="We couldn't load the proposals."
        onRetry={reload}
      />
    );

  const visible = meetingId
    ? proposals.filter((p) => p.meetingId === meetingId)
    : proposals;
  if (visible.length === 0) return null;

  if (meetingId) {
    return (
      <MeetingProposals
        proposals={visible}
        members={members}
        canReview={canReview}
        busyId={busyId}
        onDecide={decide}
        onConfirmed={(ids) => {
          setProposals((prev) => prev.filter((x) => !ids.includes(x.id)));
          onChanged?.();
        }}
        onStale={() => {
          fetchProposals().catch(() => undefined);
        }}
      />
    );
  }

  return (
    <section aria-label="Review" className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 text-headline-sm text-on-surface">
        Review
        <span className="rounded-full bg-warning-container px-2 py-0.5 text-xs font-medium text-on-warning-container">
          {visible.length}
        </span>
      </h3>
      {!canReview && (
        <p className="text-body-md text-on-surface-variant">
          An Owner or Admin reviews these proposals.
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {visible.map((p) => (
          <ProposalCard
            key={p.id}
            proposal={p}
            members={members}
            canReview={canReview}
            busy={busyId === p.id}
            onDecide={decide}
          />
        ))}
      </ul>
    </section>
  );
};

export default ProposalsPanel;
