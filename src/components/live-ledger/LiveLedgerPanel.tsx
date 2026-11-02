"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { X, Search } from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { LoadError } from "@/components/ui/load-error";
import { fetchCheckin } from "@/lib/live-ledger-client";
import {
  AGREEMENT_STATEMENT_MAX,
  toCardEvent,
  type CheckinItem,
  type LiveMark,
} from "@/lib/live-ledger-types";
import type {
  LiveLedgerActions,
  LiveLedgerRoomState,
} from "@/hooks/useLiveLedger";
import { CardPreview } from "./CardPreview";

type LiveLedgerPanelProps = {
  callId: string;
  onClose: () => void;
  live: LiveLedgerRoomState;
  actions: LiveLedgerActions;
};

const MARKS: Array<{ value: LiveMark; label: string }> = [
  { value: "kept", label: "Kept" },
  { value: "open", label: "Still open" },
  { value: "reversed", label: "Reversed" },
];

const errorText = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

/** "Still open?" for overdue, never "Overdue" (spec AC-5). */
export const statusLabel = (item: CheckinItem): string =>
  item.derivedStatus === "overdue" ? "Still open?" : "Open";

function matches(item: CheckinItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [item.statement, item.quote, item.assignee ?? ""].some((t) =>
    t.toLowerCase().includes(q),
  );
}

/**
 * Owner only Live Ledger panel (spec 0002): the check-in list of open and
 * overdue promises, a private preview, the live card controls (raise, mark,
 * close) and the Agreement Check composer. Takes only plain props and no
 * Stream or participant hooks, so it cannot re render the tile tree.
 */
