import { beforeEach, describe, expect, it, vi } from "vitest";

// The source module transitively imports server-only modules (@/lib/supabase-server
// -> server-only, @stream-io/node-sdk). In a plain Node unit run those throw, so we
// stub them. The pure functions under test do not depend on the real implementations.
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: () => ({}) }));
vi.mock("@stream-io/node-sdk", () => ({ StreamClient: class {} }));
// F8: stub the AI fallback so cleanupTranscript can be tested without live keys.
vi.mock("@/agent/models", () => ({ generateStructuredWithFallback: vi.fn() }));

import {
  buildCleanupPrompt,
  cleanupTranscript,
  epochSecondsFromRecordingStart,
  fallbackToRawIfTooShort,
  filterBoundarySegments,
  isMostlyNonEnglish,
  mergeSegmentsToTranscript,
  normalizeSpeakerName,
  normUserId,
  offsetSegments,
  parseStreamUserId,
  WHISPER_DOMAIN_HINT,
  type WhisperSegment,
} from "./transcript-generation";
import { generateStructuredWithFallback } from "@/agent/models";

// ─── Bug 1: speaker-label parsing (the true root cause) ───────────────────────
// The recording filename embeds the FULL Clerk id between `user_` and the FIRST
// underscore (which precedes the per-recording uuid). The old greedy regex
// `/user_([A-Za-z0-9_-]+)_/` swallowed the uuid + `_audio_only`, producing a
// malformed id whose `slice(0,8)` happened to be `3I0VWn5w` (the exact broken
// label seen in the downloaded .txt). The fix is `/user_([^_]+)_/`.
describe("parseStreamUserId (Bug 1 root cause)", () => {
  const FULL_ID = "3I0VWn5w68jOhidJLKc2AJ5QqLe";

  it("extracts the bare Clerk id and stops at the first underscore (regression)", () => {
    const filename = `individual_default_abc123_user_${FULL_ID}_7c931c19-1a2b-4c3d-9e8f-0a1b2c3d4e5f_audio_only_1690000000000.mkv`;
    const result = parseStreamUserId(filename);
    expect(result).toBe(FULL_ID);
    // The old bug returned `${FULL_ID}_7c931c19-..._audio_only`; guard that.
    expect(result).not.toContain("_audio_only");
    expect(result).not.toContain("-");
  });

  it("handles an 8-char embedded id (prefix-match path)", () => {
    const filename = `individual_default_abc123_user_3I0VWn5w_7c931c19-1a2b_audio_only_1690000000000.mkv`;
    expect(parseStreamUserId(filename)).toBe("3I0VWn5w");
  });

  it("returns null for missing / empty / non-matching filenames", () => {
    expect(parseStreamUserId(undefined)).toBeNull();
    expect(parseStreamUserId("")).toBeNull();
    expect(parseStreamUserId("some_file_without_user_tag.mkv")).toBeNull();
  });
});

// ─── Bug 1 support: normUserId makes filename id + attendance id match ───────
// attendance_events.stream_user_id stores the id WITH a `user_` prefix; the
// filename embeds it WITHOUT the prefix. normUserId strips the prefix and
// lowercases so an exact or prefix compare succeeds either way.
describe("normUserId (Bug 1 prefix normalization)", () => {
  it("strips a leading user_ prefix case-insensitively and lowercases", () => {
    expect(normUserId("user_3I0VWn5w68jOhidJLKc2AJ5QqLe")).toBe(
      "3i0vwn5w68johidjlkc2aj5qqle",
    );
    expect(normUserId("USER_abc")).toBe("abc");
  });

  it("lowerCases an id with no prefix", () => {
    expect(normUserId("3I0VWn5w68jOhidJLKc2AJ5QqLe")).toBe(
      "3i0vwn5w68johidjlkc2aj5qqle",
    );
  });

  it("returns empty string for null / undefined", () => {
    expect(normUserId(null)).toBe("");
    expect(normUserId(undefined)).toBe("");
  });

  it("lets a filename id match an attendance row by exact or prefix", () => {
    const fromFilename = normUserId(parseStreamUserId("x_user_3I0VWn5w_y_u.mkv"));
    const fromAttendance = normUserId("user_3I0VWn5w68jOhidJLKc2AJ5QqLe");
    // exact-or-prefix compare used in resolveSpeakerName
    const matches =
      fromFilename === fromAttendance ||
      (fromFilename.length > 0 && fromAttendance.startsWith(fromFilename));
    expect(matches).toBe(true);
  });
});

