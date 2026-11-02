import {
  DISSENT_SUGGESTIONS_MAX,
  MINUTES_MAX_DECISIONS,
  MINUTES_MAX_KEY_POINTS,
  MINUTES_MAX_QUOTES,
  MINUTES_MAX_SUMMARY_POINTS,
  SPEAKER_LABEL_MAX,
  type MinutesAttestAction,
  type MinutesCoverage,
  type MinutesDraft,
  type MinutesDraftLine,
  type MinutesDraftSuggestion,
  type MinutesEvidence,
  type MinutesSection,
} from "@/lib/minutes-types";
import {
  findQuoteLines,
  normalizeForMatch,
  speakerLabel,
  type QuoteLocation,
} from "./ledger";
import type { ExtractionResult } from "./types";

// Tasdeeq, Verified Minutes (spec 0003). Pure helpers, no I/O: the minutes
// draft is built from the single extraction call, and every quote is located
// in the transcript here, never trusted from the model.

/** Label key: lowercase, trimmed, inner spaces collapsed. Claims match on it. */
export function labelKey(label: string): string {
  return normalizeForMatch(label);
}

/** Which transcript lines the model saw under the extraction character cap (AC-2). */
export function computeCoverage(
  rawText: string,
  maxChars: number,
): MinutesCoverage {
  const totalLines = rawText.split(/\r?\n/u).length;
  if (rawText.length <= maxChars) return { lastLine: totalLines, totalLines };

  const seen = rawText.slice(0, maxChars).split(/\r?\n/u).length;
  const next = rawText.charAt(maxChars);
  const cutEndsLine = next === "\n" || next === "\r";
  return { lastLine: cutEndsLine ? seen : seen - 1, totalLines };
}

/** Matches of `quote` the model actually saw. */
function locate(
  rawText: string,
  quote: string,
  lastLine: number,
): QuoteLocation[] {
  return findQuoteLines(rawText, quote).filter((m) => m.lineNumber <= lastLine);
}

/** First match spoken by one of the hinted speakers, else the first match (AC-1). */
function pickMatch(
  matches: QuoteLocation[],
  speakerKeys: Set<string>,
): QuoteLocation | null {
  const named = matches.find(
    (m) => m.speaker !== null && speakerKeys.has(labelKey(m.speaker)),
  );
  return named ?? matches[0] ?? null;
}

function buildEvidence(
  rawText: string,
  quotes: string[] | null,
  speakers: string[] | null,
  lastLine: number,
): MinutesEvidence[] {
  const speakerKeys = new Set((speakers ?? []).map(labelKey));
  const evidence: MinutesEvidence[] = [];
  for (const quote of (quotes ?? []).slice(0, MINUTES_MAX_QUOTES)) {
    const match = pickMatch(locate(rawText, quote, lastLine), speakerKeys);
    if (!match) continue;
    if (evidence.some((e) => e.lineNumber === match.lineNumber)) continue;
    evidence.push({
      quote,
      lineNumber: match.lineNumber,
      speaker: match.speaker,
    });
  }
  return evidence;
}

function distinctSpeakers(evidence: MinutesEvidence[]): string[] {
  const seen = new Map<string, string>();
  for (const e of evidence) {
    if (e.speaker && !seen.has(labelKey(e.speaker))) {
      seen.set(labelKey(e.speaker), e.speaker);
    }
  }
  return [...seen.values()];
}

function toLine(
  section: MinutesSection,
  text: string,
  evidence: MinutesEvidence[],
  actionItemId: string | null = null,
  assignee: string | null = null,
): MinutesDraftLine {
  return {
    section,
    text,
    evidence,
    supported: evidence.length > 0,
    speakerLabels: distinctSpeakers(evidence),
    actionItemId,
    assignee,
  };
}

/** The minutes lists cut to the spec caps; the route fills the old columns from these. */
export function cutMinutes(minutes: ExtractionResult["minutes"]) {
  return {
    summaryPoints: minutes.summaryPoints.slice(0, MINUTES_MAX_SUMMARY_POINTS),
    keyPoints: minutes.keyPoints.slice(0, MINUTES_MAX_KEY_POINTS),
    decisions: minutes.decisions.slice(0, MINUTES_MAX_DECISIONS),
  };
}

