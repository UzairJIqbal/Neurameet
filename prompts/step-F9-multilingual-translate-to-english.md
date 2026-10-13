# Implementation Prompt — F9: Multilingual Transcription → Always-English Output

> Build spec derived from the F9 architect blueprint (this file is the approved
> plan; implementation starts only after the user approves). Fixes the
> confirmed production bug where Urdu (and other non-English speech) came back
> as **garbage English** because `transcribeChunk` forced Whisper
> `language: "en"`, which makes Whisper *machine-translate* the audio into
> English instead of transcribing it. Zero cost, Groq-only STT, reuses the
> existing Gemini→Groq fallback text infra.

## ZERO-COST RULE (non-negotiable)
Only free tiers in use: Stream per-participant audio + Groq Whisper
(`whisper-large-v3-turbo`) for STT, Gemini primary + Groq fallback
(`openai/gpt-oss-20b`) for the translate/cleanup pass via
`generateStructuredWithFallback`. No new provider, no new model, no new
route, no new DB column. The existing `transcripts.language` column + its
`ALTER` migration (Bug 2) are reused — no schema change.

## Root cause (verified by reading the code)
- `src/agent/transcript-generation.ts` `transcribeChunk` (lines ~246–257):
  ```ts
  const whisperLang = language && language.trim() ? language.trim() : "en";
  form.append("language", whisperLang);
  ```
  When the recap download path sends no `language` (verified:
  `AfterMeetingRecap.tsx` POSTs `{ meetingId, streamCallId, streamCallType }`
  with no `language` field), this defaults to `"en"`. Forcing `"en"` makes
  Whisper translate Urdu audio into English — and Whisper's forced
  Urdu→English is unreliable, producing "My name is Zayajawir and my name is
  Urdu" / "Three people have been sent to me". This is a **design flaw** (the
  force-English decision), not a code typo.
- The progress-tracker's "Bug 2 (a) EN/UR/Auto selector" entry is STALE: the
  actual `AfterMeetingRecap.tsx` has no selector and sends no `language`. The
  only real code path is the forced `"en"` default. This step supersedes that
  earlier direction.

## What to build (all in `src/agent/transcript-generation.ts`)

### 1. Stop forcing English in `transcribeChunk`
- Change the language resolution so an **unsupplied** `language` means
  **auto-detect** (omit the field entirely) rather than forcing `"en"`:
  ```ts
  // No explicit hint → omit `language` so Whisper auto-detects the spoken
  // language and writes accurate source-language text (Urdu in Arabic script,
  // English in English). Forcing "en" made Whisper machine-translate and
  // produced garbage for Urdu (F9 root cause). An explicit hint still wins.
  if (language && language.trim()) {
    form.append("language", language.trim());
  }
  ```
- Keep the `language?: string` parameter on `transcribeChunk` and
  `processTrack` and `generateTranscriptForMeeting` for forward
  compatibility, but the recap path never supplies it, so auto-detect is what
  runs. (No caller needs to change — `AfterMeetingRecap` already sends none.)
- The `timestamp_granularities` omission and the `WHISPER_DOMAIN_HINT`
  `prompt` stay exactly as they are.

### 2. Correct the product-name spelling in `WHISPER_DOMAIN_HINT`
- Line ~30–35 currently says `"Neuromeet"`. The product is **"Neurameet"**.
  Fix the hint string to spell it correctly so Whisper stops mishearing the
  name:
  ```ts
  export const WHISPER_DOMAIN_HINT =
    "This is a meeting about Neurameet, an AI meeting platform, discussed in English and Urdu. Spell 'Neurameet' and 'Urdu' correctly.";
  ```
- This requires updating the assertion in
  `src/agent/transcript-generation.test.ts` (the F8 live-fix-3 test currently
  asserts `WHISPER_DOMAIN_HINT` contains `"Neuromeet"` → change to
  `"Neurameet"`).

### 3. Fold translation into the existing F8 cleanup pass
The merged `"SpeakerName: text"` transcript (possibly mixed Urdu/English, or
any language) is already passed to `cleanupTranscript` right before caching
(lines ~573–583). Extend that single call to **also translate non-English
into English**, so the cached `raw_text` and the downloaded `.txt` are always
English. One AI call, same fallback chain, same graceful degradation.

