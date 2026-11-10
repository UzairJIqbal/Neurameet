import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { StreamClient } from "@stream-io/node-sdk";
import { supabaseServer } from "@/lib/supabase-server";
import { generateStructuredWithFallback } from "@/agent/models";
import { z } from "zod";
import {
  WhisperHttpError,
  backoffDelayMs,
  batchTranscriptLines,
  describeWhisperFailure,
  extractSpeechAudio,
  isLikelyHallucination,
  mapCompressedTime,
  mapWithConcurrency,
  parseRetryAfter,
  probeDurationSeconds,
  shouldRetryWhisper,
  speakerLabelsPreserved,
  type Piece,
  type WhisperSegment,
} from "@/agent/transcript-speech";

export type { WhisperSegment };

// Server-only transcript generation from Stream per-participant recordings.
// Individual recordings arrive as `.mkv` (audio+video); Groq Whisper does not
// accept mkv, so we extract 16kHz mono audio and segment it with a native
// ffmpeg binary (bundled by ffmpeg-static, runs in the Node runtime), then
// transcribe each chunk via Groq Whisper (EN/UR auto-detect). All AI and
// secret handling stays server-side (security invariant). Groq is the SOLE
// speech-to-text provider — no fallback.
//
// NOTE: @ffmpeg/ffmpeg (the wasm wrapper) is browser-only and throws in Node,
// so it cannot run in this API route. ffmpeg-static provides a real binary
// that works both locally and on Vercel (bundled into the function).
if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);

const GROQ_TRANSCRIBE_URL =
  "https://api.groq.com/openai/v1/audio/transcriptions";
// large-v3 (10.3% WER) is more accurate than turbo (12%) for Urdu and mixed
// speech and shares the same free-tier limits. Flip back here if needed.
const WHISPER_MODEL = "whisper-large-v3";
const WHISPER_MAX_ATTEMPTS = 4;
// Tracks transcribed at once. Groq free tier is 20 requests/min.
const TRACK_CONCURRENCY = 2;
// Stop starting new work after this long so the route can still answer before
// its maxDuration kills it (route maxDuration is 300 s).
const GENERATION_BUDGET_MS = 250_000;
// Cleanup batches: keeps every model output well under its token limit.
const CLEANUP_BATCH_CHARS = 6_000;
// Groq Whisper `prompt` (max 224 tokens) biases the spelling of domain proper
// nouns Whisper otherwise mishears (e.g. "Neurameet" → "Neuromade",
// "Urdu" → "Urtah"). Sent on every chunk (each chunk is a separate Whisper
// call, so every chunk gets the bias). Kept well under the 224-token cap.
export const WHISPER_DOMAIN_HINT =
  "This is a meeting about Neurameet, an AI meeting platform, discussed in English and Urdu. Spell 'Neurameet' and 'Urdu' correctly.";
const SEGMENT_SECONDS = 600; // 10 min chunks (~19 MB FLAC, under 25 MB cap)
// Each chunk (except the first) is extracted with OVERLAP_SECONDS of tail from
// the previous chunk so a word split across the 10-min boundary is kept whole
// (Bug 3). The merge step drops each chunk's leading OVERLAP_SECONDS, which is
// the duplicate of the prior chunk, so no word is lost or doubled.
const OVERLAP_SECONDS = 5;

// ─── F8: Transcript Cleanup Pass ──────────────────────────────────────────────
// A light AI accuracy clean (word-level correction + same-speaker line merge) of
// the merged "SpeakerName: text" transcript, run automatically as the last stage
// of generation. Reuses the existing Gemini→Groq fallback text-generation infra
// (generateStructuredWithFallback). Graceful by design: any failure (or a
// suspiciously short result) returns the RAW transcript so the download is never
// blocked — cleanup is a nice-to-have enhancement, not a blocking dependency.
const CLEANUP_MIN_RATIO = 0.6;

const cleanupSchema = z.object({
  cleanedTranscript: z
    .string()
    .describe(
      "The complete transcript, translated into English if needed and cleaned, preserving every 'SpeakerName: text' line, same speakers and order.",
    ),
});

