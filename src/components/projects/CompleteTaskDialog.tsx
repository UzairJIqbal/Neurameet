/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { EVIDENCE_MAX_CHARS } from "@/lib/tasks";

type Props = {
  taskKey: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (evidence: string) => void;
};

const inputClass =
  "w-full rounded-xl border border-surface-variant bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface focus:border-primary focus:outline-none";
const primaryButton =
  "rounded-full bg-primary-container px-4 py-2 text-body-md text-on-primary hover:bg-primary disabled:opacity-50";

// Asked when a card lands in Completed: a manual completion always carries a
// link or a note (AC-39, AC-41). Cancel puts the card back.
const CompleteTaskDialog = ({ taskKey, busy, onCancel, onConfirm }: Props) => {
  const [evidence, setEvidence] = useState("");
  const trimmed = evidence.trim();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // The task drawer behind this dialog closes on Escape too.
      e.stopPropagation();
      if (!busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (trimmed.length >= 1 && trimmed.length <= EVIDENCE_MAX_CHARS)
      onConfirm(trimmed);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/50 px-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="complete-title"
        onSubmit={handleSubmit}
        className="flex w-full max-w-md flex-col gap-5 rounded-card bg-surface-container-lowest p-6 shadow-lg"
      >
        <div className="flex items-center justify-between">
          <h2 id="complete-title" className="text-headline-sm text-on-surface">
            Complete {taskKey}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Close"
            className="rounded-lg p-1 text-on-surface-variant hover:bg-surface-container-low"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <label className="flex flex-col gap-1 text-body-md text-on-surface">
          Evidence (a link or a short note)
          <textarea
            required
            rows={4}
            maxLength={EVIDENCE_MAX_CHARS}
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            className={inputClass}
          />
        </label>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-full border border-surface-variant px-4 py-2 text-body-md text-on-surface hover:bg-surface-container-low disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || trimmed.length === 0}
            className={primaryButton}
          >
            {busy ? "Saving..." : "Mark completed"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CompleteTaskDialog;
