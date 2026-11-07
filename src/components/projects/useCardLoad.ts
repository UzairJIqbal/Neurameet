"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";

export type CardLoad<T> = {
  data: T | null;
  isLoading: boolean;
  failed: boolean;
  retry: () => void;
};

/**
 * One card's own load, so a failed call blanks only that card (AC-70b). Pass a
 * stable `load` (useCallback). A disabled card loads nothing and never spins.
 */
export function useCardLoad<T>(
  load: (signal: AbortSignal) => Promise<T>,
  enabled = true,
): CardLoad<T> {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(enabled);
  const [retryNonce, setRetryNonce] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  const { timedOut } = useLoadingTimeout(isLoading, {
    timeoutMs: 12000,
    retryNonce,
  });

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    const run = async () => {
      try {
        setIsLoading(true);
        setFailed(false);
        setData(await load(controller.signal));
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("A project card failed to load:", err);
        setFailed(true);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };
    run();
    return () => controller.abort();
  }, [enabled, load, retryNonce]);

  useEffect(() => {
    if (timedOut) controllerRef.current?.abort();
  }, [timedOut]);

  const retry = useCallback(() => setRetryNonce((k) => k + 1), []);

  return { data, isLoading, failed: failed || timedOut, retry };
}
