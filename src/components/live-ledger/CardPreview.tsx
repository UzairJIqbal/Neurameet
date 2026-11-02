"use client";

import { Quote } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  markLabel,
  type LiveLedgerCardEvent,
  type LiveMark,
} from "@/lib/live-ledger-types";

type CardPreviewProps = {
  card: LiveLedgerCardEvent;
  /** The live mark, once the owner marks the card. */
  mark?: LiveMark | null;
  label?: string;
};

/**
 * The quote card exactly as everyone sees it once raised (spec AC-3, AC-5).
 * Built from the same `ledger.card` payload the server sends.
 */
export const CardPreview = ({
  card,
  mark = null,
  label = "Card preview",
}: CardPreviewProps) => (
  <article
    aria-label={label}
    className="flex flex-col gap-2 rounded-xl border border-outline-variant bg-inverse-surface p-3 text-inverse-on-surface"
  >
    <div className="flex items-center justify-between gap-2 text-label-mono">
      <span className="font-semibold">
        {card.derivedStatus === "overdue" ? "Still open?" : "Open promise"}
      </span>
      {card.dueDate && (
        <span className="text-inverse-on-surface/70">Due {card.dueDate}</span>
      )}
    </div>
    <blockquote className="flex gap-2 text-body-lg">
      <Quote size={16} aria-hidden className="mt-1 shrink-0 opacity-70" />
      <span>&ldquo;{card.quote}&rdquo;</span>
    </blockquote>
    <p className="text-body-md">{card.statement}</p>
    <p className="text-label-mono text-inverse-on-surface/70">
      {card.assignee ? `${card.assignee} · ` : ""}From {card.sourceTitle}
    </p>
    {mark && (
      <p
        role="status"
        className={cn(
          "w-fit rounded-full px-2 py-0.5 text-label-mono font-semibold",
          mark === "kept" && "bg-primary-container text-on-primary",
          mark === "open" && "border border-outline-variant",
          mark === "reversed" && "bg-error-container text-on-error-container",
        )}
      >
        {markLabel(mark)}
      </p>
    )}
  </article>
);
