/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Search } from "lucide-react";
import { LoadError } from "@/components/ui/load-error";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import {
  fetchPalette,
  GO_TO_LINKS,
  OPEN_PALETTE_EVENT,
  searchHref,
} from "@/lib/palette-client";
import {
  EMPTY_PALETTE,
  type PaletteGroups,
  type PaletteRow,
} from "@/lib/palette-types";

const DEBOUNCE_MS = 200;
const GROUPS: Array<{ key: keyof PaletteGroups; heading: string }> = [
  { key: "projects", heading: "Projects" },
  { key: "tasks", heading: "Tasks" },
  { key: "meetings", heading: "Meetings" },
  { key: "decisions", heading: "Decisions" },
];
const ITEM =
  "flex cursor-pointer flex-col rounded-lg px-3 py-2 text-body-md text-on-surface data-[selected=true]:bg-surface-container-low";
const HEADING =
  "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-label-caps [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-on-surface-variant";

/** AC-78, AC-78a: Ctrl K or Cmd K, or the header box, opens one palette over one search call. */
const CommandPalette = () => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<PaletteGroups>(EMPTY_PALETTE);
  const [isLoading, setIsLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const { timedOut } = useLoadingTimeout(isLoading, {
    timeoutMs: 12000,
    retryNonce,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  const q = query.trim();
  useEffect(() => {
    abortRef.current?.abort();
    if (!open || q.length < 2) {
      setGroups(EMPTY_PALETTE);
      setIsLoading(false);
      setFailed(false);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = setTimeout(async () => {
      setIsLoading(true);
      setFailed(false);
      try {
        const data = await fetchPalette(q, controller.signal);
        if (!controller.signal.aborted) setGroups(data);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("Palette search failed:", err);
        setGroups(EMPTY_PALETTE);
        setFailed(true);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, open, retryNonce]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };
  const go = (href: string) => {
    close();
    router.push(href);
  };

  if (!open) return null;

  const renderRow = (row: PaletteRow) => (
    <Command.Item
      key={row.id}
      value={`${row.id}`}
      onSelect={() => go(row.href)}
      className={ITEM}
    >
      <span className="truncate">{row.title}</span>
      <span className="truncate text-xs text-on-surface-variant">
        {row.subtitle}
      </span>
    </Command.Item>
  );

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-inverse-surface/50 px-4 pt-[15vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      onClick={close}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-card bg-surface-container-lowest shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <Command shouldFilter={false} label="Search">
          <div className="flex items-center gap-2 border-b border-surface-variant px-3">
            <Search
              className="h-4 w-4 shrink-0 text-on-surface-variant"
              aria-hidden
            />
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Search projects, tasks, meetings..."
              className="w-full bg-transparent py-3 text-body-md text-on-surface outline-none placeholder:text-on-surface-variant"
            />
          </div>
          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            {q.length < 2 && (
              <Command.Group heading="Go to" className={HEADING}>
                {GO_TO_LINKS.map((l) => (
                  <Command.Item
                    key={l.href}
                    value={l.href}
                    onSelect={() => go(l.href)}
                    className={ITEM}
                  >
                    {l.label}
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            {timedOut || failed ? (
              <LoadError
                compact
                message="We could not search right now."
                onRetry={() => setRetryNonce((n) => n + 1)}
              />
            ) : isLoading ? (
              <p className="px-3 py-2 text-body-md text-on-surface-variant">
                Searching...
              </p>
            ) : (
              GROUPS.map(({ key, heading }) =>
                groups[key].length > 0 ? (
                  <Command.Group
                    key={key}
                    heading={heading}
                    className={HEADING}
                  >
                    {groups[key].map(renderRow)}
                  </Command.Group>
                ) : null,
              )
            )}
            {q.length >= 2 && (
              <Command.Item
                value="__content"
                onSelect={() => go(searchHref(q))}
                className={ITEM}
              >
                Search meeting content for &quot;{q}&quot;
              </Command.Item>
            )}
          </Command.List>
        </Command>
      </div>
    </div>,
    document.body,
  );
};

export default CommandPalette;
