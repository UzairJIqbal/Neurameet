/* eslint-disable prettier/prettier */
"use client";

import React, { useState } from "react";
import toast from "react-hot-toast";
import { Quote, ShieldCheck } from "lucide-react";
import { ProjectClientError, reviewProposal } from "@/lib/project-client";
import type { ProjectMember } from "@/lib/project-types";
import type { Proposal, ReviewProposalInput } from "@/lib/task-types";
import { PriorityBadge } from "./task-visuals";
import {
  ProposalFields,
  confirmInput,
  draftFor,
  hasVerifiedQuote,
  type Draft,
} from "./proposal-draft";

const primaryButton =
  "rounded-full bg-primary-container px-4 py-2 text-body-md text-on-primary hover:bg-primary disabled:opacity-50";
const secondaryButton =
  "rounded-full border border-surface-variant px-3 py-1.5 text-body-md text-on-surface hover:bg-surface-container-low disabled:opacity-50";
const CHIP = "rounded-full px-2 py-0.5 text-xs font-medium";

type Failure = { id: string; title: string; message: string };

const failureMessage = (err: unknown) =>
  err instanceof ProjectClientError
    ? err.message
    : "We couldn't confirm this one. Try again.";

type RowProps = {
  proposal: Proposal;
  draft: Draft;
  members: ProjectMember[];
  canReview: boolean;
  selected: boolean;
  busy: boolean;
  onToggle: () => void;
  onDraft: (draft: Draft) => void;
  onDecide: (input: ReviewProposalInput) => void;
};

