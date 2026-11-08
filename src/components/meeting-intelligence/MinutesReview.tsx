/* eslint-disable prettier/prettier */
"use client";

import React, { useState } from "react";
import toast from "react-hot-toast";
import { Check, Copy, Download, ExternalLink, Quote, User } from "lucide-react";
import {
  formatDeadline,
  MINUTES_NOTE_MAX,
  type MinutesAnswer,
  type MinutesAttestAction,
  type MinutesReviewLine,
  type MinutesReviewState,
  type MinutesSealView,
  type MinutesSpeaker,
  type MinutesSuggestionView,
} from "@/lib/minutes-types";
import {
  attestLine,
  cancelReview,
  dismissSuggestion,
  downloadMinutesPdf,
  finishReview,
  sealMinutes,
  updateClaim,
} from "@/lib/minutes-client";

// Tasdeeq, Verified Minutes (spec 0003, AC-8 to AC-15, AC-20): the open review
// (claims, answers, suggestions, progress, owner seal and cancel) and the
// sealed, read only record.

export const badgeBase =
  "rounded-full px-3 py-1 text-label-caps font-medium uppercase tracking-wider";
export const cardShell =
  "overflow-hidden rounded-xl border border-surface-variant bg-surface-container-lowest shadow-card";
const primaryBtn =
  "inline-flex w-fit items-center gap-2 rounded-full bg-primary-container px-4 py-2 text-body-md font-semibold text-on-primary transition-colors hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60";
const quietBtn =
  "inline-flex w-fit items-center gap-2 rounded-full border border-surface-variant bg-surface-container-lowest px-3 py-1.5 text-body-md font-medium text-on-surface transition-colors hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-60";
const dangerBtn =
  "inline-flex w-fit items-center gap-2 rounded-full border border-error-container px-3 py-1.5 text-body-md font-medium text-error transition-colors hover:bg-error-container disabled:cursor-not-allowed disabled:opacity-60";
const fieldClass =
  "rounded-lg border border-surface-variant bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface";

const ANSWER_LABEL: Record<MinutesAttestAction, string> = {
  confirm: "Confirmed",
  correct: "Correction",
  view: "Recorded view",
};

interface Ctx {
  meetingId: string;
  open: boolean;
  busy: string | null;
  run: (
    key: string,
    task: () => Promise<unknown>,
    done: string,
  ) => Promise<boolean>;
}

const AnswerRow = ({ answer }: { answer: MinutesAnswer }) => (
  <li className="flex flex-col gap-0.5 text-body-md">
    <span className="font-medium text-on-surface">
      {ANSWER_LABEL[answer.action]} · {answer.displayName}
      {answer.late && <span className="text-on-surface-variant"> (late)</span>}
    </span>
    {answer.note && (
      <span dir="auto" className="text-on-surface-variant">
        {answer.note}
      </span>
    )}
  </li>
);

const NoteEditor = ({
  initial,
  saving,
  onSave,
  onCancel,
  label,
}: {
  initial: string;
  saving: boolean;
  onSave: (note: string) => void;
  onCancel: () => void;
  label: string;
}) => {
  const [note, setNote] = useState(initial);
  const trimmed = note.trim();
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-body-md text-on-surface-variant">
        {label}
        <textarea
          dir="auto"
          value={note}
          maxLength={MINUTES_NOTE_MAX}
          rows={3}
          onChange={(e) => setNote(e.target.value)}
          className={fieldClass}
        />
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={saving || trimmed.length === 0}
          onClick={() => onSave(trimmed)}
          className={primaryBtn}
        >
          Save
        </button>
        <button type="button" onClick={onCancel} className={quietBtn}>
          Cancel
        </button>
        <span className="text-body-md text-on-surface-variant">
          {note.length} / {MINUTES_NOTE_MAX}
        </span>
      </div>
    </div>
  );
};

