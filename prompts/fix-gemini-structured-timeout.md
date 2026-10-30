# Fix: time limit on the Gemini structured call

## Problem
`generateStructuredWithFallback` in `src/agent/models.ts` calls Gemini with `maxRetries: 0` but no time limit. During `/check verify promise ledger` (2026-10-30) Gemini stalled until the 300 s undici headers timeout before Groq took over. `/api/ai/process` and `/api/ledger/match` each took 5+ minutes. The upload modal (shared 120 s budget for upload, process, embed) and "Check again" (120 s) abort first, so the UI never redirects and match never runs from the UI.

## Change (scope: `src/agent/models.ts` plus one new test file, plus the transcript cleanup caller)
1. Add an optional `primaryTimeoutMs?: number` argument to `generateStructuredWithFallback`, default `PRIMARY_STRUCTURED_TIMEOUT_MS = 30_000` (named constant with a short comment saying why).
2. Pass `abortSignal: AbortSignal.timeout(primaryTimeoutMs)` to the Gemini `generateObject` call only. AI SDK 7.0.64 `generateObject` accepts `abortSignal` (it omits the `timeout` request option, so `timeout` is not usable here). The existing `catch` already falls back to Groq on any error, including the abort. Groq call unchanged (no signal).
3. `src/agent/transcript-generation.ts` `cleanupTranscript`: both calls rewrite the whole transcript, so output is long and Gemini can legitimately need more than 30 s. Pass `primaryTimeoutMs: 90_000` on both calls. All other callers (process, ledger extraction and match, prep, speaker insights) keep the 30 s default.
4. No other files change. No new dependency. Zero cost.

## Tests (`src/agent/models.test.ts`, new)
Mock `ai` (`generateObject`) and the two provider modules.
- Gemini resolves → returns its object, Groq not called, the Gemini call received an `AbortSignal`.
- Gemini rejects with an abort (`DOMException` "TimeoutError") → Groq is called and its object returned.
- Timer test with fake timers: a Gemini call that never settles but honours the signal → after 30 s Groq is called.
- `primaryTimeoutMs` override is respected (90 s case does not fall back at 30 s).

## Checks
`npx vitest run src/agent/models.test.ts src/agent/transcript-generation.test.ts`, then full `npx vitest run`, `npx tsc --noEmit`, `npm run build`.

## Manual test steps (port 3100)
1. Upload a short transcript from the dashboard. It redirects to the meeting in well under 2 minutes, even when Gemini is slow (dev log shows "Gemini structured call failed, falling back to Groq" with a TimeoutError if Gemini stalls).
2. On that meeting's Ledger tab press Check again → it finishes inside 2 minutes.

## Docs
Add a line to `context/progress-tracker.md`. No UI change, so `ui-registry.md` is untouched.
