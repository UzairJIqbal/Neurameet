/* eslint-disable prettier/prettier */
"use client";

import React from "react";
import Link from "next/link";
import { TASK_STATUS_LABELS, isTaskStatus } from "@/lib/tasks";
import type { Outcome } from "@/lib/proof-types";

// The Proof Chain in one card (spec 0004 AC-60): what was said, the task, what
// shipped, and whether the promise was kept. Read only, every word from the spec.

const muted = "text-body-md text-on-surface-variant";
const strong = "text-body-md text-on-surface";

const SaidStep = ({ said }: { said: Outcome["said"] }) => {
  const meeting = said.meetingId && (
    <Link href={`/meeting-intelligence/${said.meetingId}`} className="w-fit break-words text-body-md text-primary underline">
      {said.meetingTitle ?? "Open the meeting"}
    </Link>
  );
  const more = !!said.moreCount && <span className={muted}>+{said.moreCount} more</span>;
  if (said.state === "typed") return <span className={muted}>Typed by hand, no quote</span>;
  if (said.state === "no_quote") {
    return (
      <>
        <span className={muted}>Confirmed without a quote</span>
        {meeting}
        {more}
      </>
    );
  }
  if (said.state === "hidden") {
    return (
      <>
        <span className={muted}>Hidden for viewers</span>
        {meeting}
        {more}
      </>
    );
  }
  const meta = [said.speaker, said.lineNumber === undefined ? null : `line ${said.lineNumber}`]
    .filter(Boolean)
    .join(" · ");
  return (
    <>
      <span dir="auto" className="break-words italic text-on-surface">{said.quote}</span>
      {meta && <span className={muted}>{meta}</span>}
      {meeting}
      {more}
    </>
  );
};

const TaskStep = ({ task, onOpenTask }: { task: Outcome["task"]; onOpenTask?: (taskId: string) => void }) => {
  if (task.state === "waiting") return <span className={muted}>Waiting in proposals</span>;
  if (task.state === "rejected") return <span className={muted}>Proposal rejected</span>;
  if (task.state === "none") return <span className={muted}>No task yet</span>;
  if (task.state === "decision") return <span className={muted}>No task, this is a decision</span>;
  const status = task.status && isTaskStatus(task.status) ? TASK_STATUS_LABELS[task.status] : task.status;
  const label = [task.key, status].filter(Boolean).join(" · ");
  if (onOpenTask && task.taskId) {
    const taskId = task.taskId;
    return (
      <button type="button" onClick={() => onOpenTask(taskId)} className="w-fit text-left text-body-md text-primary underline">
        {label}
      </button>
    );
  }
  return <span className={strong}>{label}</span>;
};

const ShippedStep = ({ shipped }: { shipped: Outcome["shipped"] }) => {
  if (shipped.state === "reverted") return <span className="text-body-md text-error">Reverted</span>;
  if (shipped.state === "manual") return <span className={strong}>Completed by hand, no PR</span>;
  if (shipped.state === "none") return <span className={muted}>Not yet</span>;
  if (shipped.state === "not_applicable") return <span className={muted}>Not needed</span>;
  if (!shipped.prUrl) return <span className={strong}>Merged</span>;
  return (
    <a href={shipped.prUrl} target="_blank" rel="noopener noreferrer" className="w-fit break-all text-body-md text-primary underline">
      {shipped.repoFullName} #{shipped.prNumber}
    </a>
  );
};

const KeptStep = ({ kept }: { kept: Outcome["kept"] }) => {
  if (kept.state === "kept") return <span className="text-body-md font-medium text-primary-container">Kept</span>;
  if (kept.state === "partial") return <span className={strong}>{kept.keptCount} of {kept.total} kept</span>;
  if (kept.state === "reversed") return <span className="text-body-md text-error">Reversed</span>;
  if (kept.state === "review") return <span className={strong}>Waiting for review</span>;
  if (kept.state === "no_promise") return <span className={muted}>No promise linked</span>;
  return <span className={muted}>Not yet</span>;
};

const Step = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex min-w-0 flex-col gap-1">
    <span className="text-label-caps uppercase tracking-wider text-on-surface-variant">{label}</span>
    {children}
  </div>
);

const OutcomeCard = ({ outcome, onOpenTask }: { outcome: Outcome; onOpenTask?: (taskId: string) => void }) => (
  <section aria-label="Outcome" className="grid gap-4 rounded-lg bg-surface-container-low p-4 md:grid-cols-4">
    <Step label="Said"><SaidStep said={outcome.said} /></Step>
    <Step label="Task"><TaskStep task={outcome.task} onOpenTask={onOpenTask} /></Step>
    <Step label="Shipped"><ShippedStep shipped={outcome.shipped} /></Step>
    <Step label="Kept"><KeptStep kept={outcome.kept} /></Step>
  </section>
);

export default OutcomeCard;
