// @vitest-environment node
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import {
  WhisperHttpError,
  backoffDelayMs,
  batchTranscriptLines,
  buildPieces,
  compressedDuration,
  describeWhisperFailure,
  extractSpeechAudio,
  isLikelyHallucination,
  mapCompressedTime,
  mapWithConcurrency,
  parseRetryAfter,
  parseSilenceIntervals,
  probeDurationSeconds,
  shouldRetryWhisper,
  speakerLabelsPreserved,
  speechRegionsFromSilences,
} from "./transcript-speech";

describe("silence parsing and speech regions", () => {
  const stderr = [
    "[silencedetect @ 0x1] silence_start: 0",
    "[silencedetect @ 0x1] silence_end: 5.0 | silence_duration: 5.0",
    "[silencedetect @ 0x1] silence_start: 8.5",
    "[silencedetect @ 0x1] silence_end: 20.0 | silence_duration: 11.5",
    "[silencedetect @ 0x1] silence_start: 24",
  ].join("\n");

  it("parses closed and trailing open silences", () => {
    expect(parseSilenceIntervals(stderr, 30)).toEqual([
      { start: 0, end: 5 },
      { start: 8.5, end: 20 },
      { start: 24, end: 30 },
    ]);
  });

  it("derives padded speech regions between silences", () => {
    const regions = speechRegionsFromSilences(
      parseSilenceIntervals(stderr, 30),
      30,
      { pad: 0.5 },
    );
    expect(regions).toEqual([
      { start: 4.5, end: 9 },
      { start: 19.5, end: 24.5 },
    ]);
  });

  it("returns no regions for an all-silent track", () => {
    expect(speechRegionsFromSilences([{ start: 0, end: 30 }], 30)).toEqual([]);
  });

  it("merges regions separated by a short gap", () => {
    const regions = speechRegionsFromSilences(
      [{ start: 5, end: 6 }],
      10,
      { pad: 0, mergeGap: 2 },
    );
    expect(regions).toEqual([{ start: 0, end: 10 }]);
  });
});

describe("time mapping", () => {
  const pieces = buildPieces([
    { start: 10, end: 20 },
    { start: 100, end: 130 },
  ]);

  it("lays pieces back to back", () => {
    expect(compressedDuration(pieces)).toBe(40);
  });

  it("maps compressed time back to the original timeline", () => {
    expect(mapCompressedTime(0, pieces)).toBe(10);
    expect(mapCompressedTime(5, pieces)).toBe(15);
    expect(mapCompressedTime(10, pieces)).toBe(100);
    expect(mapCompressedTime(25, pieces)).toBe(115);
  });

  it("clamps past the end and passes through with no pieces", () => {
    expect(mapCompressedTime(999, pieces)).toBe(130);
    expect(mapCompressedTime(7, [])).toBe(7);
  });
});

describe("isLikelyHallucination", () => {
  const hint = "This is a meeting about Neurameet, an AI meeting platform.";
  it("drops empty text and an echoed prompt", () => {
    expect(isLikelyHallucination({ start: 0, end: 1, text: "  " }, hint)).toBe(true);
    expect(
      isLikelyHallucination(
        { start: 0, end: 4, text: "This is a meeting about Neurameet, an AI meeting platform." },
        hint,
      ),
    ).toBe(true);
  });
  it("drops likely non-speech and repetition loops", () => {
    expect(
      isLikelyHallucination(
        { start: 0, end: 1, text: "Thank you.", no_speech_prob: 0.9, avg_logprob: -1.4 },
        hint,
      ),
    ).toBe(true);
    expect(
      isLikelyHallucination(
        { start: 0, end: 1, text: "la la la la", compression_ratio: 3 },
        hint,
      ),
    ).toBe(true);
  });
  it("keeps normal speech, including a confident short reply", () => {
    expect(
      isLikelyHallucination(
        { start: 0, end: 2, text: "Yes, I agree.", no_speech_prob: 0.05, avg_logprob: -0.3, compression_ratio: 1.2 },
        hint,
      ),
    ).toBe(false);
    expect(
      isLikelyHallucination(
        { start: 0, end: 2, text: "Thank you.", no_speech_prob: 0.9, avg_logprob: -0.2 },
        hint,
      ),
    ).toBe(false);
  });
});