export function buildCleanupPrompt(raw: string): string {
  return `You are a transcript cleanup editor. You are given a meeting transcript where every line is formatted as "SpeakerName: text". Apply ONLY a light accuracy pass.

Rules:
0. TRANSLATION (do this FIRST, before any cleaning): Look at the text of EVERY line. If a line's text is NOT written in English — including but not limited to Devanagari/Hindi script (e.g. "अज़ का मेरा"), Arabic-script Urdu (e.g. "ميرا نام"), or any non-Latin script — you MUST translate it into natural, fluent English. "Cleaning" a line does NOT mean keeping its original script; a line left in Devanagari or Arabic is a failure. The ONLY part you never translate is the speaker label (the text BEFORE the first colon). Preserve every "SpeakerName: text" line and the original chronological order. A line that is already English is kept as-is. Do not summarize while translating. Your final output MUST be entirely in English.
1. Word-level correction: fix garbled, misheard, or dropped words caused by microphone or poor audio. Do not change the meaning.
2. Line-level reconstruction: merge consecutive lines from the SAME speaker into a single "SpeakerName: text" line whenever they are part of ONE continuous speech turn. This includes a long monologue that Whisper split into several sentences or clauses, OR a microphone glitch that broke one thought across lines. Join the fragments with a single space. ONLY merge consecutive lines from the SAME speaker. NEVER merge across different speakers. Do NOT merge if the consecutive same-speaker lines are clearly separate, unrelated utterances spoken at different times.
3. Remove a line ONLY if it is genuinely meaningless noise (for example a stray cough, dead-air caption, or a fragment with no reconstructable content). Do NOT fabricate words for broken lines — if a fragment has no reconstructable meaning, drop it; never invent speech that was not said.
4. NEVER summarize. NEVER remove real content. NEVER alter speaker names or labels. Keep the exact "SpeakerName: text" format, the original chronological order, and the speaker sequence.
5. Output the COMPLETE cleaned transcript in English. Do not omit any speaker or any real line. Preserve every real word.

Return the cleaned transcript in the cleanedTranscript field.

Transcript:
${raw}`;
}

// A stricter, translation-only prompt used as a SECOND attempt when the first
// cleanup pass returned text that is still (mostly) in a non-English script
// (e.g. Devanagari/Hindi or Arabic — the failure mode seen in live bilingual
// meetings). It drops the cleaning/merging framing entirely so the model
// cannot mistake "clean" for "keep the original script", and demands English.
export function buildTranslateOnlyPrompt(raw: string): string {
  return `You are a translator. The meeting transcript below has every line
formatted as "SpeakerName: text". The text of some or all lines is in a
non-English script (Devanagari/Hindi, Arabic/Urdu, etc.).

Translate the text of EVERY line into natural, fluent English. Keep the exact
"SpeakerName: text" format and the original order. NEVER translate the speaker
name (the text before the first colon). Output ONLY English — if you leave any
Devanagari or Arabic characters in the result, you have failed.

Return the fully English transcript in the cleanedTranscript field.

Transcript:
${raw}`;
}

// Pure, unit-tested heuristic: is the text still (mostly) in a non-English
// script? Counts letter code points beyond the Latin ranges (Latin-1
// supplement through Latin Extended-B, 0x00C0..0x024F) as "non-Latin". Names
// like "Uzair Javaid Iqbal" stay Latin; Devanagari/Arabic do not. If more than
// `threshold` of the letters are non-Latin, treat the whole transcript as
// untranslated. Used to detect when the cleanup model "cleaned" but did not
// translate (Devanagari -> Devanagari preserves length, so the length guard
// cannot catch it).
export function isMostlyNonEnglish(
  text: string,
  threshold = 0.2,
): boolean {
  let letters = 0;
  let nonLatin = 0;
  for (const ch of text) {
    if (!/\p{L}/u.test(ch)) continue;
    letters += 1;
    const code = ch.codePointAt(0) ?? 0;
    if (code > 0x024f) nonLatin += 1;
  }
  if (letters === 0) return false;
  return nonLatin / letters > threshold;
}

// Pure guard (unit-tested): accept the cleaned transcript only if it has not
// shrunk past CLEANUP_MIN_RATIO of the raw length. A large shrink means the AI
// truncated its output or over-summarized (forbidden), so fall back to raw.
export function fallbackToRawIfTooShort(
  cleaned: string,
  raw: string,
  minRatio: number = CLEANUP_MIN_RATIO,
): string {
  return cleaned.length >= minRatio * raw.length ? cleaned : raw;
}

