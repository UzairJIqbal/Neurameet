"use client";

import { createContext, useContext, useEffect } from "react";

const ShellDetailContext = createContext<(detail: string | null) => void>(
  () => {},
);

export const ShellDetailProvider = ShellDetailContext.Provider;

/** Lets a page name itself in the header's breadcrumb, such as a project. */
export function useShellDetail(detail: string | null): void {
  const setDetail = useContext(ShellDetailContext);
  useEffect(() => {
    setDetail(detail);
    return () => setDetail(null);
  }, [detail, setDetail]);
}