const ProposalRow = ({
  proposal: p,
  draft,
  members,
  canReview,
  selected,
  busy,
  onToggle,
  onDraft,
  onDecide,
}: RowProps) => {
  const [editing, setEditing] = useState(false);
  const verified = hasVerifiedQuote(p);
  const assignee = members.find((m) => m.userId === draft.assigneeId);

  const confirmAlone = () => {
    if (!window.confirm("Confirm without a transcript line?")) return;
    onDecide(confirmInput(p, draft));
  };

  return (
    <li className="flex gap-3 p-4">
      {canReview && verified && (
        <input
          type="checkbox"
          checked={selected}
          disabled={busy}
          onChange={onToggle}
          aria-label={`Select ${draft.title || p.title}`}
          className="mt-1 h-4 w-4 shrink-0 accent-primary"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="break-words font-medium text-on-surface">
            {draft.title || p.title}
          </span>
          <span
            className={`${CHIP} bg-primary-container/15 text-primary-container`}
          >
            AI proposed
          </span>
        </div>

        {verified ? (
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

        <div className="flex flex-wrap items-center gap-3 text-body-md text-on-surface-variant">
          {assignee ? (
            <span>Suggested: {assignee.name}</span>
          ) : (
            <span
              className={`${CHIP} bg-warning-container text-on-warning-container`}
            >
              Unassigned
            </span>
          )}
          <PriorityBadge priority={draft.priority} />
          {draft.dueDate && (
            <span className="font-mono text-label-mono">
              Due {draft.dueDate}
            </span>
          )}
        </div>

        {p.duplicate && (
          <p className="text-body-md text-on-surface-variant">
            Looks like{" "}
            <span className="font-mono text-label-mono">{p.duplicate.key}</span>{" "}
            {p.duplicate.title}
          </p>
        )}

        {editing && (
          <ProposalFields
            draft={draft}
            members={members}
            disabled={busy}
            onChange={onDraft}
          />
        )}

        {canReview && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing((v) => !v)}
              className={secondaryButton}
            >
              {editing ? "Done" : "Edit"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onDecide({ decision: "reject" })}
              className={secondaryButton}
            >
              Dismiss
            </button>
            {p.duplicate && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  onDecide({
                    decision: "merge",
                    mergeIntoTaskId: p.duplicate?.taskId,
                  })
                }
                className={secondaryButton}
              >
                Merge into {p.duplicate.key}
              </button>
            )}
            {!verified && (
              <button
                type="button"
                disabled={busy || draft.title.trim().length === 0}
                onClick={confirmAlone}
                className={secondaryButton}
              >
                Confirm without a quote
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
};

type Props = {
  proposals: Proposal[];
  members: ProjectMember[];
  canReview: boolean;
  busyId: string | null;
  onDecide: (p: Proposal, input: ReviewProposalInput) => Promise<void>;
  onConfirmed: (ids: string[]) => void;
  onStale: () => void;
};

// AC-70w: a meeting's proposals with bulk confirm. Rows with a transcript line
// start selected, except a likely duplicate, which a person picks on purpose. A
// row with no line never joins the bulk button and has its own confirm step.
const MeetingProposals = ({
  proposals,
  members,
  canReview,
  busyId,
  onDecide,
  onConfirmed,
  onStale,
}: Props) => {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set());
  const [failures, setFailures] = useState<Failure[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);

  const draftOf = (p: Proposal) => drafts[p.id] ?? draftFor(p);
  const isSelected = (p: Proposal) =>
    hasVerifiedQuote(p) && toggled.has(p.id) === !!p.duplicate;
  const selected = proposals.filter(isSelected);
  const hasBulkRows = proposals.some(hasVerifiedQuote);
  const busy = bulkBusy || busyId !== null;

  const toggle = (id: string) =>
    setToggled((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const confirmSelected = async () => {
    setBulkBusy(true);
    const done: string[] = [];
    const failed: Failure[] = [];
    let stale = false;
    for (const p of selected) {
      const draft = draftOf(p);
      if (draft.title.trim().length === 0) {
        failed.push({
          id: p.id,
          title: p.title,
          message: "Add a title first.",
        });
        continue;
      }
      try {
        await reviewProposal(p.id, confirmInput(p, draft));
        done.push(p.id);
      } catch (err) {
        failed.push({
          id: p.id,
          title: draft.title,
          message: failureMessage(err),
        });
        if (err instanceof ProjectClientError && err.status === 409)
          stale = true;
      }
    }
    setFailures(failed);
    setBulkBusy(false);
    if (done.length > 0) {
      onConfirmed(done);
      toast.success(
        done.length === 1 ? "1 task created" : `${done.length} tasks created`,
      );
    }
    if (stale) onStale();
  };

  const decideRow = (p: Proposal, input: ReviewProposalInput) => {
    setFailures([]);
    return onDecide(p, input);
  };

  return (
    <section aria-label="Review" className="flex flex-col gap-3">
      <div className="flex gap-3 rounded-lg border border-surface-variant bg-surface-container-low p-4">
        <ShieldCheck
          className="mt-0.5 h-5 w-5 shrink-0 text-primary-container"
          aria-hidden
        />
        <div className="flex flex-col gap-1">
          <h3 className="font-medium text-on-surface">Human review required</h3>
          <p className="text-body-md text-on-surface-variant">
            NeuraMeet proposed these tasks from the transcript. Nothing is
            created or assigned until you confirm. Assignees are suggested only
            where someone explicitly accepted the work.
          </p>
          {!canReview && (
            <p className="text-body-md text-on-surface-variant">
              An Owner or Admin reviews these proposals.
            </p>
          )}
        </div>
      </div>

      <ul className="flex flex-col divide-y divide-surface-variant rounded-lg border border-surface-variant bg-surface-container-lowest">
        {proposals.map((p) => (
          <ProposalRow
            key={p.id}
            proposal={p}
            draft={draftOf(p)}
            members={members}
            canReview={canReview}
            selected={isSelected(p)}
            busy={busy}
            onToggle={() => toggle(p.id)}
            onDraft={(draft) =>
              setDrafts((prev) => ({ ...prev, [p.id]: draft }))
            }
            onDecide={(input) => void decideRow(p, input)}
          />
        ))}
      </ul>

      {failures.length > 0 && (
        <ul
          role="alert"
          className="flex flex-col gap-1 rounded-lg bg-error-container p-3 text-body-md text-on-error-container"
        >
          {failures.map((failure) => (
            <li key={failure.id} className="break-words">
              {failure.title}: {failure.message}
            </li>
          ))}
        </ul>
      )}

      {canReview && hasBulkRows && (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={busy || selected.length === 0}
            onClick={confirmSelected}
            className={primaryButton}
          >
            Confirm and Create Tasks ({selected.length})
          </button>
        </div>
      )}
    </section>
  );
};

export default MeetingProposals;