// Cleanup rewrites the whole transcript, so Gemini needs longer than the
// default primary limit on long meetings.
const CLEANUP_PRIMARY_TIMEOUT_MS = 90_000;

/**
 * Clean in line-batches so a long meeting never hits the model's output limit.
 * Each batch keeps its raw lines when the cleanup fails, shrinks too far, or
 * renames/invents a speaker label.
 */
export async function cleanupTranscript(raw: string): Promise<string> {
  const batches = batchTranscriptLines(raw, CLEANUP_BATCH_CHARS);
  const out: string[] = [];
  for (const batch of batches) {
    const cleaned = await cleanupBatch(batch);
    out.push(speakerLabelsPreserved(batch, cleaned) ? cleaned : batch);
  }
  return out.join("\n");
}

async function cleanupBatch(raw: string): Promise<string> {
  try {
    const { object } = await generateStructuredWithFallback({
      schema: cleanupSchema,
      prompt: buildCleanupPrompt(raw),
      primaryTimeoutMs: CLEANUP_PRIMARY_TIMEOUT_MS,
    });

    const cleaned = object.cleanedTranscript?.trim() ?? "";
    if (!cleaned) {
      console.error(
        "[transcript-generation] cleanup returned empty result, falling back to raw",
      );
      return raw;
    }

    // PRIMARY PASS: if the model "cleaned" but left the text in a non-English
    // script (Devanagari/Hindi, Arabic/Urdu), the length guard cannot catch it
    // (Devanagari -> Devanagari preserves length). Detect it explicitly and
    // retry with a translate-only prompt before giving up.
    if (isMostlyNonEnglish(cleaned)) {
      console.warn(
        "[transcript-generation] cleanup pass 1 output still non-English, " +
          "retrying with translate-only prompt",
      );
      const retry = await generateStructuredWithFallback({
        schema: cleanupSchema,
        prompt: buildTranslateOnlyPrompt(raw),
        primaryTimeoutMs: CLEANUP_PRIMARY_TIMEOUT_MS,
      });
      const cleanedRetry = retry.object.cleanedTranscript?.trim() ?? "";
      if (cleanedRetry && !isMostlyNonEnglish(cleanedRetry)) {
        console.log(
          "[transcript-generation] cleanup pass 2 produced English transcript",
        );
        return fallbackToRawIfTooShort(cleanedRetry, raw);
      }
      // Still non-English after retry: ship raw (also untranslated) but LOG it
      // loudly so the degradation is visible rather than silent.
      console.error(
        "[transcript-generation] cleanup still non-English after retry, " +
          "falling back to raw (untranslated)",
      );
      return raw;
    }

    console.log(
      "[transcript-generation] cleanup pass 1 produced English transcript",
    );
    return fallbackToRawIfTooShort(cleaned, raw);
  } catch (err) {
    console.error(
      "[transcript-generation] cleanup pass failed, returning raw:",
      err,
    );
    return raw;
  }
}

export type GenerateResult =
  | {
      status: "ok";
      transcript: string;
      // Merged Whisper text before the AI cleanup pass (kept for comparison).
      rawTranscript?: string;
      language?: string;
    }
  | { status: "too_short" }
  | { status: "no_recording"; message: string }
  | { status: "failed"; message: string };

type Segment = { speaker: string; start: number; text: string };

type Recording = {
  recording_type?: string;
  url?: string;
  file_url?: string;
  video_url?: string;
  filename?: string;
  // Absolute start time of THIS participant's individual recording (Date or ISO
  // string as returned by Stream's CallRecording). Used as the per-track epoch so
  // segments from participants who joined at different times share one timeline.
  start_time?: string | Date;
};

export function parseStreamUserId(filename?: string): string | null {
  if (!filename) return null;
  // The filename is `..._user_<userId>_<uuid>_audio_only_<ts>.mkv`. The user id
  // sits between `user_` and the NEXT underscore (which precedes the uuid). Use
  // `[^_]+` so the capture stops at that first underscore; the previous pattern
  // `[A-Za-z0-9_-]+` was greedy and swallowed the uuid + `_audio_only` suffix,
  // producing a malformed id that never matched attendance (Bug 1 regression).
  const m = filename.match(/user_([^_]+)_/);
  return m ? m[1] : null;
}

