"use client";

import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const SHORTCUTS = [
  { keys: "Ctrl K or Cmd K", action: "Search projects, tasks, and meetings" },
  { keys: "Esc", action: "Close the open dialog or panel" },
];

const PROMISE_STEPS = [
  "Someone makes a promise in a project meeting.",
  "NeuraMeet proposes a task with the exact quote and the speaker.",
  "An Owner or Admin reviews it. Nothing becomes a task without that review.",
  "A developer opens a pull request that mentions the task key.",
  "The merge into the default branch completes the task.",
  "An Owner or Admin confirms the promise as kept. A revert reopens the task.",
];

/** AC-77e: static help text. It sits in a portal to clear the sticky header. */
const HelpDialog = ({ onClose }: { onClose: () => void }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/50 px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Help"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-card bg-surface-container-lowest shadow-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-headline-sm font-semibold text-on-surface">
            Help
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close help"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-low"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <h3 className="mt-5 text-body-md font-semibold text-on-surface">
          Shortcuts
        </h3>
        <ul className="mt-2 flex flex-col gap-2">
          {SHORTCUTS.map((s) => (
            <li
              key={s.keys}
              className="flex items-center justify-between gap-4 text-body-md text-on-surface-variant"
            >
              <span>{s.action}</span>
              <kbd className="shrink-0 rounded border border-outline-variant bg-surface-container-low px-2 py-0.5 font-label-mono text-label-mono">
                {s.keys}
              </kbd>
            </li>
          ))}
        </ul>

        <h3 className="mt-5 text-body-md font-semibold text-on-surface">
          How a promise reaches a merge
        </h3>
        <ol className="mt-2 flex list-decimal flex-col gap-2 pl-5 text-body-md text-on-surface-variant">
          {PROMISE_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
    </div>,
    document.body,
  );
};

export default HelpDialog;
