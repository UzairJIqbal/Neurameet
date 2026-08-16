"use client";

import { useEffect } from "react";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error boundary caught:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-inverse-surface px-4 text-center text-inverse-on-surface">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="max-w-md text-sm text-inverse-on-surface/70">
        We hit an unexpected error while loading this page. You can retry,
        or go back to the home page.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-container px-4 py-2 text-body-md font-body-md font-semibold text-on-primary transition-colors hover:bg-primary"
        >
          Try again
        </button>
        <a
          href="/"
          className="inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-2 text-body-md font-body-md font-medium text-on-surface transition-colors hover:bg-surface-container-low"
        >
          Back to home
        </a>
      </div>
    </div>
  );
}