// ─── Bug 3: chunk-boundary dedup (no word loss, no doubling) ─────────────────
// Chunk i (i>=1) overlaps the prior chunk by OVERLAP_SECONDS. Its leading
// overlap is a duplicate of the prior chunk's tail, so drop segments with
// start < overlap — but ONLY when there are real Whisper segments. The
// single-segment fallback (one segment spanning the whole chunk, start 0) must
// be kept whole, and chunk 0 is never filtered.
describe("filterBoundarySegments (Bug 3 dedup)", () => {
  const seg = (start: number, text: string): WhisperSegment => ({
    start,
    end: start + 2,
    text,
  });

  it("keeps chunk 0 entirely, even with start < overlap", () => {
    const input = [seg(0, "a"), seg(3, "b"), seg(6, "c")];
    expect(filterBoundarySegments(input, 0, 5, true)).toEqual(input);
  });

  it("drops leading overlap segments on chunk >= 1 (real segments)", () => {
    const input = [seg(0, "a"), seg(3, "b"), seg(6, "c")];
    // overlap 5 -> keep only start >= 5
    expect(filterBoundarySegments(input, 1, 5, true)).toEqual([seg(6, "c")]);
  });

  it("keeps the single fallback segment whole when there are no real segments", () => {
    const fallback = [seg(0, "whole chunk text")];
    // hasSegments false -> fallback must NOT be dropped
    expect(filterBoundarySegments(fallback, 1, 5, false)).toEqual(fallback);
  });

  it("respects a custom overlap value", () => {
    const input = [seg(0, "a"), seg(2, "b"), seg(4, "c")];
    expect(filterBoundarySegments(input, 2, 3, true)).toEqual([seg(4, "c")]);
  });

  it("does not double-count: tail of chunk N is preserved on chunk N+1", () => {
    // Chunk 2's leading OVERLAP_SECONDS (relative start 0..5) is the duplicate of
    // chunk 1's tail. A duplicate sits at start 3 (< 5) and is dropped; genuinely
    // new speech at start 8 is kept. (start 5 exactly == overlap is kept, since
    // the filter is `>=`.)
    const chunk2 = [seg(3, "dup"), seg(8, "new")];
    expect(filterBoundarySegments(chunk2, 2, 5, true)).toEqual([seg(8, "new")]);
  });
});

// ─── F8: cleanup length guard (protects against truncation / summarization) ───
// If the cleaned transcript shrank more than 40% vs raw, it is not a faithful
// clean (truncated output or the forbidden summarize behavior) so we keep raw.
describe("fallbackToRawIfTooShort (F8 guard)", () => {
  it("returns the cleaned transcript when it is within the ratio", () => {
    const raw = "a".repeat(1000);
    const cleaned = "b".repeat(900); // 90% of raw -> keep
    expect(fallbackToRawIfTooShort(cleaned, raw)).toBe(cleaned);
  });

  it("returns raw when the cleaned transcript is more than 40% shorter", () => {
    const raw = "a".repeat(1000);
    const cleaned = "b".repeat(500); // 50% of raw -> discard
    expect(fallbackToRawIfTooShort(cleaned, raw)).toBe(raw);
  });

  it("keeps the cleaned transcript at the exact boundary (>=, not >)", () => {
    const raw = "a".repeat(1000);
    const cleaned = "b".repeat(600); // exactly 0.6 -> keep
    expect(fallbackToRawIfTooShort(cleaned, raw)).toBe(cleaned);
  });

  it("falls back to raw at just below the boundary", () => {
    const raw = "a".repeat(1000);
    const cleaned = "b".repeat(599); // 0.599 -> discard
    expect(fallbackToRawIfTooShort(cleaned, raw)).toBe(raw);
  });
});

// ─── F8: cleanupTranscript end-to-end (mocked AI) ─────────────────────────────
// cleanupTranscript must ALWAYS return a usable transcript. On a clean result it
// returns the cleaned text; on truncation, empty, or total AI failure it must
// degrade to the RAW transcript rather than throwing or blocking the download.
describe("cleanupTranscript (F8 graceful degradation)", () => {
  const RAW =
    "Alice: hello every one welcome to the meetin\nBob: thanks alice\nAlice: lets start the aginda";

  it("returns the cleaned transcript when the AI succeeds", async () => {
    vi.mocked(generateStructuredWithFallback).mockResolvedValue({
      object: { cleanedTranscript: "Alice: hello everyone welcome to the meeting\nBob: thanks alice\nAlice: lets start the agenda" },
    });
    const result = await cleanupTranscript(RAW);
    expect(result).toContain("everyone");
    expect(result).toContain("agenda");
    expect(result).not.toBe(RAW);
  });

  it("falls back to raw when the cleaned result is truncated (< ratio)", async () => {
    vi.mocked(generateStructuredWithFallback).mockResolvedValue({
      object: { cleanedTranscript: "Alice: hi" }, // far below 60% -> discard
    });
    const result = await cleanupTranscript(RAW);
    expect(result).toBe(RAW);
  });

  it("falls back to raw when the AI returns an empty cleanedTranscript", async () => {
    vi.mocked(generateStructuredWithFallback).mockResolvedValue({
      object: { cleanedTranscript: "   " },
    });
    const result = await cleanupTranscript(RAW);
    expect(result).toBe(RAW);
  });

  it("falls back to raw when BOTH Gemini and Groq fail (throws)", async () => {
    vi.mocked(generateStructuredWithFallback).mockRejectedValue(
      new Error("both providers down"),
    );
    const result = await cleanupTranscript(RAW);
    expect(result).toBe(RAW); // never throws, never blocks
  });
});

