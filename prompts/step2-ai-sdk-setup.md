# Step 2 — AI SDK + Gemini/Groq Provider Setup

## What to build

Create the AI provider foundation: install Vercel AI SDK + Gemini + Groq packages, set up `src/agent/models.ts` with Gemini primary + Groq fallback, and verify both API keys work with a trivial call.

## Files to create

1. **`src/agent/models.ts`** — Provider instances + fallback helper
2. **`src/agent/types.ts`** — Agent-specific TypeScript types (empty barrel for now, will grow in Step 3)

## Files to modify

1. **`package.json`** — Add dependencies via install command
2. **`.env.local`** — Add `GOOGLE_GENERATIVE_AI_API_KEY` and `GROQ_API_KEY` placeholders (if not present)

## Dependencies to install

```bash
npm install ai @ai-sdk/google @ai-sdk/groq zod
```

- `ai` — Vercel AI SDK core (generateText, generateObject, streamText, embed)
- `@ai-sdk/google` — Gemini provider
- `@ai-sdk/groq` — Groq provider
- `zod` — Schema validation for structured output

## Implementation

### `src/agent/models.ts`

```typescript
import { google } from "@ai-sdk/google";
import { groq } from "@ai-sdk/groq";

export const primaryModel = google("gemini-2.0-flash");
export const fallbackModel = groq("llama-3.1-8b-instant");

export async function withFallback<T>(
  fn: (model: typeof primaryModel) => Promise<T>,
): Promise<T> {
  try {
    return await fn(primaryModel);
  } catch (error) {
    console.error("Gemini call failed, falling back to Groq:", error);
    return await fn(fallbackModel as unknown as typeof primaryModel);
  }
}
```

### `src/agent/types.ts`

```typescript
// Agent-specific types — will grow as features are built
export type { };
```

### `.env.local` additions (append if not present)

```
# AI Provider Keys
GOOGLE_GENERATIVE_AI_API_KEY=your-google-gemini-key-here
GROQ_API_KEY=your-groq-key-here
```

## Verification

After implementation, run:

1. `npx tsc --noEmit` — typecheck passes
2. `npm run build` — build succeeds
3. Confirm both env var placeholders are in `.env.local` (user fills real values manually)

## Rules to follow

- Never call provider functions from Client Components — models.ts is server-only
- Every AI SDK call wrapped in try/catch with fallback (withFallback handles this)
- No paid APIs — Gemini and Groq free tier only
- `agent/` folder never imports from `components/` or `actions/`