/** Keep a suggestion only when its quote is located on a line its own speaker said (AC-3). */
function validateSuggestions(
  rawText: string,
  suggestions: ExtractionResult["dissentSuggestions"],
  lastLine: number,
  decisionCount: number,
): { kept: MinutesDraftSuggestion[]; dropped: number } {
  const offered = (suggestions ?? []).slice(0, DISSENT_SUGGESTIONS_MAX);
  const kept: MinutesDraftSuggestion[] = [];
  for (const s of offered) {
    const key = labelKey(s.speakerLabel);
    const match = locate(rawText, s.quote, lastLine).find(
      (m) => m.speaker !== null && labelKey(m.speaker) === key,
    );
    if (!match) continue;
    const index = s.relatedDecisionIndex;
    kept.push({
      speakerLabel: s.speakerLabel,
      topic: s.topic,
      position: s.position,
      quote: s.quote,
      lineNumber: match.lineNumber,
      relatedDecisionIndex:
        index !== null && index >= 0 && index < decisionCount ? index : null,
    });
  }
  return { kept, dropped: offered.length - kept.length };
}

/**
 * The minutes draft stored on meeting_insights (AC-1, AC-2, AC-3). Lines go
 * summary points, key points, decisions, then action items. `actionItemIds`
 * follows `result.actionItems` order.
 */
export function buildMinutesDraft({
  result,
  rawText,
  actionItemIds,
  maxChars,
}: {
  result: ExtractionResult;
  rawText: string;
  actionItemIds: string[];
  maxChars: number;
}): { draft: MinutesDraft; droppedSuggestions: number } {
  const coverage = computeCoverage(rawText, maxChars);
  const { lastLine } = coverage;
  const minutes = cutMinutes(result.minutes);
  const point =
    (section: MinutesSection) =>
    (p: ExtractionResult["minutes"]["keyPoints"][number]) =>
      toLine(
        section,
        p.text,
        buildEvidence(rawText, p.quotes, p.speakers, lastLine),
      );

  const lines: MinutesDraftLine[] = [
    ...minutes.summaryPoints.map(point("summary")),
    ...minutes.keyPoints.map(point("key_point")),
    ...minutes.decisions.map(point("decision")),
    ...result.actionItems.map((item, i) =>
      toLine(
        "action_item",
        item.title,
        buildEvidence(rawText, item.quotes, null, lastLine),
        actionItemIds[i] ?? null,
        item.assignee ?? null,
      ),
    ),
  ];

  const { kept, dropped } = validateSuggestions(
    rawText,
    result.dissentSuggestions,
    lastLine,
    minutes.decisions.length,
  );

  return {
    draft: { version: 1, lines, dissentSuggestions: kept, coverage },
    droppedSuggestions: dropped,
  };
}

// ---------------------------------------------------------------------------
// Review helpers (T2 to T4). Still pure: the routes load the rows and pass them in.

/** Pakistan has no daylight saving, so Asia/Karachi is always UTC+5. */
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

/**
 * 23:59:59 Asia/Karachi on the Nth working day after the day `now` falls on
 * in Karachi (AC-6). Saturday and Sunday are skipped, the opening day is not
 * counted, and there is no holiday calendar.
 */
export function computeDeadline(now: Date, workingDays: number): Date {
  const local = new Date(now.getTime() + PKT_OFFSET_MS);
  const day = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
  );
  let left = workingDays;
  while (left > 0) {
    day.setUTCDate(day.getUTCDate() + 1);
    const weekday = day.getUTCDay();
    if (weekday !== 0 && weekday !== 6) left -= 1;
  }
  return new Date(
    Date.UTC(
      day.getUTCFullYear(),
      day.getUTCMonth(),
      day.getUTCDate(),
      23,
      59,
      59,
    ) - PKT_OFFSET_MS,
  );
}

export interface SpeakerLabelEntry {
  key: string;
  label: string;
}

/**
 * Every speaker label in the transcript (AC-8), merged by label key, first
 * seen spelling kept. `speakerLabel()` already drops labels with no letter
 * (timestamps like `10:30`); labels over the length cap are skipped.
 */
export function listSpeakerLabels(rawText: string): SpeakerLabelEntry[] {
  const seen = new Map<string, string>();
  for (const line of rawText.split(/\r?\n/u)) {
    const label = speakerLabel(line);
    if (!label || label.length > SPEAKER_LABEL_MAX) continue;
    const key = labelKey(label);
    if (!seen.has(key)) seen.set(key, label);
  }
  return [...seen.entries()].map(([key, label]) => ({ key, label }));
}

export interface AttributableLine {
  id: string;
  section: MinutesSection;
  supported: boolean;
  evidence: MinutesEvidence[];
  assignee: string | null;
}