// ─── F8 live-test fix 1: duplicated speaker-name tokens ──────────────────────
describe("normalizeSpeakerName (F8 live fix: dedupe name tokens)", () => {
  it("collapses a repeated adjacent middle/last name token", () => {
    expect(normalizeSpeakerName("Uzair Javaid Javaid Iqbal")).toBe(
      "Uzair Javaid Iqbal",
    );
  });

  it("leaves a correctly-formed name untouched", () => {
    expect(normalizeSpeakerName("Uzair Javaid Iqbal")).toBe(
      "Uzair Javaid Iqbal",
    );
  });

  it("collapses runs of whitespace and trims", () => {
    expect(normalizeSpeakerName("  Uzair   Javaid  ")).toBe("Uzair Javaid");
  });

  it("returns empty string for null / undefined / blank", () => {
    expect(normalizeSpeakerName("")).toBe("");
    expect(normalizeSpeakerName(null as unknown as string)).toBe("");
    expect(normalizeSpeakerName(undefined as unknown as string)).toBe("");
  });

  it("does not collapse distinct adjacent tokens", () => {
    expect(normalizeSpeakerName("Bob Smith")).toBe("Bob Smith");
  });
});

// ─── F8 live-test fix 2: same-speaker line merge rule broadened ───────────────
describe("buildCleanupPrompt (F8 live fix: merge continuous same-speaker turns)", () => {
  const prompt = buildCleanupPrompt("Uzair: a\nUzair: b\nBob: c");

  it("instructs merging consecutive same-speaker lines into one continuous turn", () => {
    expect(prompt).toContain("continuous speech turn");
    expect(prompt).toContain("Join the fragments with a single space");
  });

  it("still forbids merging across different speakers", () => {
    expect(prompt).toContain("NEVER merge across different speakers");
  });
});

// ─── F8 live-test fix 3: Groq Whisper domain-vocabulary prompt ───────────────
describe("WHISPER_DOMAIN_HINT (F8 live fix: bias proper nouns)", () => {
  it("targets the misheard domain terms and stays within the 224-token cap", () => {
    expect(WHISPER_DOMAIN_HINT).toContain("Neurameet");
    expect(WHISPER_DOMAIN_HINT).toContain("Urdu");
    // Words are far fewer than tokens; this is a safe upper bound on the cap.
    expect(WHISPER_DOMAIN_HINT.split(/\s+/).length).toBeLessThan(224);
  });
});

// ─── F9: translate non-English into English during the cleanup pass ───────────
// The recap path no longer forces Whisper `language: "en"`, so the merged
// transcript may arrive in mixed languages (Urdu in Arabic script, English,
// etc.). The F8 cleanup prompt must translate any non-English line into English
// while preserving the "SpeakerName: text" format, the speaker label, and order.
describe("buildCleanupPrompt (F9: translate non-English to English)", () => {
  const prompt = buildCleanupPrompt("Uzair: ميرا نام عذير ہے\nBob: this is english");

  it("adds a translation rule as the first instruction", () => {
    expect(prompt).toContain("TRANSLATION");
    expect(prompt).toContain("translate it into natural, fluent English");
    // The translation rule must precede the cleanup rules (it is rule 0).
    expect(prompt.indexOf("TRANSLATION")).toBeLessThan(
      prompt.indexOf("Word-level correction"),
    );
  });

  it("forbids translating speaker names and merging across speakers", () => {
    // The speaker label (the text before the first colon) must be preserved
    // untranslated — the strengthened F9 rule states this explicitly.
    expect(prompt).toContain("never translate");
    expect(prompt).toContain("speaker label");
    expect(prompt).toContain("NEVER merge across different speakers");
  });

  it("requires the final output to be English", () => {
    expect(prompt).toContain("Output the COMPLETE cleaned transcript in English");
  });
});

