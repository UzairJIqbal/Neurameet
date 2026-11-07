# Fix: AI structured calls fail too often when Gemini is busy or out of quota

Rules in force: strict TypeScript, no `any`, small functions, no changes outside this task. Gemini and Groq only, free tier only, no new provider (AGENTS.md). Every AI call stays in try/catch with failures logged. No Stream code, no SQL changes, no UI changes. Read `context/library-docs.md` first and check the installed `@ai-sdk/groq` and `@ai-sdk/google` types before using any option.

## The problem

During the W-test runs (`start.log`) `POST /api/ai/process` failed far more than it should:

- 32 "Gemini structured call failed, falling back to Groq" warnings, 24 "AI processing error" 500s.
- Gemini causes: free tier daily quota 429 (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`, 20 per day) and 503s.
- Groq fallback (`openai/gpt-oss-20b`) then failed: 24 `Failed to validate JSON`, 10 `max completion tokens reached before generating a valid document`, some empty `failed_generation`.
- The route returns the raw provider error text to the browser (`src/app/api/ai/process/route.ts`, catch near line 415).

Tests had to retry up to 8 times, and the Tasdeeq run never got through.

## Cause (UNVERIFIED, prove it first)

`openai/gpt-oss-20b` is a reasoning model. `fallbackModel` in `src/agent/models.ts` sets no `reasoningEffort` and no max output tokens, so reasoning may eat the completion budget and leave truncated or empty JSON. The bilingual (Urdu script) transcripts may make it worse. This is a hypothesis.

Reproduce first: add a unit test or a focused check through the project's own flow that shows the Groq path with default options producing the truncation, then show it goes away with the change. If the hypothesis is wrong, stop and report, do not guess a second fix (run `/recover` rule).

## The change

1. `src/agent/models.ts`, fallback call only: pass `providerOptions: { groq: { reasoningEffort: "low" } }` and an explicit `maxOutputTokens` big enough for the largest schema (`extractionResultSchema`, about 4096 to 8192; pick from the schema size and Groq's free limit). Verify the option names against `node_modules/@ai-sdk/groq/dist/index.d.ts` (`reasoningEffort`: none, default, low, medium, high).
2. Retry the Groq call once when the error is a JSON validation or truncation failure (`maxRetries: 1` already covers network errors only). Keep it at one extra try.
3. Optional, only if confirmed free on the same key: a second Gemini model (for example a flash lite model) tried before Groq when the first Gemini call hits 429 or 503. Check the model id exists in `@ai-sdk/google` types and that it has its own free quota. If you cannot confirm it is free, skip this and say so.
4. `src/app/api/ai/process/route.ts` catch: log the real error server side, return a short friendly message to the client (`AI is busy right now, please try again in a minute`) with the same 500 status. Do not leak provider text.
5. Do not change schemas or prompts.

## Tests

- Extend `src/agent/models.test.ts`: fallback receives the reasoning and token options, one retry on a validation error, no retry on other errors, route returns the friendly message.
- Run `npx vitest run`, typecheck, lint, build.
- Live check (needs a restarted `npx next start`): process the Tasdeeq test meeting once with the Gemini key rate limited or after its quota is gone, and count how many tries it takes. Report the number, never print env values.

## Update

`context/progress-tracker.md` entry. No `ui-registry.md` change (no UI).

## Left out

Reducing how many Gemini calls one process request makes, and a queue or cache. Raise them only if this change is not enough.
