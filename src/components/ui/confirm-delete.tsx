/* eslint-disable prettier/prettier */
"use client";

import React, { useState } from "react";
import { Check, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfirmDeleteProps {
  onConfirm: () => void | Promise<void>;
  /** Accessible label + tooltip for the trigger button. */
  label?: string;
  /** Text on the destructive confirmation button. */
  confirmLabel?: string;
  /** Text on the cancel button. */
  cancelLabel?: string;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
}

// Shared two-step delete affordance. One click reveals Confirm/Cancel so a
// stray click can never wipe data. Uses the destructive `error` tokens only
// when the action is armed — the resting state stays neutral.
export const ConfirmDelete = ({
  onConfirm,
  label = "Delete",
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  disabled,
  className,
  size = "md",
}: ConfirmDeleteProps) => {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const iconClass = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  const handleConfirm = async () => {
    try {
      setBusy(true);
      await onConfirm();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  if (confirming) {
    return (
      <div className={cn("inline-flex items-center gap-2", className)}>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-error px-3 py-2 text-body-md font-semibold text-on-primary transition-colors hover:bg-error/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Check className={iconClass} />
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-surface-variant px-3 py-2 text-body-md font-medium text-on-surface-variant transition-colors hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-60"
        >
          <X className={iconClass} />
          {cancelLabel}
        </button>
      </div>
    );
  }

  if (disabled) {
    // Render as a non-interactive element (not a disabled <button>) so the
    // hover reason is reliably shown by every browser's title tooltip.
    return (
      <span
        title={label}
        aria-disabled="true"
        aria-label={label}
        className={cn(
          "inline-flex cursor-not-allowed items-center justify-center gap-1.5 rounded-lg border border-surface-variant px-3 py-2 text-body-md font-medium text-on-surface-variant opacity-50",
          className,
        )}
      >
        <Trash2 className={iconClass} />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg border border-surface-variant px-3 py-2 text-body-md font-medium text-on-surface-variant transition-colors hover:border-error hover:text-error disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      <Trash2 className={iconClass} />
    </button>
  );
};
