import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type {
  MinutesAttestAction,
  MinutesEvidence,
  MinutesSection,
} from "@/lib/minutes-types";

// Tasdeeq, Verified Minutes (spec 0003, AC-18, AC-19). The sealed minutes as a
// PDF, drawn with pdf-lib's standard Helvetica like the attendance report.
// Helvetica can't draw Urdu, so those characters become "?" and a note says so.

const PAGE_W = 612; // US Letter, points
const PAGE_H = 792;
const MARGIN = 48;
const TEXT_W = PAGE_W - MARGIN * 2;
const BODY = 10;
const LEADING = 14;

export const URDU_NOTE =
  "Some characters (for example Urdu) can't be drawn in this PDF and are shown as ?. The sealed record and the Minutes tab keep the original text.";
export const RECORDING_NOTE =
  "Quotes are English translations of the recording";

const SECTION_TITLES: Record<MinutesSection, string> = {
  summary: "Summary",
  key_point: "Key points",
  decision: "Decisions",
  action_item: "Action items",
};
const SECTION_ORDER: MinutesSection[] = [
  "summary",
  "key_point",
  "decision",
  "action_item",
];

export interface MinutesPdfAnswer {
  displayName: string;
  action: MinutesAttestAction;
  note: string | null;
  late: boolean;
}

export interface MinutesPdfLine {
  section: MinutesSection;
  text: string;
  evidence: MinutesEvidence[];
  supported: boolean;
  assignee: string | null;
  answers: MinutesPdfAnswer[];
}

export interface MinutesPdfInput {
  title: string;
  date: string;
  coverageText: string;
  fromRecording: boolean;
  statusText: string;
  hash: string;
  verifyUrl: string;
  sealedAt: string;
  lines: MinutesPdfLine[];
}

/** Characters Helvetica can't draw become "?"; `replaced` drives the Urdu note. */
export function toPdfSafe(
  text: string,
  supported: ReadonlySet<number>,
): { text: string; replaced: boolean } {
  let replaced = false;
  const out = Array.from(text.replace(/\s+/gu, " "), (ch) => {
    if (supported.has(ch.codePointAt(0) ?? 0)) return ch;
    replaced = true;
    return "?";
  }).join("");
  return { text: out, replaced };
}

/** "Recorded view of NAME" for views (AC-18). */
export function answerLabel(a: MinutesPdfAnswer): string {
  const head =
    a.action === "confirm"
      ? `Confirmed by ${a.displayName}`
      : a.action === "correct"
        ? `Correction by ${a.displayName}`
        : `Recorded view of ${a.displayName}`;
  const late = a.late ? " (late)" : "";
  return a.note ? `${head}${late}: ${a.note}` : `${head}${late}`;
}

function wrap(
  text: string,
  font: PDFFont,
  size: number,
  width: number,
): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width) {
      line = next;
      continue;
    }
    if (line) out.push(line);
    // A single word wider than the page (a hash, a URL) is cut by characters.
    let rest = word;
    while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
      let cut = rest.length - 1;
      while (
        cut > 1 &&
        font.widthOfTextAtSize(rest.slice(0, cut), size) > width
      )
        cut -= 1;
      out.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    line = rest;
  }
  if (line) out.push(line);
  return out.length > 0 ? out : [""];
}

class Writer {
  private page: PDFPage;
  private y = PAGE_H - MARGIN;
  replaced = false;

  constructor(
    private doc: PDFDocument,
    private regular: PDFFont,
    private bold: PDFFont,
    private supported: ReadonlySet<number>,
  ) {
    this.page = doc.addPage([PAGE_W, PAGE_H]);
  }

  private ensure(height: number) {
    if (this.y - height >= MARGIN) return;
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN;
  }

  text(
    raw: string,
    opts: {
      size?: number;
      bold?: boolean;
      indent?: number;
      gray?: boolean;
    } = {},
  ) {
    const size = opts.size ?? BODY;
    const font = opts.bold ? this.bold : this.regular;
    const indent = opts.indent ?? 0;
    const safe = toPdfSafe(raw, this.supported);
    if (safe.replaced) this.replaced = true;
    const leading = Math.max(LEADING, size + 4);
    for (const line of wrap(safe.text, font, size, TEXT_W - indent)) {
      this.ensure(leading);
      this.y -= leading;
      this.page.drawText(line, {
        x: MARGIN + indent,
        y: this.y,
        size,
        font,
        color: opts.gray ? rgb(0.35, 0.35, 0.35) : rgb(0, 0, 0),
      });
    }
  }

  gap(points = 8) {
    this.y -= points;
  }
}

function writeLine(w: Writer, line: MinutesPdfLine, n: number) {
  w.text(`${n}. ${line.text}${line.supported ? "" : "  [Unsupported]"}`, {
    bold: true,
  });
  if (line.section === "action_item" && line.assignee) {
    w.text(`Assignee: ${line.assignee}`, { indent: 14, gray: true });
  }
  const numbers = line.evidence.map((e) => e.lineNumber);
  w.text(
    numbers.length > 0
      ? `Evidence: transcript line ${numbers.join(", ")}`
      : "Evidence: none found in the transcript",
    { indent: 14, gray: true },
  );
  for (const e of line.evidence) {
    w.text(
      `Line ${e.lineNumber}${e.speaker ? `, ${e.speaker}` : ""}: "${e.quote}"`,
      {
        indent: 14,
        gray: true,
      },
    );
  }
  for (const a of line.answers) w.text(answerLabel(a), { indent: 14 });
  w.gap(6);
}

export async function generateMinutesPdf(
  input: MinutesPdfInput,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Sealed minutes: ${input.title}`);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(doc, regular, bold, new Set(regular.getCharacterSet()));

  w.text("Sealed minutes", { size: 18, bold: true });
  w.text(input.title, { size: 13, bold: true });
  w.text(
    `Meeting date: ${input.date || "Not recorded"}. Sealed: ${input.sealedAt.slice(0, 10)} (UTC).`,
    {
      gray: true,
    },
  );
  w.gap();
  w.text(input.statusText, { bold: true });
  w.text(input.coverageText);
  if (input.fromRecording) w.text(RECORDING_NOTE);
  w.gap(12);

  let n = 1;
  for (const section of SECTION_ORDER) {
    const lines = input.lines.filter((l) => l.section === section);
    if (lines.length === 0) continue;
    w.text(SECTION_TITLES[section], { size: 13, bold: true });
    w.gap(4);
    for (const line of lines) writeLine(w, line, n++);
    w.gap(6);
  }

  w.gap(6);
  w.text("Seal", { size: 13, bold: true });
  w.text(`Fingerprint (SHA-256): ${input.hash}`);
  w.text(`Check it at: ${input.verifyUrl}`);
  if (w.replaced) {
    w.gap();
    w.text(URDU_NOTE, { gray: true });
  }

  return doc.save();
}
