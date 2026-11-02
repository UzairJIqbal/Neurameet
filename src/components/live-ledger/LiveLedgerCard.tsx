"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { LiveCardState } from "@/lib/live-ledger-types";
import { CardPreview } from "./CardPreview";

type LiveLedgerCardProps = {
  live: LiveCardState | null;
  /** Bumps on every raise; a dismiss only hides the current raise. */
  cardSeq: number;
};

/**
 * The quote card everyone in the call sees while the owner has it up (spec
 * 0002 AC-4 to AC-7). Dismiss is local to this screen. Plain props only, so
 * it never touches the participant tile tree.
 */
export const LiveLedgerCard = ({ live, cardSeq }: LiveLedgerCardProps) => {
  const [dismissedSeq, setDismissedSeq] = useState<number | null>(null);
  if (!live || dismissedSeq === cardSeq) return null;

  return (
    <div
      data-testid="live-ledger-card"
      className="absolute inset-x-0 top-20 z-20 mx-auto w-[calc(100%-1rem)] max-w-md"
    >
      <div className="relative shadow-lg">
        <CardPreview
          card={live.card}
          mark={live.mark}
          label="Promise check-in"
        />
        <button
          type="button"
          onClick={() => setDismissedSeq(cardSeq)}
          aria-label="Hide this card on my screen"
          className="absolute top-2 right-2 cursor-pointer rounded-lg p-1 text-inverse-on-surface hover:bg-inverse-on-surface/10"
        >
          <X size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
};