// Normalize a Stream/Clerk user id to its bare form by stripping a leading
// "user_" prefix (case-insensitive). This lets the 8-char id Stream embeds in
// the recording filename (e.g. "3I0VWn5w") match the full Clerk id stored on
// attendance_events ("user_3I0VWn5w68jOhidJLKc2AJ5QqLe").
export function normUserId(id: string | null | undefined): string {
  return (id ?? "").replace(/^user_/i, "").toLowerCase();
}

// Collapse accidentally duplicated adjacent name tokens so the transcript
// speaker label reads cleanly. The implementation lives in `lib/speaker-name`
// so the client attendance hook can use it without importing server-only
// modules; we import and re-export it here to keep the existing agent-side
// import path (and to use it inside this module's own name resolution).
import { normalizeSpeakerName } from "@/lib/speaker-name";
export { normalizeSpeakerName };

// ─── F-merge: chronological interleave across participants ──────────────────────
// Each participant's individual recording starts when THEY joined, but Whisper
// reports every segment's `start` relative to that track's own audio (so every
// track effectively begins at 0). If we merge raw relative times, two
// participants who spoke near their own t=0 sort by recording-array order, not
// by true speaking time — so a participant who joined later can land first.
// These pure helpers fix that: shift each track by its absolute recording start
// (epoch seconds), then sort once on the shared timeline.

