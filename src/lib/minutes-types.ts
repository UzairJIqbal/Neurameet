// Tasdeeq, Verified Minutes (spec 0003). Shared by the minutes routes and the
// Minutes tab, so it carries no server only imports.

export const MINUTES_MAX_QUOTES = 2;
export const MINUTES_MAX_SUMMARY_POINTS = 6;
export const MINUTES_MAX_KEY_POINTS = 8;
export const MINUTES_MAX_DECISIONS = 8;
export const DISSENT_SUGGESTIONS_MAX = 5;
export const MINUTES_NOTE_MAX = 500;
export const MINUTES_DEADLINE_DAYS = [3, 7] as const;
export const MINUTES_DEFAULT_DEADLINE_DAYS = 3;
export const MINUTES_TZ = "Asia/Karachi";
export const SPEAKER_LABEL_MAX = 60;

export type MinutesSection =
  "summary" | "key_point" | "decision" | "action_item";
export type TranscriptSource = "upload" | "recording";

export interface MinutesEvidence {
  quote: string;
  lineNumber: number;
  speaker: string | null;
}

export interface MinutesDraftLine {
  section: MinutesSection;
  text: string;
  evidence: MinutesEvidence[];
  supported: boolean;
  /** Distinct non null evidence speakers, first seen spelling. */
  speakerLabels: string[];
  /** action_item lines only. */
  actionItemId: string | null;
  /** action_item lines only. */
  assignee: string | null;
}

export interface MinutesDraftSuggestion {
  speakerLabel: string;
  topic: string;
  position: string;
  quote: string;
  lineNumber: number;
  relatedDecisionIndex: number | null;
}

export interface MinutesCoverage {
  /** Last transcript line the model saw (the extraction character cap). */
  lastLine: number;
  /** Line count of the full raw_text. */
  totalLines: number;
}

export interface MinutesDraft {
  version: 1;
  lines: MinutesDraftLine[];
  dissentSuggestions: MinutesDraftSuggestion[];
  coverage: MinutesCoverage;
}

export type MinutesReviewStatus = "open" | "sealing" | "sealed";
export type MinutesAttestAction = "confirm" | "correct" | "view";
export type MinutesClaimedBy = "self" | "owner";
export type MinutesSuggestionStatus = "suggested" | "adopted" | "dismissed";

export interface MinutesAnswer {
  userId: string;
  displayName: string;
  action: MinutesAttestAction;
  note: string | null;
  late: boolean;
}

export interface MinutesEvidenceView extends MinutesEvidence {
  /** The transcript line the quote was found on, shown beside the quote. */
  lineText: string | null;
}

export interface MinutesReviewLine {
  id: string;
  position: number;
  section: MinutesSection;
  text: string;
  evidence: MinutesEvidenceView[];
  supported: boolean;
  speakerLabels: string[];
  assignee: string | null;
  /** Attributed to the caller at read time (AC-9). */
  mine: boolean;
  /** The caller may record a view here (AC-10). */
  canView: boolean;
  myAnswer: MinutesAnswer | null;
  answers: MinutesAnswer[];
}

export interface MinutesSpeaker {
  key: string;
  label: string;
  holderId: string | null;
  holderName: string | null;
  claimedBy: MinutesClaimedBy | null;
  /** The holder already answered a line from this label, so it can't be cleared. */
  locked: boolean;
  /** Matches the caller's display name and is unclaimed (AC-8). */
  suggested: boolean;
}

export interface MinutesAttesterView {
  userId: string;
  displayName: string;
  isOwner: boolean;
  done: boolean;
}

export interface MinutesSuggestionView {
  id: string;
  speakerLabel: string;
  topic: string;
  position: string;
  quote: string;
  lineNumber: number;
  relatedLineId: string | null;
  status: MinutesSuggestionStatus;
}

export interface MinutesSealView {
  id: string;
  hash: string;
  statusText: string;
  sealedAt: string;
  verifyPath: string;
}

export interface MinutesReviewState {
  state: "review";
  status: MinutesReviewStatus;
  reviewId: string;
  isOwner: boolean;
  myUserId: string;
  deadlineAt: string;
  deadlineDays: number;
  coverageText: string;
  transcriptSource: TranscriptSource;
  lines: MinutesReviewLine[];
  speakers: MinutesSpeaker[];
  attesters: MinutesAttesterView[];
  mySuggestions: MinutesSuggestionView[];
  progress: { done: number; total: number };
  myDoneAt: string | null;
  /** Owner only: why Seal is disabled, or null when it can run. */
  sealBlocker: string | null;
  seal: MinutesSealView | null;
}

export type MinutesResponse =
  | { state: "draft"; draft: MinutesDraft; transcriptSource: TranscriptSource }
  | { state: "no_draft" }
  | { state: "not_open" }
  | MinutesReviewState;

export const verifyPath = (sealId: string): string =>
  `/minutes/verify/${sealId}`;

/** "Wed, 11 Nov 2026, 23:59 PKT" style deadline for the tab and the email. */
export function formatDeadline(iso: string): string {
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: MINUTES_TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
  return `${date}, 23:59 PKT`;
}

/** Shown on the tab, and later in the sealed bundle and the PDF (AC-2). */
export function coverageText({
  lastLine,
  totalLines,
}: MinutesCoverage): string {
  return `These minutes cover transcript lines 1 to ${lastLine} of ${totalLines}`;
}
