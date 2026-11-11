import ffmpegStatic from "ffmpeg-static";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";

// Pure helpers (and two small ffmpeg runners) for transcript generation.
// Kept apart from transcript-generation.ts so the logic that decides WHAT audio
// reaches Whisper, and which Whisper output is believed, is unit-testable.
//
// Why speech-only audio: Groq's free tier allows 7,200 audio seconds per HOUR
// (28,800 per day). Each participant has their own full-length track, which is
// mostly silence while others talk, so sending raw tracks burns the quota and
// invites Whisper's well known hallucinations on silence. We detect speech with
// ffmpeg `silencedetect`, cut the silence out, and map Whisper's timestamps back
// onto the real call timeline.

export type WhisperSegment = {
  start: number;
  end: number;
  text: string;
  // verbose_json quality fields (Groq returns them per segment).
  no_speech_prob?: number;
  avg_logprob?: number;
  compression_ratio?: number;
};

export type SpeechRegion = { start: number; end: number };
export type Piece = { origStart: number; compStart: number; duration: number };

// ─── Speech detection ─────────────────────────────────────────────────────────

const SILENCE_NOISE_DB = -40;
const SILENCE_MIN_SECONDS = 1;
const SPEECH_PAD_SECONDS = 0.4;
const SPEECH_MERGE_GAP_SECONDS = 2;
const SPEECH_MIN_SECONDS = 0.3;
const MAX_REGIONS = 400;

/** Parse ffmpeg `silencedetect` stderr into silence intervals. */
export function parseSilenceIntervals(
  stderr: string,
  totalSeconds: number,
): SpeechRegion[] {
  const out: SpeechRegion[] = [];
  let open: number | null = null;
  for (const line of stderr.split("\n")) {
    const s = line.match(/silence_start:\s*(-?\d+(?:\.\d+)?)/);
    if (s) {
      open = Math.max(0, Number(s[1]));
      continue;
    }
    const e = line.match(/silence_end:\s*(-?\d+(?:\.\d+)?)/);
    if (e && open !== null) {
      out.push({ start: open, end: Math.min(totalSeconds, Number(e[1])) });
      open = null;
    }
  }
  // A track that ends in silence never prints silence_end.
  if (open !== null) out.push({ start: open, end: totalSeconds });
  return out;
}

