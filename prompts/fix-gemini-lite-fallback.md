# Fix: Gemini Flash Lite as a second model before Groq

Date: 2026-11-15. Scope: `src/agent/models.ts` and `src/agent/models.test.ts` only.

## Why

Measured 2026-11-15 with the production key (Vercel Hobby logs only last about an hour, so the timing was done directly):

- `gemini-flash-latest` (and `gemini-3.8-flash`) took more than 30 s on every call, even "Say OK", with or without `thinkingBudget: 0`, and one returned "high demand". So every `/api/ai/process` run currently burns the full 30 s `PRIMARY_STRUCTURED_TIMEOUT_MS`, then falls back to Groq `openai/gpt-oss-20b`, which is slower and fails JSON more often.
- `thinkingBudget: 0` is accepted on 3.8-flash (a bad setting is rejected in under 1 s; budget 0 passed validation and only stalled on load).
- `gemini-3.5-flash-lite` answered the same structured call in about 2 s. It rejects `thinkingBudget: 0` with 400 "invalid argument", and works with no thinking setting (reasoning tokens 0).
- `gemini-2.5-flash` and `gemini-2.5-flash-lite` are closed to new users.

Zero cost: same Gemini free tier and key, no new provider.

## Change

1. Add `export const liteModel = google("gemini-3.5-flash-lite");` next to `primaryModel`, with a short comment (Gemini Flash Lite, free tier, used when Flash is busy; does not accept `thinkingBudget`).

2. `generateStructuredWithFallback` becomes a 3-step chain:
   - Flash (`primaryModel`), as today: `maxRetries: 0`, `thinkingBudget: 0`, abort after `primaryTimeoutMs`.
   - On failure: Flash Lite, `maxRetries: 0`, NO `providerOptions`, abort after `LITE_STRUCTURED_TIMEOUT_MS = 30_000` (or `primaryTimeoutMs` when the caller passed a longer one, so transcript cleanup keeps its 90 s).
   - On failure: Groq, unchanged (`generateFallbackObject`).
   - Each failure logs a `console.warn` naming the step.

3. Skip Flash while it is known busy: when the Flash step fails, remember it for `FLASH_BUSY_TTL_MS = 60_000` (module-level timestamp, same idea as the chat probe cache). While that is set, start at Flash Lite. This stops a run of calls (process, ledger match, prep, cleanup batches) each waiting 30 s during an overload.

4. Chat probe (`probeChatModel`): if the Flash probe fails, probe Flash Lite with the same 4 s probe before falling back to Groq. Cache the resolved model as today. `resolveChatModel` return type stays `typeof primaryModel`.

5. `withFallback` is left as is (not used by the slow path).

No route, schema, UI, or API contract change. The Groq notes about `.nullable()` still apply because the chain can still reach Groq.

## Tests (`src/agent/models.test.ts`)

Update the existing mocks so the model passed to `generateObject` can be told apart, then:
- Flash succeeds: Lite and Groq never called.
- Flash aborts, Lite succeeds: returns Lite's object; Lite call has no `providerOptions` and has an abort signal.
- Flash and Lite fail: Groq called, existing Groq tests still pass (token budget, low reasoning, one JSON retry, no retry on other errors).
- After a Flash failure, the next call within 60 s starts at Lite (fake timers); after 60 s it tries Flash again.
- A longer `primaryTimeoutMs` (90 s) is also used for the Lite step.
- Chat probe: Flash probe fails, Lite probe passes, resolves to Lite.
- Reset the busy timestamp between tests (export a test-only reset or use `vi.resetModules`).

## Verify

- `npx tsc --noEmit`, `npx vitest run src/agent`, then full `npx vitest run`, `npm run lint`, `npm run build`.
- Live: run the real `/api/ai/process` structured prompt and schema against `gemini-3.5-flash-lite` once with a sample bilingual transcript, to confirm Lite returns a valid object for the full schema (ledger items, minutes draft) and to record the time.
- Update `context/progress-tracker.md` (no UI change, so `ui-registry.md` is untouched) and the model note in `context/library-docs.md` if it names the models.

## Out of scope

Splitting `/api/ai/process`, changing the Groq model, any other provider.
