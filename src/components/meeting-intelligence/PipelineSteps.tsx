"use client";

import React from "react";
import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import type { RecapStepState, RecapSteps } from "@/lib/pipeline-steps";

// The after meeting step list (spec 0005, AC-10): one row per step, each
// waiting, running, done, or failed, read from GET /api/transcript/status.

const ROWS: { key: keyof RecapSteps; label: string }[] = [
  { key: "recording", label: "Recording ready" },
  { key: "transcript", label: "Transcript" },
  { key: "summary", label: "Summary and action items" },
];

const STATE_TEXT: Record<RecapStepState, string> = {
  waiting: "Waiting",
  running: "In progress",
  done: "Done",
  failed: "Failed",
};

function StepIcon({ state }: { state: RecapStepState }) {
  if (state === "done")
    return <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />;
  if (state === "running")
    return (
      <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
    );
  if (state === "failed")
    return <XCircle className="h-4 w-4 text-error" aria-hidden />;
  return <Circle className="h-4 w-4 text-outline" aria-hidden />;
}

export function PipelineSteps({ steps }: { steps: RecapSteps }) {
  return (
    <ol className="flex flex-col divide-y divide-outline-variant overflow-hidden rounded-xl border border-outline-variant">
      {ROWS.map(({ key, label }) => {
        const state = steps[key];
        return (
          <li
            key={key}
            data-step={key}
            data-state={state}
            className="flex items-center justify-between gap-3 px-4 py-3"
          >
            <span className="inline-flex items-center gap-2 text-body-md text-on-surface">
              <StepIcon state={state} />
              {label}
            </span>
            <span
              className={
                state === "failed"
                  ? "text-body-sm text-error"
                  : "text-body-sm text-on-surface-variant"
              }
            >
              {STATE_TEXT[state]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