/** Speech = everything that is not silence, padded and with tiny gaps merged. */
export function speechRegionsFromSilences(
  silences: SpeechRegion[],
  totalSeconds: number,
  opts: { pad?: number; mergeGap?: number; minLen?: number } = {},
): SpeechRegion[] {
  const pad = opts.pad ?? SPEECH_PAD_SECONDS;
  const mergeGap = opts.mergeGap ?? SPEECH_MERGE_GAP_SECONDS;
  const minLen = opts.minLen ?? SPEECH_MIN_SECONDS;

  const sorted = silences.slice().sort((a, b) => a.start - b.start);
  const raw: SpeechRegion[] = [];
  let cursor = 0;
  for (const sil of sorted) {
    if (sil.start > cursor) raw.push({ start: cursor, end: sil.start });
    cursor = Math.max(cursor, sil.end);
  }
  if (cursor < totalSeconds) raw.push({ start: cursor, end: totalSeconds });

  const padded = raw
    .filter((r) => r.end - r.start >= minLen)
    .map((r) => ({
      start: Math.max(0, r.start - pad),
      end: Math.min(totalSeconds, r.end + pad),
    }));

  const merged: SpeechRegion[] = [];
  for (const r of padded) {
    const last = merged[merged.length - 1];
    if (last && r.start - last.end <= mergeGap) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  return merged;
}

export function buildPieces(regions: SpeechRegion[]): Piece[] {
  let comp = 0;
  return regions.map((r) => {
    const duration = r.end - r.start;
    const piece = { origStart: r.start, compStart: comp, duration };
    comp += duration;
    return piece;
  });
}

export function compressedDuration(pieces: Piece[]): number {
  const last = pieces[pieces.length - 1];
  return last ? last.compStart + last.duration : 0;
}

/** Map a time on the silence-stripped audio back to the original track time. */
export function mapCompressedTime(t: number, pieces: Piece[]): number {
  if (pieces.length === 0) return t;
  let hit = pieces[0];
  for (const p of pieces) {
    if (p.compStart <= t) hit = p;
    else break;
  }
  const within = Math.min(Math.max(0, t - hit.compStart), hit.duration);
  return hit.origStart + within;
}

// ─── Whisper output trust ─────────────────────────────────────────────────────

const normalize = (s: string): string =>
  s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

/** Three or more words, all taken from the hint: a partial echo of the prompt. */
function echoesHint(text: string, hint: string): boolean {
  const words = text.split(" ");
  if (words.length < 3) return false;
  const hintWords = new Set(hint.split(" "));
  return words.every((w) => hintWords.has(w));
}

/**
 * A long word said three or more times in one short segment is Whisper looping
 * on unclear speech ("tasleemat ke liye tasleemat ke liye tasleemat").
 */
export function hasRepetitionLoop(text: string): boolean {
  const words = text.split(" ").filter(Boolean);
  if (words.length < 6) return false;
  const counts = new Map<string, number>();
  for (const w of words) {
    if (w.length < 4) continue;
    const n = (counts.get(w) ?? 0) + 1;
    if (n >= 3) return true;
    counts.set(w, n);
  }
  return false;
}

/**
 * Whisper invents text on silence or noise ("Thank you.", the prompt echoed
 * back). Drop a segment when the model itself says it was probably not speech,
 * when it is a repetition loop, or when it just repeats the prompt hint.
 */
export function isLikelyHallucination(
  seg: WhisperSegment,
  hint: string,
): boolean {
  const text = normalize(seg.text);
  if (text.length === 0) return true;
  const h = normalize(hint);
  if (h && text.length >= 12 && (text.includes(h) || h.includes(text))) return true;
  if (h && echoesHint(text, h)) return true;
  if (hasRepetitionLoop(text)) return true;
  if (
    (seg.no_speech_prob ?? 0) > 0.6 &&
    (seg.avg_logprob ?? 0) < -1
  ) {
    return true;
  }
  if ((seg.compression_ratio ?? 0) > 2.4) return true;
  return false;
}

// ─── Retry policy for Groq ────────────────────────────────────────────────────

export const MAX_RETRY_WAIT_MS = 60_000;

export class WhisperHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterSeconds: number | null,
  ) {
    super(message);
    this.name = "WhisperHttpError";
  }
}

export function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const n = Number(header);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Retry rate limits and transient failures; never retry a bad request. */
export function shouldRetryWhisper(err: unknown): boolean {
  if (!(err instanceof WhisperHttpError)) return true; // network error
  if (err.status === 429) {
    // A long wait means an hourly quota is spent, not a burst limit.
    return (err.retryAfterSeconds ?? 0) * 1000 <= MAX_RETRY_WAIT_MS;
  }
  return err.status === 408 || err.status >= 500;
}

export function backoffDelayMs(attempt: number, err: unknown): number {
  const ra = err instanceof WhisperHttpError ? err.retryAfterSeconds : null;
  const ms = ra !== null ? ra * 1000 + 250 : 1000 * 2 ** attempt;
  return Math.min(ms, MAX_RETRY_WAIT_MS);
}

/** Plain-language reason for a failed track, shown on the recap. */
export function describeWhisperFailure(err: unknown): string {
  if (err instanceof WhisperHttpError && err.status === 429) {
    const mins = Math.max(
      1,
      Math.ceil((err.retryAfterSeconds ?? 60) / 60),
    );
    return `The free speech-to-text quota is used up. Try again in about ${mins} minute${mins === 1 ? "" : "s"}.`;
  }
  return "Speech-to-text failed for part of the meeting. Please try again.";
}

// ─── Small utilities ──────────────────────────────────────────────────────────

/** Run `fn` over `items` with at most `limit` in flight; keeps result order. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

/**
 * Every "Name:" label in the cleaned text must exist in the raw text. A cleanup
 * that invents or renames a speaker is rejected and the raw lines are kept.
 */