describe("Groq retry policy", () => {
  it("reads retry-after", () => {
    expect(parseRetryAfter("12")).toBe(12);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("soon")).toBeNull();
  });
  it("retries bursts and server errors, not bad requests or spent quotas", () => {
    expect(shouldRetryWhisper(new WhisperHttpError("x", 429, 5))).toBe(true);
    expect(shouldRetryWhisper(new WhisperHttpError("x", 503, null))).toBe(true);
    expect(shouldRetryWhisper(new WhisperHttpError("x", 400, null))).toBe(false);
    expect(shouldRetryWhisper(new WhisperHttpError("x", 429, 1800))).toBe(false);
    expect(shouldRetryWhisper(new Error("network"))).toBe(true);
  });
  it("honours retry-after and otherwise backs off exponentially", () => {
    expect(backoffDelayMs(0, new WhisperHttpError("x", 429, 7))).toBe(7250);
    expect(backoffDelayMs(0, new Error("n"))).toBe(1000);
    expect(backoffDelayMs(2, new Error("n"))).toBe(4000);
  });
  it("explains a spent quota in plain words", () => {
    expect(describeWhisperFailure(new WhisperHttpError("x", 429, 1500))).toMatch(
      /quota.*25 minutes/,
    );
    expect(describeWhisperFailure(new Error("x"))).toMatch(/try again/i);
  });
});

describe("mapWithConcurrency", () => {
  it("keeps order and never exceeds the limit", async () => {
    let active = 0;
    let peak = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10]);
    expect(peak).toBe(2);
  });
});

describe("cleanup safety helpers", () => {
  it("accepts cleaned text that only uses raw speaker labels", () => {
    expect(speakerLabelsPreserved("A: hi\nB: yo", "A: hi there\nB: yo")).toBe(true);
  });
  it("rejects an invented or renamed speaker", () => {
    expect(speakerLabelsPreserved("A: hi\nB: yo", "A: hi\nC: yo")).toBe(false);
  });
  it("batches by size without splitting a line", () => {
    const raw = ["A: aaaa", "B: bbbb", "A: cccc"].join("\n");
    const batches = batchTranscriptLines(raw, 10);
    expect(batches.join("\n")).toBe(raw);
    expect(batches.length).toBe(3);
    expect(batchTranscriptLines(raw, 1000)).toEqual([raw]);
  });
});

// Real ffmpeg: a tone, a long silence, then a tone. Proves detection, the cut,
// and that mapped times land back on the original timeline.
describe("extractSpeechAudio (real ffmpeg)", () => {
  const bin = ffmpegStatic as string;
  it("cuts silence and maps time back", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nm-speech-test-"));
    try {
      const src = join(dir, "src.flac");
      const gen = spawnSync(bin, [
        "-y",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
        "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono",
        "-f", "lavfi", "-i", "sine=frequency=880:duration=3",
        "-filter_complex",
        "[1:a]atrim=duration=12[s];[0:a][s][2:a]concat=n=3:v=0:a=1[out]",
        "-map", "[out]", "-ar", "16000", "-ac", "1", src,
      ]);
      expect(gen.status).toBe(0);

      const total = await probeDurationSeconds(src);
      expect(total).toBeGreaterThan(17.5);

      const speech = await extractSpeechAudio(src, dir);
      expect(speech).not.toBeNull();
      const shortened = await probeDurationSeconds(speech!.path);
      expect(shortened).toBeLessThan(10);
      expect(shortened).toBeGreaterThan(5);

      // The second tone starts at 15 s on the real timeline.
      const secondPiece = speech!.pieces[speech!.pieces.length - 1];
      expect(secondPiece.origStart).toBeGreaterThan(13);
      expect(secondPiece.origStart).toBeLessThan(15.5);
      const mapped = mapCompressedTime(secondPiece.compStart + 1, speech!.pieces);
      expect(mapped).toBeCloseTo(secondPiece.origStart + 1, 3);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("returns null for a track that is all silence", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nm-speech-test-"));
    try {
      const src = join(dir, "quiet.flac");
      spawnSync(bin, [
        "-y", "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono",
        "-t", "8", "-ar", "16000", "-ac", "1", src,
      ]);
      expect(await extractSpeechAudio(src, dir)).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