export interface AttesterRef {
  userId: string;
  displayName: string;
  isOwner: boolean;
  doneAt: string | null;
}

export interface ClaimRef {
  /** The label key. */
  speakerLabel: string;
  userId: string;
}

const firstWord = (key: string): string => key.split(" ")[0] ?? "";

function evidenceKeys(line: AttributableLine): string[] {
  return line.evidence
    .map((e) => e.speaker)
    .filter((s): s is string => s !== null)
    .map(labelKey);
}

function assigneeMatches(assignee: string, keys: string[]): boolean {
  const key = labelKey(assignee);
  const word = firstWord(key);
  return keys.some((k) => k === key || (word !== "" && firstWord(k) === word));
}

/**
 * Who a line belongs to (AC-9), computed at read time and never stored. A line
 * is yours when an evidence speaker is one of your claimed labels, or, for an
 * action item, the assignee matches a claimed label or your display name. A
 * line with no evidence speaker and no matching assignee, and every
 * unsupported line, belongs to the owner.
 */
export function lineHolders(
  line: AttributableLine,
  attesters: AttesterRef[],
  claims: ClaimRef[],
): string[] {
  const holders = new Set<string>();
  const speakers = evidenceKeys(line);
  for (const claim of claims) {
    if (speakers.includes(claim.speakerLabel)) holders.add(claim.userId);
  }
  if (line.section === "action_item" && line.assignee) {
    for (const a of attesters) {
      const keys = [
        ...claims
          .filter((c) => c.userId === a.userId)
          .map((c) => c.speakerLabel),
        labelKey(a.displayName),
      ];
      if (assigneeMatches(line.assignee, keys)) holders.add(a.userId);
    }
  }
  const owner = attesters.find((a) => a.isOwner);
  const orphan = holders.size === 0 && speakers.length === 0;
  if (owner && (orphan || !line.supported)) holders.add(owner.userId);
  return [...holders];
}

export function attributedLineIds(
  lines: AttributableLine[],
  attesters: AttesterRef[],
  claims: ClaimRef[],
  userId: string,
): string[] {
  return lines
    .filter((l) => lineHolders(l, attesters, claims).includes(userId))
    .map((l) => l.id);
}

/** A view is allowed on your lines, on any decision, and on any unsupported line (AC-10). */
export function canRecordView(line: AttributableLine, mine: boolean): boolean {
  return mine || line.section === "decision" || !line.supported;
}

/** Lines that come from one speaker label, used to lock a claim once answered (AC-8). */
export function linesFromLabel(
  lines: AttributableLine[],
  key: string,
): string[] {
  return lines
    .filter(
      (l) =>
        evidenceKeys(l).includes(key) ||
        (l.section === "action_item" &&
          l.assignee !== null &&
          assigneeMatches(l.assignee, [key])),
    )
    .map((l) => l.id);
}

/** The owner plus more than half of the other attesters; the owner alone when there are none (AC-13). */
export function quorumMet(attesters: AttesterRef[]): boolean {
  const owner = attesters.find((a) => a.isOwner);
  if (!owner?.doneAt) return false;
  const others = attesters.filter((a) => !a.isOwner);
  const done = others.filter((a) => a.doneAt !== null).length;
  return others.length === 0 || done * 2 > others.length;
}

/** Why the owner can't seal yet, or null when the seal may run (AC-13). */
export function sealBlocker(
  attesters: AttesterRef[],
  deadlineAt: string,
  now: Date,
): string | null {
  const owner = attesters.find((a) => a.isOwner);
  if (!owner?.doneAt) return "Finish your own review first.";
  if (!quorumMet(attesters) && now.getTime() < new Date(deadlineAt).getTime()) {
    return "More than half of the attendees must finish, or the deadline must pass.";
  }
  return null;
}

const plural = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;

/** The honest status line stored on the seal (AC-15). */
export function buildStatusText(
  attesters: Array<Pick<AttesterRef, "doneAt">>,
  attestations: Array<{ action: MinutesAttestAction }>,
): string {
  const total = attesters.length;
  const done = attesters.filter((a) => a.doneAt !== null).length;
  const parts = [`Confirmed by ${done} of ${total}.`];
  if (total - done > 0) parts.push(`${total - done} did not respond.`);
  const views = attestations.filter((a) => a.action === "view").length;
  const corrections = attestations.filter((a) => a.action === "correct").length;
  if (views + corrections > 0) {
    parts.push(
      `${plural(views, "recorded view", "recorded views")}, ${plural(corrections, "correction", "corrections")}.`,
    );
  }
  return parts.join(" ");
}
