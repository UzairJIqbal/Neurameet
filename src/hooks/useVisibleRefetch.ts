"use client";

import { useEffect, useRef } from "react";

/**
 * AC-73: runs `refetch` on mount, on window focus, and every `everyMs` while
 * the tab is visible, plus whenever any of `alsoOnEvents` fires. Handling a
 * failure belongs to `refetch`; this hook only decides when it runs.
 */
export function useVisibleRefetch(
  refetch: () => void,
  everyMs: number,
  alsoOnEvents: string[] = [],
): void {
  const latest = useRef(refetch);
  latest.current = refetch;
  const eventKey = alsoOnEvents.join(" ");

  useEffect(() => {
    const run = () => latest.current();
    const tick = () => {
      if (document.visibilityState === "visible") run();
    };
    const events = eventKey ? eventKey.split(" ") : [];

    run();
    const timer = window.setInterval(tick, everyMs);
    window.addEventListener("focus", run);
    for (const name of events) window.addEventListener(name, run);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", run);
      for (const name of events) window.removeEventListener(name, run);
    };
  }, [everyMs, eventKey]);
}