export function speakerLabelsPreserved(raw: string, cleaned: string): boolean {
  const labelOf = (line: string): string | null => {
    const i = line.indexOf(":");
    return i > 0 ? line.slice(0, i).trim() : null;
  };
  const rawLabels = new Set(
    raw.split("\n").map(labelOf).filter((l): l is string => !!l),
  );
  return cleaned
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .every((l) => {
      const label = labelOf(l);
      // A line without a label is a continuation; a labelled line must name a
      // speaker that exists in the raw text.
      return label === null || rawLabels.has(label);
    });
}

/** Split "Name: text" lines into batches no longer than `maxChars` each. */
export function batchTranscriptLines(raw: string, maxChars: number): string[] {
  const batches: string[] = [];
  let current: string[] = [];
  let size = 0;
  for (const line of raw.split("\n")) {
    if (size + line.length > maxChars && current.length > 0) {
      batches.push(current.join("\n"));
      current = [];
      size = 0;
    }
    current.push(line);
    size += line.length + 1;
  }
  if (current.length > 0) batches.push(current.join("\n"));
  return batches;
}

// ─── ffmpeg runners ───────────────────────────────────────────────────────────

const FFMPEG = ffmpegStatic ?? "ffmpeg";

function runFfmpeg(args: string[]): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stderr = "";
    const proc = spawn(FFMPEG, args);
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => resolve({ code, stderr }));
  });
}

/** Media duration in seconds via `ffmpeg -i` (no ffprobe needed). 0 if unknown. */
export async function probeDurationSeconds(filePath: string): Promise<number> {
  try {
    const { stderr } = await runFfmpeg(["-i", filePath]);
    const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (!m) return 0;
    return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  } catch {
    return 0;
  }
}

export type SpeechAudio = { path: string; pieces: Piece[] };

/**
 * Cut the silence out of `inPath` and return the shortened audio plus the map
 * back to real time. Returns null when the track holds no speech at all. When
 * detection fails, or little would be saved, the original file is returned with
 * an identity map so transcription still works.
 */
export async function extractSpeechAudio(
  inPath: string,
  workDir: string,
): Promise<SpeechAudio | null> {
  const total = await probeDurationSeconds(inPath);
  const identity: SpeechAudio = {
    path: inPath,
    pieces: total > 0 ? [{ origStart: 0, compStart: 0, duration: total }] : [],
  };
  if (total <= 0) return identity;

  let silences: SpeechRegion[];
  try {
    const { stderr } = await runFfmpeg([
      "-i",
      inPath,
      "-af",
      `silencedetect=noise=${SILENCE_NOISE_DB}dB:d=${SILENCE_MIN_SECONDS}`,
      "-f",
      "null",
      "-",
    ]);
    silences = parseSilenceIntervals(stderr, total);
  } catch (err) {
    console.error("[transcript-speech] silencedetect failed:", err);
    return identity;
  }

  let regions = speechRegionsFromSilences(silences, total);
  for (let gap = 4; regions.length > MAX_REGIONS && gap <= 32; gap *= 2) {
    regions = speechRegionsFromSilences(silences, total, { mergeGap: gap });
  }
  if (regions.length === 0) return null;

  const pieces = buildPieces(regions);
  // Not worth re-encoding when almost nothing would be removed.
  if (compressedDuration(pieces) >= total * 0.95) return identity;

  const script =
    regions
      .map(
        (r, i) =>
          `[0:a]atrim=start=${r.start.toFixed(3)}:end=${r.end.toFixed(3)},asetpts=PTS-STARTPTS[a${i}];`,
      )
      .join("\n") +
    `\n${regions.map((_, i) => `[a${i}]`).join("")}concat=n=${regions.length}:v=0:a=1[out]`;
  const scriptPath = join(workDir, "speech.filter");
  const outPath = join(workDir, "speech.flac");
  try {
    await writeFile(scriptPath, script);
    const { code, stderr } = await runFfmpeg([
      "-y",
      "-i",
      inPath,
      "-filter_complex_script",
      scriptPath,
      "-map",
      "[out]",
      "-ar",
      "16000",
      "-ac",
      "1",
      outPath,
    ]);
    if (code !== 0) {
      console.error("[transcript-speech] speech cut failed:", stderr.slice(-300));
      return identity;
    }
    return { path: outPath, pieces };
  } catch (err) {
    console.error("[transcript-speech] speech cut failed:", err);
    return identity;
  }
}