describe("cleanupTranscript (F9: non-English raw becomes English)", () => {
  const RAW_URDU =
    "Uzair: ميرا نام عذير ہے اور يہ پروڈکٹ ميری دوستوں نے بنايا ہے\nBob: this is already english";

  it("returns the English translation when the AI succeeds", async () => {
    vi.mocked(generateStructuredWithFallback).mockResolvedValue({
      object: {
        cleanedTranscript:
          "Uzair: My name is Uzair and this product was built by my friends\nBob: this is already english",
      },
    });
    const result = await cleanupTranscript(RAW_URDU);
    expect(result).toContain("My name is Uzair");
    expect(result).toContain("built by my friends");
    expect(result).not.toBe(RAW_URDU);
    // Speaker labels and order preserved; still English.
    expect(result.startsWith("Uzair:")).toBe(true);
  });

  it("falls back to the raw (mixed-language) transcript when the AI fails", async () => {
    vi.mocked(generateStructuredWithFallback).mockRejectedValue(
      new Error("both providers down"),
    );
    const result = await cleanupTranscript(RAW_URDU);
    expect(result).toBe(RAW_URDU); // graceful: never throws, never blocks
  });
});

// ─── F9 (live regression): detect untranslated output ─────────────────────────
// Devanagari -> Devanagari preserves length, so the F8 length guard CANNOT catch
// a non-translation. isMostlyNonEnglish detects non-Latin scripts so cleanup can
// retry. Names stay Latin; Devanagari/Hindi and Arabic/Urdu do not.
describe("isMostlyNonEnglish (F9: untranslated-output detector)", () => {
  it("returns false for plain English (even with proper nouns)", () => {
    expect(isMostlyNonEnglish("Alice: hello everyone, welcome to the meeting")).toBe(false);
    expect(isMostlyNonEnglish("Uzair Javaid Iqbal: this is english text")).toBe(false);
  });

  it("returns true for Devanagari / Hindi script", () => {
    expect(
      isMostlyNonEnglish("अज़ का मेरा नव्जायर जवेद है यह मीटिंग है"),
    ).toBe(true);
  });

  it("returns true for Arabic-script Urdu", () => {
    expect(
      isMostlyNonEnglish("ميرا نام عذير ہے اور يہ پروڈکٹ ميری دوستوں نے بنايا ہے"),
    ).toBe(true);
  });

  it("returns false when the non-Latin portion is below the threshold", () => {
    // Mostly English with a single Arabic word should NOT trip the detector.
    const mixed = "Uzair: my name is عذير and this is mostly english text here";
    expect(isMostlyNonEnglish(mixed)).toBe(false);
  });

  it("returns false for text with no letters at all", () => {
    expect(isMostlyNonEnglish("   ... !!! 123 ")).toBe(false);
  });
});

// ─── F9 (live regression): retry with translate-only prompt ───────────────────
// The failure mode from the live bilingual meeting: pass 1 "cleaned" the
// transcript but kept it in Devanagari. cleanupTranscript must now detect that
// and retry once; if pass 2 returns English it wins, otherwise it degrades to raw.
describe("cleanupTranscript (F9: non-English retry path)", () => {
  const RAW =
    "अज़ का मेरा नव्जायर जवेद है यह मीटिंग है\nBob: this is english";

  beforeEach(() => {
    vi.mocked(generateStructuredWithFallback).mockReset();
  });

  it("retries with a translate-only prompt and returns English on pass 2", async () => {
    vi.mocked(generateStructuredWithFallback)
      .mockResolvedValueOnce({
        object: {
          cleanedTranscript:
            "अज़ का मेरा नव्जायर जवेद है यह मीटिंग है\nBob: this is english",
        },
      })
      .mockResolvedValueOnce({
        object: {
          cleanedTranscript:
            "Uzair: my name is Uzair and this is a meeting\nBob: this is english",
        },
      });
    const result = await cleanupTranscript(RAW);
    expect(result).toContain("my name is Uzair");
    expect(isMostlyNonEnglish(result)).toBe(false);
    // Two model calls: pass 1 then the translate-only retry.
    expect(generateStructuredWithFallback).toHaveBeenCalledTimes(2);
  });

  it("falls back to raw when BOTH pass 1 and pass 2 stay non-English", async () => {
    vi.mocked(generateStructuredWithFallback)
      .mockResolvedValueOnce({ object: { cleanedTranscript: "यह मीटिंग है" } })
      .mockResolvedValueOnce({ object: { cleanedTranscript: "यह फिर भी हिन्दी है" } });
    const result = await cleanupTranscript(RAW);
    expect(result).toBe(RAW); // raw is also untranslated, but logged (not silent)
    expect(generateStructuredWithFallback).toHaveBeenCalledTimes(2);
  });
});