- Update `buildCleanupPrompt(raw)` to add a translation rule as the FIRST
  rule, and update the `cleanedTranscript` description in `cleanupSchema`
  (and the schema's zod `.describe`) to state the output must be English:
  ```
  Rules:
  0. TRANSLATION: if any line's text is not in English, translate it into
     natural, fluent English. Preserve every "SpeakerName: text" line, the
     speaker label (the text BEFORE the first colon — never translate names),
     and the original chronological order. A line that is already English is
     kept as-is. Do not summarize while translating.
  1. Word-level correction: fix garbled, misheard, or dropped words caused by
     microphone or poor audio. Do not change the meaning.
  2. Line-level reconstruction: merge consecutive lines from the SAME speaker
     into a single "SpeakerName: text" line whenever they are part of ONE
     continuous speech turn... (unchanged from current F8 rule 2)
  3. Remove a line ONLY if it is genuinely meaningless noise... (unchanged)
  4. NEVER summarize. NEVER remove real content. NEVER alter speaker names or
     labels. Keep the exact "SpeakerName: text" format... (unchanged)
  5. Output the COMPLETE cleaned transcript in English. Do not omit any
     speaker or any real line. Preserve every real word.
  ```
- `cleanupSchema`'s `cleanedTranscript` `.describe` becomes e.g.
  `"The complete transcript, translated into English if needed and cleaned,
  preserving every 'SpeakerName: text' line, same speakers and order."`
- `cleanupTranscript` itself needs NO structural change: the existing
  try/catch + `fallbackToRawIfTooShort` guard still apply. If the AI call
  fails or shrinks >40%, it returns the RAW (mixed-language) transcript — the
  same graceful FYP-demo safety. (Extremely rare; the normal path returns
  clean English.)
- `generateTranscriptForMeeting` currently returns
  `{ status: "ok", transcript: cleaned }`. Set the output language so the
  cache is correctly labeled:
  ```ts
  return { status: "ok", transcript: cleaned, language: "en" };
  ```
  (The recap always requests English and sends no `language`, so the
  `download/route.ts` cache branch `requestedLang === ""` returns the cached
  row regardless — no route change needed. Storing `"en"` keeps the
  `transcripts.language` column honest.)

### Files
Modify:
- `src/agent/transcript-generation.ts` (3 changes: auto-detect default in
  `transcribeChunk`; `WHISPER_DOMAIN_HINT` spelling; `buildCleanupPrompt`
  translation rule + `cleanupSchema` describe; `ok` result `language: "en"`).
- `src/agent/transcript-generation.test.ts` (one assertion: `"Neuromeet"` →
  `"Neurameet"`; plus new tests below).

No changes to `AfterMeetingRecap.tsx`, `download/route.ts`, any UI, or any
DB schema.

## Reuse (do NOT duplicate)
- `generateStructuredWithFallback` (Gemini→Groq) — already used by F8 cleanup.
- `fallbackToRawIfTooShort` guard + outer try/catch — unchanged.
- `transcripts.language` column + `setTranscriptState` — reused; no migration
  needed (already in `supabase/schema.sql` from Bug 2).
- The existing recap download flow (`POST /api/transcript/download` →
  `generateTranscriptForMeeting`).

## Verification
1. `npx tsc --noEmit` clean; `npm run lint`; `npm run build` exit 0.
2. `npm run test:unit` — extend `src/agent/transcript-generation.test.ts`:
   - Update the F8 live-fix-3 assertion: `WHISPER_DOMAIN_HINT` now contains
     `"Neurameet"` (not `"Neuromeet"`).
   - Add a `buildCleanupPrompt` test asserting the prompt now contains a
     translation instruction (e.g. "TRANSLATION" / "translate ... into
     English") and still forbids translating speaker names / merging across
     speakers.
   - Add a `cleanupTranscript` test (mocked AI) where the RAW input is
     non-English (e.g. `Uzair: میرا نام عذیر ہے`) and the mocked
     `generateStructuredWithFallback` returns the English translation; assert
     the result is the English text and is NOT the raw.
   - Confirm the existing 28 tests still pass (no regression from the prompt
     change or the hint spelling change).
3. Manual live bilingual (English + Urdu) meeting: recap "Generate
   Transcript" downloads a `.txt` where the Urdu is rendered as **clean
   English** (e.g. "Uzair Javaid: My name is Uzair Javaid and this product
   was built by me and two friends..."), NO garbage machine-translation, NO
   Devanagari. Uploading that `.txt` via Dashboard → Upload Transcript yields
   correct Summary / Action Items / Category / RAG.
4. Regression: a Punjabi- or German-spoken meeting also produces clean
   English (no force-English needed) — confirms the earlier edge-case
   requirement is met with better quality.

## Out of scope (this step)
- Per-language output selector / raw-source download (user requirement is
  English only).
- Optional hardening: re-running a chunk with `language: "ur"` when Whisper
  reports detected `"hi"` (cleaner Arabic-script source for translation). Not
  needed for v1 — the translate step already converts Devanagari→English.
- Changing the `download/route.ts` cache branch (harmless as-is).
- Any UI, route, or schema change.
