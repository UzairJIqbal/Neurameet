"use client";

import { useState } from "react";
import { X } from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import type {
  AgreementVote,
  LiveAgreementState,
} from "@/lib/live-ledger-types";

type AgreementPromptProps = {
  agreement: LiveAgreementState | null;
  onVote: (agreementId: string, vote: AgreementVote) => Promise<void>;
};

const VOTES: Array<{ value: AgreementVote; label: string }> = [
  { value: "agree", label: "Agree" },
  { value: "not_yet", label: "Not yet" },
];

/**
 * Agreement Check for everyone in the call (spec 0002 AC-9 to AC-11): Agree
 * or Not yet, the live tally, then "Agreed by N of M" once the owner closes it.
 */
export const AgreementPrompt = ({
  agreement,
  onVote,
}: AgreementPromptProps) => {
  const [pending, setPending] = useState(false);
  const [hiddenId, setHiddenId] = useState<string | null>(null);
  if (!agreement) return null;
  const closed = agreement.result !== null;
  if (closed && hiddenId === agreement.agreementId) return null;

  const vote = async (value: AgreementVote) => {
    setPending(true);
    try {
      await onVote(agreement.agreementId, value);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not save your vote",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <section
      data-testid="agreement-prompt"
      aria-label="Agreement check"
      className="fixed inset-x-0 bottom-36 z-20 mx-auto flex w-[calc(100%-1rem)] max-w-md flex-col gap-2 rounded-xl border border-outline-variant bg-inverse-surface p-3 text-inverse-on-surface shadow-lg sm:bottom-24"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-label-mono font-semibold">
          {closed ? "Agreement saved" : "Do you agree?"}
        </span>
        {closed && (
          <button
            type="button"
            onClick={() => setHiddenId(agreement.agreementId)}
            aria-label="Hide the agreement result"
            className="cursor-pointer rounded-lg p-1 hover:bg-inverse-on-surface/10"
          >
            <X size={16} aria-hidden />
          </button>
        )}
      </div>
      <p className="text-body-lg">{agreement.statement}</p>
      {closed && agreement.result ? (
        <p role="status" className="text-body-md font-semibold">
          Agreed by {agreement.result.agreed} of {agreement.result.total}
        </p>
      ) : (
        <>
          <div className="flex gap-2">
            {VOTES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                disabled={pending}
                aria-pressed={agreement.myVote === value}
                onClick={() => void vote(value)}
                className={cn(
                  "flex-1 cursor-pointer rounded-lg border border-outline-variant px-3 py-2 text-body-md font-semibold hover:bg-inverse-on-surface/10 disabled:cursor-wait disabled:opacity-60",
                  agreement.myVote === value &&
                    "bg-primary-container text-on-primary hover:bg-primary-container",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-label-mono text-inverse-on-surface/70">
            {agreement.agree} agree · {agreement.notYet} not yet
          </p>
        </>
      )}
    </section>
  );
};