// ─── F-merge: chronological interleave across participants ──────────────────
// Each participant's individual recording starts when THEY joined, but Whisper
// reports every segment's `start` relative to that track's own audio (every
// track begins at ~0). The generated .txt from a real staggered-join meeting
// came back scrambled (a late-joining participant's line first) because the old
// merge sorted raw relative times, so equal-relative-start lines fell back to
// recording-array order. The fix offsets each track by its absolute recording
// start, then sorts once on the shared timeline.
describe("epochSecondsFromRecordingStart (F-merge: epoch source)", () => {
  it("converts a Date to epoch seconds", () => {
    expect(epochSecondsFromRecordingStart(new Date(1000 * (1000 + 30)))).toBe(
      1030,
    );
  });

  it("converts an ISO string to epoch seconds", () => {
    expect(epochSecondsFromRecordingStart("1970-01-01T00:17:10.000Z")).toBe(
      1030,
    );
  });

  it("returns 0 when start_time is absent (keeps single-participant behavior)", () => {
    expect(epochSecondsFromRecordingStart(undefined)).toBe(0);
  });

  it("returns 0 for an unparseable value rather than NaN", () => {
    expect(epochSecondsFromRecordingStart("not-a-date")).toBe(0);
  });
});

describe("offsetSegments (F-merge: per-track epoch shift)", () => {
  const segs = [
    { speaker: "Alice", start: 0, text: "a" },
    { speaker: "Alice", start: 20, text: "b" },
  ];

  it("adds the epoch offset to every segment's start", () => {
    expect(offsetSegments(segs, 1000)).toEqual([
      { speaker: "Alice", start: 1000, text: "a" },
      { speaker: "Alice", start: 1020, text: "b" },
    ]);
  });

  it("leaves segments unchanged when offset is 0", () => {
    expect(offsetSegments(segs, 0)).toEqual(segs);
  });

  it("does not mutate the input array", () => {
    const input = [{ speaker: "Alice", start: 0, text: "a" }];
    offsetSegments(input, 500);
    expect(input[0].start).toBe(0);
  });
});

describe("mergeSegmentsToTranscript (F-merge: chronological interleave)", () => {
  it("sorts by absolute start and renders SpeakerName: text lines", () => {
    const merged = mergeSegmentsToTranscript([
      { speaker: "Bob", start: 30, text: "second" },
      { speaker: "Alice", start: 10, text: "first" },
    ]);
    expect(merged).toBe("Alice: first\nBob: second");
  });

  // The exact bug from the live meeting: owner (Alice) speaks first at call t=0;
  // participant 2 (Bob) joins 30s later. Without the epoch offset both tracks'
  // first lines sit at relative start 0 and the stable sort keeps array order,
  // so Bob's line wrongly lands first. With the offset, Bob's line is placed
  // after Alice's two opening turns — the true speaking order.
  it("interleaves a late-joining participant AFTER the early speaker (regression)", () => {
    const ownerSegs = [
      { speaker: "Alice", start: 0, text: "A1" },
      { speaker: "Alice", start: 20, text: "A2" },
    ];
    const p2Segs = [
      { speaker: "Bob", start: 0, text: "B1" },
      { speaker: "Bob", start: 20, text: "B2" },
    ];
    const merged = mergeSegmentsToTranscript([
      ...offsetSegments(ownerSegs, 1000), // joined at call t=0
      ...offsetSegments(p2Segs, 1030), // joined 30s later
    ]);
    expect(merged).toBe("Alice: A1\nAlice: A2\nBob: B1\nBob: B2");
  });

  it("documents that the OLD behavior (no offset) scrambles the order", () => {
    const ownerSegs = [
      { speaker: "Alice", start: 0, text: "A1" },
      { speaker: "Alice", start: 20, text: "A2" },
    ];
    const p2Segs = [
      { speaker: "Bob", start: 0, text: "B1" },
      { speaker: "Bob", start: 20, text: "B2" },
    ];
    // Without offsetting, both tracks start at 0; the stable sort preserves the
    // concatenation order -> Bob's first line incorrectly precedes Alice's A2.
    const wrong = mergeSegmentsToTranscript([...ownerSegs, ...p2Segs]);
    expect(wrong).toBe("Alice: A1\nBob: B1\nAlice: A2\nBob: B2");
  });
});