const ReviewLineCard = ({
  line,
  ctx,
}: {
  line: MinutesReviewLine;
  ctx: Ctx;
}) => {
  const [editing, setEditing] = useState<"correct" | "view" | null>(null);
  const key = `line-${line.id}`;
  const saving = ctx.busy === key;
  const save = async (action: MinutesAttestAction, note?: string) => {
    const ok = await ctx.run(
      key,
      () => attestLine(ctx.meetingId, action, line.id, note),
      "Answer saved",
    );
    if (ok) setEditing(null);
  };
  const others = line.answers.filter((a) => a.userId !== line.myAnswer?.userId);

  return (
    <div className="flex flex-col gap-3 px-6 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <p dir="auto" className="font-body-md font-medium text-on-surface">
          {line.text}
        </p>
        {!line.supported && (
          <span className={`${badgeBase} bg-error-container text-error`}>
            Unsupported
          </span>
        )}
        {line.mine && (
          <span
            className={`${badgeBase} bg-secondary-container text-on-secondary-container`}
          >
            Yours
          </span>
        )}
      </div>

      {line.section === "action_item" && line.assignee && (
        <span className="inline-flex items-center gap-1 text-body-md text-on-surface-variant">
          <User className="h-4 w-4" /> {line.assignee}
        </span>
      )}

      {line.evidence.map((e) => (
        <blockquote
          key={e.lineNumber}
          className="flex gap-2 rounded-lg bg-surface-container-low px-4 py-3 text-body-md text-on-surface-variant"
        >
          <Quote className="mt-1 h-4 w-4 shrink-0 text-primary-container" />
          <span className="flex flex-col gap-1">
            <span dir="auto" className="italic text-on-surface">
              &ldquo;{e.quote}&rdquo;
            </span>
            <span>
              Line {e.lineNumber}
              {e.speaker ? ` · ${e.speaker}` : ""}
            </span>
            {e.lineText && (
              <span dir="auto" className="text-on-surface-variant">
                Transcript: {e.lineText}
              </span>
            )}
          </span>
        </blockquote>
      ))}

      {line.myAnswer && (
        <div className="rounded-lg bg-surface-container px-4 py-2">
          <span className="text-label-caps font-medium uppercase tracking-wider text-on-surface-variant">
            Your answer
          </span>
          <ul>
            <AnswerRow answer={line.myAnswer} />
          </ul>
        </div>
      )}

      {others.length > 0 && (
        <ul className="flex flex-col gap-2 border-l-2 border-surface-variant pl-3">
          {others.map((a) => (
            <AnswerRow key={a.userId} answer={a} />
          ))}
        </ul>
      )}

      {ctx.open && editing === null && (line.mine || line.canView) && (
        <div className="flex flex-wrap items-center gap-2">
          {line.mine && (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save("confirm")}
                className={quietBtn}
              >
                <Check className="h-4 w-4" /> Confirm
              </button>
              <button
                type="button"
                onClick={() => setEditing("correct")}
                className={quietBtn}
              >
                Correct
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setEditing("view")}
            className={quietBtn}
          >
            Record my view
          </button>
        </div>
      )}

      {ctx.open && editing !== null && (
        <NoteEditor
          label={
            editing === "correct"
              ? "What should this line say?"
              : "Your view on this line"
          }
          initial={
            line.myAnswer?.action === editing ? (line.myAnswer.note ?? "") : ""
          }
          saving={saving}
          onSave={(note) => void save(editing, note)}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
};

const LineGroup = ({
  title,
  hint,
  lines,
  ctx,
}: {
  title: string;
  hint?: string;
  lines: MinutesReviewLine[];
  ctx: Ctx;
}) => {
  if (lines.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-headline-sm font-semibold text-on-surface">
          {title}
        </h2>
        {hint && <p className="text-body-md text-on-surface-variant">{hint}</p>}
      </div>
      <div className={cardShell}>
        <div className="divide-y divide-surface-variant">
          {lines.map((line) => (
            <ReviewLineCard key={line.id} line={line} ctx={ctx} />
          ))}
        </div>
      </div>
    </section>
  );
};

const SpeakerRow = ({
  speaker,
  state,
  ctx,
}: {
  speaker: MinutesSpeaker;
  state: MinutesReviewState;
  ctx: Ctx;
}) => {
  const [assignTo, setAssignTo] = useState("");
  const key = `speaker-${speaker.key}`;
  const saving = ctx.busy === key;
  const claim = (action: "claim" | "assign" | "clear", userId?: string) =>
    ctx.run(
      key,
      () => updateClaim(ctx.meetingId, action, speaker.label, userId),
      action === "clear" ? "Speaker name cleared" : "Speaker name saved",
    );

  return (
    <li
      className={`flex flex-wrap items-center gap-3 px-6 py-3 ${speaker.suggested ? "bg-surface-container-low" : ""}`}
    >
      <span dir="auto" className="min-w-32 font-medium text-on-surface">
        {speaker.label}
      </span>
      {speaker.holderId ? (
        <span className="text-body-md text-on-surface-variant">
          {speaker.holderId === state.myUserId
            ? "You"
            : (speaker.holderName ?? "Attendee")}
          {speaker.claimedBy === "owner" ? " (set by the owner)" : ""}
        </span>
      ) : (
        <span className="text-body-md text-on-surface-variant">
          {speaker.suggested ? "This looks like you" : "Unclaimed"}
        </span>
      )}

      {ctx.open && !speaker.holderId && (
        <button
          type="button"
          disabled={saving}
          onClick={() => void claim("claim")}
          className={quietBtn}
        >
          Claim
        </button>
      )}

      {ctx.open && state.isOwner && !speaker.holderId && (
        <span className="inline-flex items-center gap-2">
          <select
            aria-label={`Assign ${speaker.label} to`}
            value={assignTo}
            onChange={(e) => setAssignTo(e.target.value)}
            className={fieldClass}
          >
            <option value="">Assign to</option>
            {state.attesters.map((a) => (
              <option key={a.userId} value={a.userId}>
                {a.displayName}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={saving || !assignTo}
            onClick={() => void claim("assign", assignTo)}
            className={quietBtn}
          >
            Assign
          </button>
        </span>
      )}

      {ctx.open && state.isOwner && speaker.holderId && !speaker.locked && (
        <button
          type="button"
          disabled={saving}
          onClick={() => void claim("clear")}
          className={quietBtn}
        >
          Clear
        </button>
      )}
    </li>
  );
};

const SpeakerStrip = ({
  state,
  ctx,
}: {
  state: MinutesReviewState;
  ctx: Ctx;
}) => {
  if (state.speakers.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-headline-sm font-semibold text-on-surface">
          Your speaker name
        </h2>
        <p className="text-body-md text-on-surface-variant">
          Claim the name you spoke under in the transcript, so the lines you
          said come to you.
        </p>
      </div>
      <ul className={`${cardShell} divide-y divide-surface-variant`}>
        {state.speakers.map((s) => (
          <SpeakerRow key={s.key} speaker={s} state={state} ctx={ctx} />
        ))}
      </ul>
    </section>
  );
};

const SuggestionCard = ({
  suggestion,
  decisions,
  ctx,
}: {
  suggestion: MinutesSuggestionView;
  decisions: MinutesReviewLine[];
  ctx: Ctx;
}) => {
  const [lineId, setLineId] = useState(suggestion.relatedLineId ?? "");
  const key = `suggestion-${suggestion.id}`;
  const saving = ctx.busy === key;
  const related = decisions.find((d) => d.id === suggestion.relatedLineId);

  return (
    <div className="flex flex-col gap-3 px-6 py-4">
      <p className="font-medium text-on-surface">{suggestion.topic}</p>
      <p dir="auto" className="text-body-md text-on-surface">
        {suggestion.position}
      </p>
      <blockquote className="flex gap-2 rounded-lg bg-surface-container-low px-4 py-3 text-body-md text-on-surface-variant">
        <Quote className="mt-1 h-4 w-4 shrink-0 text-primary-container" />
        <span className="flex flex-col gap-1">
          <span dir="auto" className="italic text-on-surface">
            &ldquo;{suggestion.quote}&rdquo;
          </span>
          <span>
            Line {suggestion.lineNumber} · {suggestion.speakerLabel}
          </span>
        </span>
      </blockquote>
      {related ? (
        <p className="text-body-md text-on-surface-variant">
          On the decision: {related.text}
        </p>
      ) : (
        <label className="flex flex-col gap-1 text-body-md text-on-surface-variant">
          Which decision is this about?
          <select
            value={lineId}
            onChange={(e) => setLineId(e.target.value)}
            className={fieldClass}
          >
            <option value="">Pick a decision</option>
            {decisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.text}
              </option>
            ))}
          </select>
        </label>
      )}
      {ctx.open && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={saving || !lineId}
            onClick={() =>
              void ctx.run(
                key,
                () =>
                  attestLine(
                    ctx.meetingId,
                    "view",
                    lineId,
                    suggestion.position,
                    suggestion.id,
                  ),
                "Saved as your view",
              )
            }
            className={quietBtn}
          >
            Adopt as my view
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              void ctx.run(
                key,
                () => dismissSuggestion(ctx.meetingId, suggestion.id),
                "Suggestion dismissed",
              )
            }
            className={quietBtn}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
};

const SuggestionPanel = ({
  state,
  ctx,
}: {
  state: MinutesReviewState;
  ctx: Ctx;
}) => {
  const pending = state.mySuggestions.filter((s) => s.status === "suggested");
  if (pending.length === 0) return null;
  const decisions = state.lines.filter((l) => l.section === "decision");
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-headline-sm font-semibold text-on-surface">
          Possible objections you raised
        </h2>
        <p className="text-body-md text-on-surface-variant">
          Only you see these. The AI thinks you may have disagreed here. Adopt
          one to record it as your view, or dismiss it.
        </p>
      </div>
      <div className={`${cardShell} divide-y divide-surface-variant`}>
        {pending.map((s) => (
          <SuggestionCard
            key={s.id}
            suggestion={s}
            decisions={decisions}
            ctx={ctx}
          />
        ))}
      </div>
    </section>
  );
};

const SealPanel = ({
  seal,
  meetingId,
}: {
  seal: MinutesSealView;
  meetingId: string;
}) => {
  const [downloading, setDownloading] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(seal.hash);
      toast.success("Fingerprint copied");
    } catch {
      toast.error(
        "Could not copy. Select the fingerprint and copy it by hand.",
      );
    }
  };
  const download = async () => {
    setDownloading(true);
    try {
      await downloadMinutesPdf(meetingId);
    } catch (err) {
      console.error("[tasdeeq] pdf download failed:", err);
      toast.error(
        err instanceof Error ? err.message : "Could not download the PDF.",
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <section className={`${cardShell} flex flex-col gap-4 p-6`}>
      <div className="flex flex-col gap-1">
        <h2 className="text-headline-sm font-semibold text-on-surface">
          Sealed minutes
        </h2>
        <p className="text-body-md font-medium text-on-surface">
          {seal.statusText}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-label-caps font-medium uppercase tracking-wider text-on-surface-variant">
          Seal fingerprint (SHA-256)
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <code className="break-all rounded-lg bg-surface-container-low px-3 py-2 font-mono text-body-md text-on-surface">
            {seal.hash}
          </code>
          <button
            type="button"
            onClick={() => void copy()}
            className={quietBtn}
          >
            <Copy className="h-4 w-4" /> Copy
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <a
          href={seal.verifyPath}
          target="_blank"
          rel="noreferrer"
          className={quietBtn}
        >
          <ExternalLink className="h-4 w-4" /> Check the seal
        </a>
        <button
          type="button"
          disabled={downloading}
          onClick={() => void download()}
          className={primaryBtn}
        >
          <Download className="h-4 w-4" />{" "}
          {downloading ? "Preparing PDF" : "Download PDF"}
        </button>
      </div>
    </section>
  );
};

const OwnerControls = ({
  state,
  ctx,
}: {
  state: MinutesReviewState;
  ctx: Ctx;
}) => {
  const [confirmCancel, setConfirmCancel] = useState(false);
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-surface-variant p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={ctx.busy !== null || state.sealBlocker !== null}
          onClick={() =>
            void ctx.run(
              "seal",
              () => sealMinutes(ctx.meetingId),
              "Minutes sealed",
            )
          }
          className={primaryBtn}
        >
          {ctx.busy === "seal" ? "Sealing" : "Seal the minutes"}
        </button>
        {state.sealBlocker && (
          <span className="text-body-md text-on-surface-variant">
            {state.sealBlocker}
          </span>
        )}
      </div>
      {!confirmCancel ? (
        <button
          type="button"
          onClick={() => setConfirmCancel(true)}
          className={dangerBtn}
        >
          Cancel review
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg bg-error-container p-3">
          <p className="text-body-md text-error">
            Cancel this review? Every claim and answer is deleted, and you can
            reprocess the meeting again.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={ctx.busy !== null}
              onClick={() =>
                void ctx.run(
                  "cancel",
                  () => cancelReview(ctx.meetingId),
                  "Review cancelled",
                )
              }
              className={dangerBtn}
            >
              Yes, cancel the review
            </button>
            <button
              type="button"
              onClick={() => setConfirmCancel(false)}
              className={quietBtn}
            >
              Keep it
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const FinishBar = ({ state, ctx }: { state: MinutesReviewState; ctx: Ctx }) => {
  const left = state.lines.filter((l) => l.mine && !l.myAnswer).length;
  if (state.myDoneAt) {
    return (
      <p className="text-body-md font-medium text-on-surface">
        You finished your review.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={ctx.busy !== null || left > 0}
        onClick={() =>
          void ctx.run(
            "finish",
            () => finishReview(ctx.meetingId),
            "Review finished",
          )
        }
        className={primaryBtn}
      >
        Finish my review
      </button>
      {left > 0 && (
        <span className="text-body-md text-on-surface-variant">
          Answer your lines first ({left} left)
        </span>
      )}
    </div>
  );
};

const MinutesReview = ({
  meetingId,
  state,
  onChanged,
}: {
  meetingId: string;
  state: MinutesReviewState;
  onChanged: () => Promise<void>;
}) => {
  const [busy, setBusy] = useState<string | null>(null);
  const open = state.status === "open";

  const run: Ctx["run"] = async (key, task, done) => {
    setBusy(key);
    try {
      await task();
      toast.success(done);
      await onChanged();
      return true;
    } catch (err) {
      console.error("[tasdeeq] minutes action failed:", err);
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
      await onChanged();
      return false;
    } finally {
      setBusy(null);
    }
  };
  const ctx: Ctx = { meetingId, open, busy, run };

  const mine = state.lines.filter((l) => l.mine);
  const viewable = state.lines.filter((l) => !l.mine && l.canView);
  const rest = state.lines.filter((l) => !l.mine && !l.canView);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 rounded-lg bg-surface-container-low px-4 py-3 text-body-md text-on-surface-variant">
        {open && (
          <span className="font-medium text-on-surface">
            {state.progress.done} of {state.progress.total} finished, deadline{" "}
            {formatDeadline(state.deadlineAt)}
          </span>
        )}
        {state.status === "sealing" && (
          <span className="font-medium text-on-surface">
            The owner is sealing these minutes.
          </span>
        )}
        <span>{state.coverageText}</span>
        {state.transcriptSource === "recording" && (
          <span>Quotes are English translations of the recording</span>
        )}
      </div>

      {state.seal && <SealPanel seal={state.seal} meetingId={meetingId} />}

      {open && <SpeakerStrip state={state} ctx={ctx} />}
      {open && <SuggestionPanel state={state} ctx={ctx} />}

      {open ? (
        <>
          <LineGroup
            title="Your lines"
            hint="Confirm each line, correct it, or record your view."
            lines={mine}
            ctx={ctx}
          />
          <LineGroup
            title="Other lines you can add a view to"
            lines={viewable}
            ctx={ctx}
          />
          <LineGroup title="The rest of the minutes" lines={rest} ctx={ctx} />
        </>
      ) : (
        <LineGroup title="Minutes" lines={state.lines} ctx={ctx} />
      )}

      {open && (
        <section className="flex flex-col gap-3">
          <h2 className="text-headline-sm font-semibold text-on-surface">
            Progress
          </h2>
          <ul className="flex flex-col gap-1 text-body-md text-on-surface-variant">
            {state.attesters.map((a) => (
              <li key={a.userId}>
                {a.displayName}
                {a.isOwner ? " (owner)" : ""}:{" "}
                {a.done ? "finished" : "not finished"}
              </li>
            ))}
          </ul>
          <FinishBar state={state} ctx={ctx} />
          {state.isOwner && <OwnerControls state={state} ctx={ctx} />}
        </section>
      )}
    </div>
  );
};

export default MinutesReview;
