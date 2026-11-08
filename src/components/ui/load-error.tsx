"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React from "react";
import { AlertTriangle } from "lucide-react";

type LoadErrorProps = {
  message?: string;
  onRetry?: () => void;
  onBack?: () => void;
  listHref?: string;
  listLabel?: string;
  /** For a small card: no large padding or icon, and Retry only. */
  compact?: boolean;
};

/**
 * The safe fallback for a loading state that hit its bounded timeout: a clear
 * message plus a Retry (re-runs the load) and a way back to safety. When the
 * resource is genuinely gone (404) pass `listHref`/`listLabel` to offer the
 * relevant list page. Tokens only — never raw hex.
 */
export const LoadError = ({
  message = "This is taking longer than expected.",
  onRetry,
  onBack,
  listHref,
  listLabel,
  compact = false,
}: LoadErrorProps) => {
  const router = useRouter();
  const back = onBack ?? (() => router.push("/dashboard"));

  if (compact) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-error-container bg-error-container/40 px-3 py-2">
        <p className="text-body-md text-on-error-container">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-card bg-surface-container-lowest shadow-card px-3 py-1 text-body-md font-semibold text-on-surface transition-colors hover:bg-surface-container"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-error-container bg-error-container/40 px-6 py-16 text-center">
      <AlertTriangle className="h-10 w-10 text-error" />
      <p className="text-body-lg text-on-error-container">{message}</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 rounded-full bg-primary-container px-4 py-2 text-body-md font-semibold text-on-primary transition-colors hover:bg-primary"
          >
            Retry
          </button>
        )}
        <button
          type="button"
          onClick={back}
          className="inline-flex items-center gap-2 rounded-card bg-surface-container-lowest shadow-card px-4 py-2 text-body-md font-semibold text-on-surface transition-colors hover:bg-surface-container"
        >
          Back to Dashboard
        </button>
        {listHref && (
          <Link
            href={listHref}
            className="inline-flex items-center gap-2 rounded-card bg-surface-container-lowest shadow-card px-4 py-2 text-body-md font-semibold text-on-surface transition-colors hover:bg-surface-container"
          >
            {listLabel ?? "Back to list"}
          </Link>
        )}
      </div>
    </div>
  );
};
