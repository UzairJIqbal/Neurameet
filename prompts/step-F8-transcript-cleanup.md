# Step F8 — Transcript Cleanup Pass

**Phase:** Transcript Generation (F-series), before Deploy
**Trigger:** automatic, last stage of F-series generation (Option A)
**Status:** approved, building

## Goal

A light grammar/accuracy correction of the merged `"SpeakerName: text"` transcript, run automatically as the last stage of F-series generation so the recap `.txt` is already cleaned when the user downloads it. No new button, no new route, no new DB column, no new UI.

## Constraints (locked)

- Zero cost: reuse the existing Gemini primary + Groq fallback text-generation infra (`generateStructuredWithFallback` in `src/agent/models.ts`). No new provider, no new model.
- Must not alter speaker labels or the `"SpeakerName: text"` line format.
- Must not summarize or remove real content — correction only.
- Graceful degradation is mandatory (FYP-demo safety): if cleanup fails, the raw transcript is returned and the download is never blocked.

## Implementation

### 1. `src/agent/transcript-generation.ts`

- Import `generateStructuredWithFallback` from `@/agent/models` and `z` from `zod`.
- Add a Zod schema (single required field — `generateStructuredWithFallback` requires every property in `requires`, so NO `.optional()`):
  ```ts
  const CLEANUP_MIN_RATIO = 0.6;
  const cleanupSchema = z.object({
    cleanedTranscript: z
      .string()
      .describe("The complete cleaned transcript, preserving every 'SpeakerName: text' line, same speakers and order."),
  });
  ```
- Add a pure, exported guard helper (unit-testable, no AI):
  ```ts
  export function fallbackToRawIfTooShort(cleaned: string, raw: string, minRatio = CLEANUP_MIN_RATIO): string {
    return cleaned.length >= minRatio * raw.length ? cleaned : raw;
  }
  ```
- Add an exported `cleanupTranscript(raw: string): Promise<string>`:
  - Build the cleanup prompt (see below) with the raw transcript.
  - Call `generateStructuredWithFallback({ schema: cleanupSchema, prompt })`.
  - Read `object.cleanedTranscript.trim()`; if empty → return raw.
  - Apply `fallbackToRawIfTooShort(cleaned, raw)`; if the result shrank >40% (truncation or forbidden summarization) it returns raw.
  - Wrap the whole thing in try/catch: on ANY throw (Gemini primary + Groq fallback both fail) log and return raw.
- Call site: inside `generateTranscriptForMeeting`, after `const transcript = allSegments.map(...).join("\n")` and BEFORE `return { status: "ok", transcript }`. Replace the return with:
  ```ts
  const cleaned = await cleanupTranscript(transcript);
  return { status: "ok", transcript: cleaned };
  ```
  The cleaned string becomes the cached `transcripts.raw_text` and the downloaded `.txt`.

### 2. Cleanup prompt (single call, two behaviors)

```
You are a transcript cleanup editor. You are given a meeting transcript where every line is formatted as "SpeakerName: text". Apply ONLY a light accuracy pass.

Rules:
1. Word-level correction: fix garbled, misheard, or dropped words caused by microphone or poor audio. Do not change the meaning.
2. Line-level reconstruction: if a single speaker's consecutive lines were clearly split by a microphone glitch and form ONE continuous thought, merge them into a single "SpeakerName: text" line. ONLY merge consecutive lines from the SAME speaker. NEVER merge across different speakers.
3. Remove a line ONLY if it is genuinely meaningless noise (for example a stray cough, dead-air caption, or a fragment with no reconstructable content). Do NOT fabricate words for broken lines — if a fragment has no reconstructable meaning, drop it; never invent speech that was not said.
4. NEVER summarize. NEVER remove real content. NEVER alter speaker names or labels. Keep the exact "SpeakerName: text" format, the original chronological order, and the speaker sequence.
5. Output the COMPLETE cleaned transcript. Do not omit any speaker or any real line. Preserve every real word.

Return the cleaned transcript in the cleanedTranscript field.

Transcript:
<raw>
```

## Hard rules (must hold)

- One AI call only (`generateStructuredWithFallback`). The Groq fallback is the only retry. Never a second full Gemini-then-Groq cleanup chain (would compound drift from the original transcript).
- Only merge consecutive same-speaker lines. Never across speakers (misattribution). Merge only when clearly one continuous thought.
- Drop meaningless-noise fragments rather than fabricate. Never invent content.
- Preserve chronological order and the `"SpeakerName: text"` format.

## Fallback chain (explicit)

- Gemini primary → Groq `openai/gpt-oss-20b` fallback (same infra as Summary/Action Items).
- If BOTH fail (helper throws after its internal retry), outer try/catch returns RAW + logs. Never blocks/crashes/error-blocks the download.
- `CLEANUP_MIN_RATIO` (~0.6) length guard rejects a >40% shrink → falls back to raw (protects against truncation and the forbidden summarization behavior).

## Known open risk (acceptable)

Very long meetings may exceed free-tier output-token limits; the guard then falls back to raw (graceful). No mitigation now (per-speaker chunking could be added later, out of scope).

## Verification

- `npx tsc --noEmit` clean; `npm run build` exit 0.
- vitest unit tests (add to `src/agent/transcript-generation.test.ts`):
  - `fallbackToRawIfTooShort`: cleaned >= ratio → cleaned; cleaned < ratio → raw; exact boundary → cleaned.
  - `cleanupTranscript` with mocked `generateStructuredWithFallback`: (a) returns cleaned; (b) truncated cleaned (< ratio) → raw; (c) throws (both fail) → raw; (d) empty `cleanedTranscript` → raw.
- Manual live bilingual meeting: downloaded `.txt` keeps correct speaker labels and loses no real content (only noise removed / fragments rejoined).

## Context files updated (planning, pre-build)

- `context/build-plan.md` — F8 step added (Steps F0→F8).
- `context/progress-tracker.md` — F8 planned row in the Transcript Generation section.
- `docs/scope/scope.md` — F8 at-a-glance row + feature section (status: planned).
