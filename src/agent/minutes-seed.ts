import type { MinutesEvidence, MinutesSection } from "@/lib/minutes-types";

// Tasdeeq, Verified Minutes (spec 0003, AC-21). Pure planting logic for
// scripts/tasdeeq-seed.ts: it changes known lines in an open review so you can
// measure how many errors the attendees catch. No LLM call, no I/O.

export type PlantKind = "misattributed" | "changed_date" | "dropped_objection";

export const PLANT_KINDS: PlantKind[] = [
  "misattributed",
  "changed_date",
  "dropped_objection",
];

export interface SeedLine {
  id: string;
  position: number;
  section: MinutesSection;
  text: string;
  evidence: MinutesEvidence[];
  speakerLabels: string[];
}

export interface Plant {
  lineId: string;
  position: number;
  kind: PlantKind;
  before: {
    text: string;
    evidence: MinutesEvidence[];
    speakerLabels: string[];
  };
  after: { text: string; evidence: MinutesEvidence[]; speakerLabels: string[] };
  /** What a careful attendee should notice. */
  expected: string;
}

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DAY_RE = new RegExp(`\\b(${WEEKDAYS.join("|")})\\b`, "iu");
const MONTH_DAY_RE = new RegExp(
  `\\b(\\d{1,2})(\\s+)(${MONTHS.join("|")})\\b|\\b(${MONTHS.join("|")})(\\s+)(\\d{1,2})\\b`,
  "iu",
);
const ISO_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/u;

/** Two days later, or three earlier near the month end, so it stays a real date. */
const shiftDay = (day: number): number => (day >= 27 ? day - 3 : day + 2);

/** Moves the first date like value in the text. Null when there is none. */
export function changeDate(text: string): string | null {
  const iso = ISO_RE.exec(text);
  if (iso) {
    const day = String(shiftDay(Number(iso[3]))).padStart(2, "0");
    return text.replace(ISO_RE, `${iso[1]}-${iso[2]}-${day}`);
  }
  const md = MONTH_DAY_RE.exec(text);
  if (md) {
    if (md[1])
      return text.replace(
        MONTH_DAY_RE,
        `${shiftDay(Number(md[1]))}${md[2]}${md[3]}`,
      );
    return text.replace(
      MONTH_DAY_RE,
      `${md[4]}${md[5]}${shiftDay(Number(md[6]))}`,
    );
  }
  const day = DAY_RE.exec(text);
  if (day) {
    const i = WEEKDAYS.findIndex(
      (d) => d.toLowerCase() === day[1].toLowerCase(),
    );
    return text.replace(DAY_RE, WEEKDAYS[(i + 2) % 5]);
  }
  return null;
}

function otherLabel(line: SeedLine, labels: string[]): string | null {
  const mine = new Set(line.speakerLabels.map((l) => l.toLowerCase()));
  return labels.find((l) => !mine.has(l.toLowerCase())) ?? null;
}

function plantOne(
  line: SeedLine,
  kind: PlantKind,
  labels: string[],
): Plant | null {
  const before = {
    text: line.text,
    evidence: line.evidence,
    speakerLabels: line.speakerLabels,
  };
  const base = { lineId: line.id, position: line.position, kind, before };

  if (kind === "misattributed") {
    if (line.evidence.length === 0 || line.speakerLabels.length === 0)
      return null;
    const to = otherLabel(line, labels);
    if (!to) return null;
    return {
      ...base,
      after: {
        text: line.text,
        evidence: line.evidence.map((e) => ({ ...e, speaker: to })),
        speakerLabels: [to],
      },
      expected: `${to} gets a line ${line.speakerLabels[0]} said, so ${to} should correct it`,
    };
  }

  if (kind === "changed_date") {
    if (line.section !== "action_item" && line.section !== "decision")
      return null;
    const text = changeDate(line.text);
    if (!text || text === line.text) return null;
    return {
      ...base,
      after: { ...before, text },
      expected: `The date was changed: "${line.text}" now reads "${text}"`,
    };
  }

  if (line.section !== "decision") return null;
  return {
    ...base,
    after: {
      ...before,
      text: `Everyone agreed, with no objections: ${line.text}`,
    },
    expected:
      "The line claims no one objected; anyone who objected should record a view",
  };
}

/**
 * Plants up to `k` errors, cycling the three kinds, at most one per line.
 * Lines are tried in position order so the answer key is repeatable.
 */
export function planSeed(lines: SeedLine[], k: number): Plant[] {
  const labels = Array.from(new Set(lines.flatMap((l) => l.speakerLabels)));
  const sorted = [...lines].sort((a, b) => a.position - b.position);
  const used = new Set<string>();
  const plants: Plant[] = [];
  let misses = 0;

  for (let i = 0; plants.length < k && misses < PLANT_KINDS.length; i += 1) {
    const kind = PLANT_KINDS[i % PLANT_KINDS.length];
    const line = sorted.find(
      (l) => !used.has(l.id) && plantOne(l, kind, labels) !== null,
    );
    if (!line) {
      misses += 1;
      continue;
    }
    misses = 0;
    const plant = plantOne(line, kind, labels);
    if (plant) {
      used.add(line.id);
      plants.push(plant);
    }
  }
  return plants;
}
