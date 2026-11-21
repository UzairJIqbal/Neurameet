/* eslint-disable prettier/prettier */
"use client";

import React from "react";
import Link from "next/link";
import { TASK_STATUS_LABELS, isTaskStatus } from "@/lib/tasks";
import type { Outcome } from "@/lib/proof-types";

// The Proof Chain in one card (spec 0004 AC-60, slimmed by spec 0006): what was
// said, the task, and what shipped. Read only, every word from the spec.

const muted = "text-body-md text-on-surface-variant";
const strong = "text-body-md text-on-surface";

const SaidStep = ({ said }: { said: Outcome["said"] }) => {
  const meeting = said.meetingId && (
    <Link
      href={`/meeting-intelligence/${said.meetingId}`}
      className="w-fit break-words text-body-md text-primary underline"
    >
      {said.meetingTitle ?? "Open the meeting"}
    </Link>
  );
  const more = !!said.moreCount && (
    <span className={muted}>+{said.moreCount} more</span>
  );
  if (said.state === "typed")
    return <span className={muted}>Typed by hand, no quote</span>;
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
  const meta = [
    said.speaker,
    said.lineNumber === undefined ? null : `line ${said.lineNumber}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <>
      <span dir="auto" className="break-words italic text-on-surface">
        {said.quote}
      </span>
      {meta && <span className={muted}>{meta}</span>}
      {meeting}
      {more}
    </>
  );
};

const TaskStep = ({
  task,
  onOpenTask,
}: {
  task: Outcome["task"];
  onOpenTask?: (taskId: string) => void;
}) => {
  if (task.state === "none") return <span className={muted}>No task yet</span>;
  const status =
    task.status && isTaskStatus(task.status)
      ? TASK_STATUS_LABELS[task.status]
      : task.status;
  const label = [task.key, status].filter(Boolean).join(" · ");
  if (onOpenTask && task.taskId) {
    const taskId = task.taskId;
    return (
      <button
        type="button"
        onClick={() => onOpenTask(taskId)}
        className="w-fit text-left text-body-md text-primary underline"
      >
        {label}
      </button>
    );
  }
  return <span className={strong}>{label}</span>;
};

const ShippedStep = ({ shipped }: { shipped: Outcome["shipped"] }) => {
  if (shipped.state === "reverted")
    return <span className="text-body-md text-error">Reverted</span>;
  if (shipped.state === "manual")
    return <span className={strong}>Completed by hand, no PR</span>;
  if (shipped.state === "none") return <span className={muted}>Not yet</span>;
  if (!shipped.prUrl) return <span className={strong}>Merged</span>;
  return (
    <a
      href={shipped.prUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="w-fit break-all text-body-md text-primary underline"
    >
      {shipped.repoFullName} #{shipped.prNumber}
    </a>
  );
};

const Step = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className="flex min-w-0 flex-col gap-1">
    <span className="text-label-caps uppercase tracking-wider text-on-surface-variant">
      {label}
    </span>
    {children}
  </div>
);

const OutcomeCard = ({
  outcome,
  onOpenTask,
}: {
  outcome: Outcome;
  onOpenTask?: (taskId: string) => void;
}) => (
  <section
    aria-label="Outcome"
    className="grid gap-4 rounded-lg bg-surface-container-low p-4 md:grid-cols-3"
  >
    <Step label="Said">
      <SaidStep said={outcome.said} />
    </Step>
    <Step label="Task">
      <TaskStep task={outcome.task} onOpenTask={onOpenTask} />
    </Step>
    <Step label="Shipped">
      <ShippedStep shipped={outcome.shipped} />
    </Step>
  </section>
);

export default OutcomeCard;
