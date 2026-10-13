"use client";

import { useEffect, useRef, useState } from "react";

// Default bound for a data fetch before we stop spinning and surface a
// recoverable error. Stream connect / clerk load are usually far quicker;
// this only catches a promise that never settles (dead socket, hung network).
export const LOADING_TIMEOUT_MS = 12000;

/**
 * Watches a loading flag and reports when it has been true longer than
 * `timeoutMs`. A rejected promise is not the danger here (callers reset
 * `isLoading` in a `finally`); a promise that *never settles* is, and only a
 * timer can catch that. When `isLoading` goes false the timeout clears and
 * `timedOut` resets, so a Retry that re-flip the flag restarts cleanly.
 */
export function useLoadingTimeout(
  isLoading: boolean,
  opts?: { timeoutMs?: number; onTimeout?: () => void; retryNonce?: number },
): { timedOut: boolean } {
  const timeoutMs = opts?.timeoutMs ?? LOADING_TIMEOUT_MS;
  const onTimeout = opts?.onTimeout;
  const retryNonce = opts?.retryNonce ?? 0;
  const [timedOut, setTimedOut] = useState(false);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  useEffect(() => {
    if (!isLoading) {
      setTimedOut(false);
      return;
    }

    setTimedOut(false);
    const id = setTimeout(() => {
      setTimedOut(true);
      onTimeoutRef.current?.();
    }, timeoutMs);

    return () => clearTimeout(id);
  }, [isLoading, timeoutMs, retryNonce]);

  return { timedOut };
}