export const LiveLedgerPanel = ({
  callId,
  onClose,
  live,
  actions,
}: LiveLedgerPanelProps) => {
  const [items, setItems] = useState<CheckinItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statement, setStatement] = useState("");
  const { timedOut } = useLoadingTimeout(loading, { retryNonce });

  // One owner action at a time; errors go to a toast (the hook already
  // re read the server state).
  const act = useCallback(
    async (work: () => Promise<void>, fallback: string): Promise<boolean> => {
      setBusy(true);
      try {
        await work();
        return true;
      } catch (err) {
        toast.error(errorText(err, fallback));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchCheckin(callId, controller.signal)
      .then((data) => setItems(data.items))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        console.error("[live-ledger] checkin load failed:", err);
        setError(err instanceof Error ? err.message : "Could not load");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [callId, retryNonce]);

  const retry = useCallback(() => setRetryNonce((n) => n + 1), []);
  const visible = useMemo(
    () => items.filter((item) => matches(item, query)),
    [items, query],
  );
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const liveCard = live.card;
  const agreement = live.agreement;
  const agreementOpen = !!agreement && agreement.result === null;
  const trimmed = statement.trim();

  const showSelected = async (item: CheckinItem) => {
    const ok = await act(() => actions.raise(item), "Could not show the card");
    if (ok) setSelectedId(null);
  };

  const askEveryone = async () => {
    const ok = await act(
      () => actions.openAgreement(trimmed),
      "Could not start the agreement check",
    );
    if (ok) setStatement("");
  };

  return (
    <section
      aria-label="Live Ledger"
      className="flex h-full flex-col gap-3 p-3 text-inverse-on-surface"
    >
      <header className="flex items-center justify-between">
        <h2 className="text-headline-sm font-semibold">Promise Check-in</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Live Ledger"
          className="cursor-pointer rounded-lg p-1 hover:bg-inverse-on-surface/10"
        >
          <X size={18} aria-hidden />
        </button>
      </header>

      {liveCard && (
        <div data-testid="live-card-controls" className="flex flex-col gap-2">
          <p className="text-label-caps text-inverse-on-surface/70">
            Everyone can see this card
          </p>
          <CardPreview
            card={liveCard.card}
            mark={liveCard.mark}
            label="Live card"
          />
          <div
            className="flex gap-2"
            role="group"
            aria-label="Mark this promise"
          >
            {MARKS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                disabled={busy}
                aria-pressed={liveCard.mark === value}
                onClick={() =>
                  void act(
                    () => actions.mark(liveCard.card.itemId, value),
                    "Could not save the mark",
                  )
                }
                className={cn(
                  "flex-1 cursor-pointer rounded-lg border border-outline-variant px-2 py-1.5 text-body-md font-semibold hover:bg-inverse-on-surface/10 disabled:cursor-wait disabled:opacity-60",
                  liveCard.mark === value &&
                    "bg-primary-container text-on-primary hover:bg-primary-container",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void act(
                () => actions.closeCard(liveCard.card.itemId),
                "Could not close the card",
              )
            }
            className="cursor-pointer rounded-lg border border-outline-variant px-3 py-2 text-body-md hover:bg-inverse-on-surface/10 disabled:cursor-wait disabled:opacity-60"
          >
            Close card
          </button>
        </div>
      )}

      {selected && (
        <div className="flex flex-col gap-2">
          <CardPreview card={toCardEvent(selected)} />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void showSelected(selected)}
              className="flex-1 cursor-pointer rounded-lg bg-primary-container px-3 py-2 text-body-md font-semibold text-on-primary disabled:cursor-wait disabled:opacity-60"
            >
              Show to everyone
            </button>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="cursor-pointer rounded-lg border border-outline-variant px-3 py-2 text-body-md hover:bg-inverse-on-surface/10"
            >
              Back
            </button>
          </div>
          <p className="text-label-mono text-inverse-on-surface/70">
            Only you can see this preview.
          </p>
        </div>
      )}

      <div
        data-testid="agreement-controls"
        className="flex flex-col gap-2 rounded-lg border border-outline-variant p-2"
      >
        <h3 className="text-label-caps">Agreement Check</h3>
        {agreementOpen && agreement ? (
          <>
            <p className="text-body-md">{agreement.statement}</p>
            <p className="text-label-mono text-inverse-on-surface/70">
              {agreement.agree} agree · {agreement.notYet} not yet
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void act(
                  () => actions.closeAgreement(agreement.agreementId),
                  "Could not close the agreement check",
                )
              }
              className="cursor-pointer rounded-lg bg-primary-container px-3 py-2 text-body-md font-semibold text-on-primary disabled:cursor-wait disabled:opacity-60"
            >
              Close and save
            </button>
          </>
        ) : (
          <>
            {agreement?.result && (
              <p role="status" className="text-label-mono">
                Saved: agreed by {agreement.result.agreed} of{" "}
                {agreement.result.total}
              </p>
            )}
            <textarea
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              maxLength={AGREEMENT_STATEMENT_MAX}
              rows={2}
              placeholder="Type a decision, e.g. We launch on Friday"
              aria-label="Decision to agree on"
              className="w-full resize-none rounded-lg border border-outline-variant bg-transparent px-2 py-1.5 text-body-md text-inverse-on-surface outline-none placeholder:text-inverse-on-surface/50"
            />
            <button
              type="button"
              disabled={busy || trimmed.length === 0}
              onClick={() => void askEveryone()}
              className="cursor-pointer rounded-lg bg-primary-container px-3 py-2 text-body-md font-semibold text-on-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              Ask everyone
            </button>
          </>
        )}
      </div>

      <label className="flex items-center gap-2 rounded-lg border border-outline-variant px-2 py-1.5">
        <Search size={16} aria-hidden className="text-inverse-on-surface/70" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search promises"
          aria-label="Search promises"
          className="w-full bg-transparent text-body-md text-inverse-on-surface outline-none placeholder:text-inverse-on-surface/50"
        />
      </label>

      <div className="flex-1 overflow-y-auto">
        {timedOut || (error && !loading) ? (
          <LoadError
            message={error ?? undefined}
            onRetry={retry}
            onBack={onClose}
          />
        ) : loading ? (
          <p className="py-6 text-center text-body-md text-inverse-on-surface/70">
            Loading your open promises…
          </p>
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-body-md text-inverse-on-surface/70">
            No open promises from your earlier meetings.
          </p>
        ) : visible.length === 0 ? (
          <p className="py-6 text-center text-body-md text-inverse-on-surface/70">
            Nothing matches your search.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visible.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  aria-pressed={item.id === selectedId}
                  className={cn(
                    "flex w-full cursor-pointer flex-col gap-1 rounded-lg border border-outline-variant px-3 py-2 text-left hover:bg-inverse-on-surface/10",
                    item.id === selectedId &&
                      "bg-primary-container text-on-primary hover:bg-primary-container",
                  )}
                >
                  <span className="text-body-md font-semibold">
                    {item.statement}
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-label-mono opacity-80">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5",
                        item.derivedStatus === "overdue"
                          ? "bg-error-container text-on-error-container"
                          : "border border-outline-variant",
                      )}
                    >
                      {statusLabel(item)}
                    </span>
                    {item.assignee && <span>{item.assignee}</span>}
                    {item.dueDate && <span>Due {item.dueDate}</span>}
                  </span>
                  <span className="text-label-mono opacity-70">
                    From {item.sourceMeeting.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};