// Convert a recording's absolute start_time (Date or ISO string from Stream's
// CallRecording) into epoch SECONDS. Returns 0 when absent so single-participant
// / missing-metadata meetings keep today's behavior unchanged.
export function epochSecondsFromRecordingStart(
  start?: string | Date,
): number {
  if (!start) return 0;
  const ms = start instanceof Date ? start.getTime() : Date.parse(start);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

// Shift every segment on a track by that track's absolute recording start so all
// tracks share one timeline before the final merge.
export function offsetSegments(
  segments: Segment[],
  epochStartSec: number,
): Segment[] {
  return segments.map((s) => ({ ...s, start: s.start + epochStartSec }));
}

// Sort all segments by (absolute) start and render the merged
// "SpeakerName: text" transcript. Extracted from generateTranscriptForMeeting so
// the chronological merge is unit-testable without real recordings.
export function mergeSegmentsToTranscript(segments: Segment[]): string {
  return segments
    .slice()
    .sort((a, b) => a.start - b.start)
    .map((s) => `${s.speaker}: ${s.text}`)
    .join("\n");
}

// Bug 3 dedup (pure, unit-tested): chunk i covers [i*S, (i+1)*S + overlap], so
// the first OVERLAP_SECONDS of chunk i+1 is also the tail of chunk i. Each side
// keeps the segments it owns so no speech is lost across the seam:
//   - chunk i >= 1 drops only segments that END inside the overlap (fully heard
//     by the previous chunk); a segment that starts in the overlap but runs on
//     past it is kept.
//   - a non-last chunk drops segments that START at or after `tailCutSeconds`
//     (its own segment length), since the next chunk transcribes them in full.
// Only applied to REAL Whisper segments: the single-segment fallback for an
// unsegmented result (one segment spanning the chunk, start 0) is kept whole.
export function filterBoundarySegments(
  segments: WhisperSegment[],
  chunkIndex: number,
  overlapSeconds: number,
  hasSegments: boolean,
  tailCutSeconds?: number,
): WhisperSegment[] {
  if (!hasSegments) return segments;
  return segments.filter(
    (s) =>
      (chunkIndex === 0 || s.end > overlapSeconds) &&
      (tailCutSeconds === undefined || s.start < tailCutSeconds),
  );
}

async function resolveSpeakerName(
  meetingId: string,
  streamUserId: string,
  client: StreamClient,
  callType: string,
  callId: string,
): Promise<string> {
  const recNorm = normUserId(streamUserId);
  // Bug 1 fix: the recording filename embeds only the first 8 chars of the
  // participant's Clerk id, while attendance_events.stream_user_id stores the
  // full id. Strict equality fails, so match by exact or prefix after stripping
  // the "user_" prefix. Fallback below covers rows where stream_user_id is null.
  try {
    const supabase = supabaseServer();
    const { data } = await supabase
      .from("attendance_events")
      .select("stream_user_id, participant_name, participant_email")
      .eq("meeting_id", meetingId);
    const row = (data ?? []).find((r) => {
      const s = normUserId(r.stream_user_id);
      return s === recNorm || (recNorm.length > 0 && s.startsWith(recNorm));
    });
    if (row?.participant_name) return normalizeSpeakerName(row.participant_name);
    if (row?.participant_email) return normalizeSpeakerName(row.participant_email);
  } catch {
    // fall through to the Stream member lookup
  }

  // Second resort: ask Stream for the call's members and match the recording's
  // id (short/prefix form) to a member's full id.
  try {
    const { members } = await client.video
      .call(callType, callId)
      .queryMembers({});
    const member = members.find((m) => {
      const s = normUserId(m.user_id);
      return s === recNorm || (recNorm.length > 0 && s.startsWith(recNorm));
    });
    const name = member?.user?.name;
    if (name) return normalizeSpeakerName(name);
  } catch {
    // fall through to the id-based fallback
  }

  return `Speaker ${(streamUserId ?? "").slice(0, 8)}`;
}

type WhisperResponse = {
  text: string;
  language?: string;
  segments?: WhisperSegment[];
};

async function transcribeChunk(
  chunk: Uint8Array,
  index: number,
  language?: string,
): Promise<WhisperResponse> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set");

  const form = new FormData();
  form.append(
    "file",
    new Blob([chunk as BlobPart], { type: "audio/flac" }),
    `chunk-${index}.flac`,
  );
  form.append("model", WHISPER_MODEL);
  form.append("response_format", "verbose_json");
  // F9: do NOT force a language (auto-detect keeps Urdu as Urdu; the cleanup
  // pass translates). An explicit hint still wins.
  if (language && language.trim()) {
    form.append("language", language.trim());
  }
  // NOTE: Groq's Whisper API does NOT accept `timestamp_granularities`
  // (400 "unknown param"). verbose_json already returns per-segment times.
  // The spelling hint goes on the FIRST chunk only: on later chunks (and on
  // silence) Whisper tends to echo the prompt back as if it were speech.
  if (index === 0) form.append("prompt", WHISPER_DOMAIN_HINT);

  const res = await fetch(GROQ_TRANSCRIBE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new WhisperHttpError(
      `Groq Whisper failed (${res.status}): ${errText.slice(0, 200)}`,
      res.status,
      parseRetryAfter(res.headers.get("retry-after")),
    );
  }
  return (await res.json()) as WhisperResponse;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function transcribeWithRetry(
  chunk: Uint8Array,
  index: number,
  language?: string,
): Promise<WhisperResponse> {
  let lastErr: unknown;
  // Groq is the sole provider: back off (honouring retry-after on 429), then
  // fail gracefully (no fallback).
  for (let attempt = 0; attempt < WHISPER_MAX_ATTEMPTS; attempt++) {
    try {
      return await transcribeChunk(chunk, index, language);
    } catch (err) {
      lastErr = err;
      if (!shouldRetryWhisper(err) || attempt === WHISPER_MAX_ATTEMPTS - 1) break;
      await sleep(backoffDelayMs(attempt, err));
    }
  }
  throw lastErr;
}

type PreparedAudio = { chunks: Uint8Array[]; pieces: Piece[] };

/**
 * Convert a downloaded recording (mkv) to 16kHz mono FLAC, cut the silence out
 * (saves the Groq hourly audio quota and removes what Whisper hallucinates on),
 * then split into SEGMENT_SECONDS chunks that overlap by OVERLAP_SECONDS. The
 * returned `pieces` map times on the shortened audio back to the real track
 * time. Returns no chunks when the track holds no speech.
 */
async function prepareAudio(
  inputBuf: Uint8Array,
  segmentSeconds: number,
): Promise<PreparedAudio> {
  const workDir = join(tmpdir(), `nm-transcript-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });
  const inPath = join(workDir, "in.mkv");
  const fullPath = join(workDir, "full.flac");

  try {
    await writeFile(inPath, inputBuf);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inPath)
        .outputOptions(["-vn", "-ar", "16000", "-ac", "1"])
        .output(fullPath)
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .run();
    });

    const speech = await extractSpeechAudio(fullPath, workDir);
    if (!speech) return { chunks: [], pieces: [] };

    const duration = await probeDurationSeconds(speech.path);
    const numChunks =
      duration > 0 ? Math.max(1, Math.ceil(duration / segmentSeconds)) : 1;

    const chunks: Uint8Array[] = [];
    for (let i = 0; i < numChunks; i++) {
      const start = i * segmentSeconds;
      const isLast = i === numChunks - 1;
      const outName = join(workDir, `out_${String(i).padStart(3, "0")}.flac`);
      await new Promise<void>((resolve, reject) => {
        const cmd = ffmpeg(speech.path)
          .inputOptions(["-ss", String(start)])
          .outputOptions(["-ar", "16000", "-ac", "1"])
          .output(outName);
        if (!isLast) cmd.outputOptions(["-t", String(segmentSeconds + OVERLAP_SECONDS)]);
        cmd
          .on("end", () => resolve())
          .on("error", (err) => reject(err))
          .run();
      });
      if (!existsSync(outName)) continue;
      chunks.push(new Uint8Array(await readFile(outName)));
    }
    return { chunks, pieces: speech.pieces };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

type TrackOutcome =
  | { kind: "ok"; segments: Segment[] }
  | { kind: "silent" }
  | { kind: "error"; reason: string };

async function processTrack(
  downloadUrl: string,
  speaker: string,
  meetingId: string,
  streamUserId: string | null,
  client: StreamClient,
  callType: string,
  callId: string,
  language?: string,
): Promise<TrackOutcome> {
  try {
    const res = await fetch(downloadUrl);
    if (!res.ok) {
      return { kind: "error", reason: "A recording could not be downloaded." };
    }
    const inputBuf = new Uint8Array(await res.arrayBuffer());
    if (inputBuf.byteLength === 0) return { kind: "silent" };

    const displayName = streamUserId
      ? await resolveSpeakerName(meetingId, streamUserId, client, callType, callId)
      : speaker;

    let prepared: PreparedAudio;
    try {
      prepared = await prepareAudio(inputBuf, SEGMENT_SECONDS);
    } catch (err) {
      console.error("[transcript-generation] ffmpeg conversion failed:", err);
      return { kind: "error", reason: "A recording could not be converted." };
    }
    if (prepared.chunks.length === 0) return { kind: "silent" };

    // Chunks run one after another: parallel chunks are what trips Groq's
    // per-minute limit.
    const segments: Segment[] = [];
    for (let i = 0; i < prepared.chunks.length; i++) {
      const result = await transcribeWithRetry(prepared.chunks[i], i, language);
      const offset = i * SEGMENT_SECONDS;
      const rawSegments = result.segments;
      const hasSegments = !!rawSegments && rawSegments.length > 0;
      const segs: WhisperSegment[] = hasSegments
        ? rawSegments
        : [{ start: 0, end: 0, text: result.text }];
      const isLast = i === prepared.chunks.length - 1;
      const filtered = filterBoundarySegments(
        segs,
        i,
        OVERLAP_SECONDS,
        hasSegments,
        isLast ? undefined : SEGMENT_SECONDS,
      ).filter((s) => !isLikelyHallucination(s, WHISPER_DOMAIN_HINT));
      for (const s of filtered) {
        segments.push({
          speaker: displayName,
          // Whisper time is on the silence-stripped audio; map it back.
          start: mapCompressedTime(offset + s.start, prepared.pieces),
          text: s.text.trim(),
        });
      }
    }

    // Silent / empty track: no speech extracted. Skip without failing the run.
    return segments.length > 0 ? { kind: "ok", segments } : { kind: "silent" };
  } catch (err) {
    console.error("[transcript-generation] track failed:", err);
    return { kind: "error", reason: describeWhisperFailure(err) };
  }
}

export async function generateTranscriptForMeeting({
  userId,
  meetingId,
  streamCallId,
  streamCallType,
  enforceOwner = true,
  language,
}: {
  userId: string;
  meetingId: string;
  streamCallId: string;
  streamCallType: string;
  /**
   * Owner enforcement. The recap page lets ANY signed in participant download
   * a local .txt transcript, so its path passes `false` and skips the check.
   * The owner only full pipeline keeps the default `true`.
   */
  enforceOwner?: boolean;
  /**
   * Bug 2: optional ISO-639-1 language hint (e.g. "ur", "en") forced onto the
   * Whisper call. Undefined = auto-detect (current behavior).
   */
  language?: string;
}): Promise<GenerateResult> {
  const supabase = supabaseServer();

  // Ownership check (D3.4 / B recordings gating). Skipped for the participant
  // download path, which is intentionally open to every signed in participant.
  if (enforceOwner) {
    const { data: meeting, error: meetingErr } = await supabase
      .from("meetings")
      .select("user_id")
      .eq("id", meetingId)
      .single();
    if (meetingErr || !meeting) {
      return { status: "failed", message: "Meeting not found" };
    }
    if (meeting.user_id !== userId) {
      return {
        status: "failed",
        message: "Not authorized to generate this transcript",
      };
    }
  }

  const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
  const secret = process.env.STREAM_SECRET_KEY;
  if (!apiKey || !secret) {
    return { status: "failed", message: "Stream credentials are missing" };
  }

  const client = new StreamClient(apiKey, secret);
  const recRes = await client.video.listRecordings({
    type: streamCallType,
    id: streamCallId,
  });
  const recordings = (recRes?.recordings || []) as Recording[];
  const individuals = recordings.filter(
    (r) =>
      r.recording_type === "individual" && (r.url || r.file_url || r.video_url),
  );
  if (individuals.length === 0) {
    // Stream has not finalized individual recordings yet (common right after a
    // call ends — finalization takes minutes). This is retryable, NOT a hard
    // failure, so the client can poll and retry rather than showing a dead end.
    return {
      status: "no_recording",
      message:
        "Recordings are still being processed by Stream. Try again in a minute.",
    };
  }

  try {
    const deadline = Date.now() + GENERATION_BUDGET_MS;

    const outcomes = await mapWithConcurrency(
      individuals,
      TRACK_CONCURRENCY,
      async (rec): Promise<{ rec: Recording; outcome: TrackOutcome }> => {
        if (Date.now() > deadline) {
          return {
            rec,
            outcome: {
              kind: "error",
              reason: "The meeting is long, so it ran out of time. Please try again.",
            },
          };
        }
        const streamUserId = parseStreamUserId(rec.filename);
        const downloadUrl = (rec.url || rec.file_url || rec.video_url) as string;
        const outcome = await processTrack(
          downloadUrl,
          "Speaker",
          meetingId,
          streamUserId,
          client,
          streamCallType,
          streamCallId,
          language,
        );
        return { rec, outcome };
      },
    );

    const allSegments: Segment[] = [];
    const errors: string[] = [];
    for (const { rec, outcome } of outcomes) {
      if (outcome.kind === "error") {
        errors.push(outcome.reason);
      } else if (outcome.kind === "ok") {
        // F-merge: shift this track's segments by its own recording start so a
        // participant who joined later is placed at their true speaking time.
        allSegments.push(
          ...offsetSegments(
            outcome.segments,
            epochSecondsFromRecordingStart(rec.start_time),
          ),
        );
      }
    }

    // Never hand back a silently partial transcript: one failed track means a
    // participant is missing, so report it and let the user retry.
    if (errors.length > 0) {
      return { status: "failed", message: errors[0] };
    }
    // No speech anywhere → too short / silent meeting.
    if (allSegments.length === 0) return { status: "too_short" };

    // F-merge: segments already carry their absolute (epoch-offset) start, so a
    // single chronological sort yields true speaking order across participants.
    const rawTranscript = mergeSegmentsToTranscript(allSegments);

    // F8 + F9: AI accuracy clean and translation into English, in batches.
    // Graceful: any failure returns the raw lines so the download never blocks.
    const transcript = await cleanupTranscript(rawTranscript);

    return { status: "ok", transcript, rawTranscript, language: "en" };
  } catch (err) {
    console.error("[transcript-generation] fatal:", err);
    return {
      status: "failed",
      message: "Transcript generation failed, try manual upload",
    };
  }
}
