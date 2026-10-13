/* eslint-disable prettier/prettier */
import { PDFDocument, StandardFonts, PDFFont, rgb } from "pdf-lib";
import type { AttendanceRow, MeetingDetailData } from "@/lib/meeting-types";

const PAGE_W = 612; // US Letter, points
const PAGE_H = 792;
const MARGIN = 40;
const LINE_HEIGHT = 16;

interface Column {
  label: string;
  width: number;
}

const COLUMNS: readonly Column[] = [
  { label: "Participant", width: 110 },
  { label: "Email", width: 130 },
  { label: "Joined", width: 70 },
  { label: "Left", width: 70 },
  { label: "Duration", width: 45 },
  { label: "Talk time", width: 50 },
  { label: "Mic", width: 27 },
  { label: "Camera", width: 30 },
] as const;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatUtc(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${pad2(m)}:${pad2(sec)}`;
}

function displayName(row: AttendanceRow): string {
  return row.participantName?.trim() || row.participantEmail?.trim() || "Unknown";
}

function sessionDurationSeconds(row: AttendanceRow): number {
  if (!row.sessionEndedAt) return 0;
  const delta =
    new Date(row.sessionEndedAt).getTime() -
    new Date(row.sessionStartedAt).getTime();
  return Math.max(0, Math.round(delta / 1000));
}

function fit(text: string, width: number, font: PDFFont, size: number): string {
  if (font.widthOfTextAtSize(text, size) <= width) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > width) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
}

/**
 * Pure mapping of attendance rows to table cells. No pdf-lib dependency, so it
 * is the unit-testable core (columns, counts, formatting) without parsing a
 * binary PDF.
 */
export function buildReportRows(
  _meeting: MeetingDetailData,
  rows: AttendanceRow[],
): { headers: string[]; lines: string[][] } {
  const headers = COLUMNS.map((c) => c.label);
  const lines = rows.map((row) => [
    displayName(row),
    row.participantEmail ?? "—",
    formatUtc(row.sessionStartedAt),
    formatUtc(row.sessionEndedAt),
    row.sessionEndedAt ? formatDuration(sessionDurationSeconds(row)) : "—",
    formatDuration(row.talkTimeSeconds),
    String(row.micToggles),
    String(row.cameraToggles),
  ]);
  return { headers, lines };
}

// The standard Helvetica font only encodes WinAnsi characters and pdf-lib
// throws on anything else (Urdu, CJK, emoji...). Names and titles come from
// user input, so swap unsupported characters for "?" instead of failing the
// whole report.
function toFontSafe(text: string, supported: ReadonlySet<number>): string {
  return Array.from(text, (ch) =>
    supported.has(ch.codePointAt(0) ?? 0) ? ch : "?",
  ).join("");
}

export async function generateAttendancePdf(
  meeting: MeetingDetailData,
  rows: AttendanceRow[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const supported = new Set(regular.getCharacterSet());
  const built = buildReportRows(meeting, rows);
  const headers = built.headers;
  const lines = built.lines.map((line) =>
    line.map((cell) => toFontSafe(cell, supported)),
  );

  const colX: number[] = [];
  let cursor = MARGIN;
  for (const c of COLUMNS) {
    colX.push(cursor);
    cursor += c.width;
  }

  const dateLabel = meeting.startedAt ?? meeting.createdAt;
  const dateStr = dateLabel
    ? `${new Date(dateLabel).toISOString().slice(0, 10)} (UTC)`
    : "—";

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  page.drawText("Attendance Report", {
    x: MARGIN,
    y: y - 16,
    size: 16,
    font: bold,
    color: rgb(0, 0, 0),
  });
  y -= 16;

  page.drawText(
    toFontSafe(
      `${meeting.title || "Untitled meeting"}  ·  ${dateStr}  ·  ${meeting.status}`,
      supported,
    ),
    { x: MARGIN, y: y - 14, size: 10, font: regular, color: rgb(0.2, 0.2, 0.2) },
  );
  y -= 28;

  const drawHeader = (headerY: number) => {
    for (let i = 0; i < headers.length; i++) {
      page.drawText(headers[i], {
        x: colX[i],
        y: headerY,
        size: 9,
        font: bold,
        color: rgb(0, 0, 0),
      });
    }
    page.drawLine({
      start: { x: MARGIN, y: headerY - 4 },
      end: { x: PAGE_W - MARGIN, y: headerY - 4 },
      thickness: 0.75,
      color: rgb(0, 0, 0),
    });
  };

  let dataY = y - 12;
  drawHeader(dataY);
  dataY -= LINE_HEIGHT;

  for (const line of lines) {
    if (dataY < MARGIN + 12) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      dataY = PAGE_H - MARGIN - 12;
      drawHeader(dataY);
      dataY -= LINE_HEIGHT;
    }
    for (let i = 0; i < line.length; i++) {
      page.drawText(fit(line[i], COLUMNS[i].width, regular, 8), {
        x: colX[i],
        y: dataY,
        size: 8,
        font: regular,
        color: rgb(0, 0, 0),
      });
    }
    page.drawLine({
      start: { x: MARGIN, y: dataY - 3 },
      end: { x: PAGE_W - MARGIN, y: dataY - 3 },
      thickness: 0.25,
      color: rgb(0.85, 0.85, 0.85),
    });
    dataY -= LINE_HEIGHT;
  }

  page.drawText(`Total sessions: ${lines.length}`, {
    x: MARGIN,
    y: MARGIN,
    size: 9,
    font: bold,
    color: rgb(0, 0, 0),
  });

  return doc.save();
}
