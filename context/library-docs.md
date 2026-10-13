# Library Docs

Project-specific usage patterns for every third-party library in NeuraMeet. Read the relevant section before implementing any feature that touches these libraries.

## Before Using Any Library

1. Check `AGENTS.md` for an installed skill for that library — skills have up-to-date API docs.
2. Check if an MCP server is configured for that library — use it before general knowledge.
3. Read this file for project-specific patterns that override general knowledge.

Order of authority: `MCP server → Skills via AGENTS.md → This file → General training knowledge`. Library APIs (especially the AI SDK provider packages) change often — never trust training data alone.

---

## Clerk (existing — no changes)

Auth is already wired via `middleware.ts` and `ClerkProvider` in `layout.tsx`.

**Known bug to fix:** `middleware.ts` route matcher is missing leading slashes:
```ts
// Wrong — never matches real paths
const isProtectedRoute = createRouteMatcher(["/", "personalRoom", "previous", "recordings", "/upcoming"]);

// Correct
const isProtectedRoute = createRouteMatcher(["/", "/personal-room", "/previous", "/recording", "/upcoming", "/meeting-intelligence(.*)", "/follow-ups(.*)", "/ai-chat", "/settings"]);
```
Match the real route paths used in `app/(root)/(home)/*` and new routes — never guess a path, verify it against `architecture.md`'s folder structure.

---

**Dev-only setting (must re-enable before Step 10 production deploy):** Email verification is turned OFF in Clerk Dashboard (User & Authentication → Email → "Verify at sign-up") to speed up dev sign-up testing. Re-enable it before deploying to production — the `/verify-email` code already supports it, so this is config-only.

## Stream Video SDK (existing — one bug to fix)

**Primary source of truth:** the official Stream `stream` / `stream-react` skill (installed via the `getstream` CLI — `curl -fsSL https://getstream.io/cli.sh | bash` then `getstream skills stream-react --claude`) is available and must be consulted first for any Stream SDK question (event names, payload shapes, call/device lifecycle, version behavior), ahead of general training knowledge. Its `references/VIDEO.md` is the authoritative Video/Call API reference. Use it before writing or modifying Stream code. If the skill is not available, fall back to the installed package type definitions in `node_modules/@stream-io/*/dist/**/*.d.ts` rather than assuming behavior from memory.

**Known bug:** `src/actions/stream.actions.ts` computes the token's issued-at timestamp incorrectly:
```ts
// Wrong — getDate() returns day-of-month (1-31), not epoch seconds
const issued = Math.round(new Date().getDate() / 1000) - 60;

// Correct
const issued = Math.floor(Date.now() / 1000) - 60;
```

Token generation stays server-only (`"use server"`), never expose `STREAM_SECRET_KEY` to the client. Existing `StreamClientProvider` and call hooks (`useGetCall`, `useGetCallbyId`) stay as-is.

---

## Supabase (Postgres + pgvector + Storage)

**Client vs Server — two instances, never mix:**
```ts
// lib/supabase-client.ts — browser context only
import { createBrowserClient } from "@supabase/ssr";
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
```
```ts
// lib/supabase-server.ts — server context only, service role
import { createClient } from "@supabase/supabase-js";
export const supabaseServer = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
```

**Enable pgvector once (Supabase SQL editor):**
```sql
create extension if not exists vector;

create table meeting_chunks (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references meetings(id) not null,
  chunk_text text not null,
  embedding vector(768),
  chunk_index integer not null
);

create index on meeting_chunks using ivfflat (embedding vector_cosine_ops);
```

**Similarity search (RAG retrieval):**
```ts
const { data } = await supabaseServer().rpc("match_meeting_chunks", {
  query_embedding: questionEmbedding,
  match_meeting_id: meetingId,
  match_count: 5,
});
```
Define `match_meeting_chunks` as a Postgres function using `<=>` cosine distance, filtered by `meeting_id`. Never run an unfiltered vector search across all meetings.

**Rules:**
- Always scope by `user_id` (via `meetings.user_id`) and, for RAG, by `meeting_id`
- Always handle the `error` return
- Storage bucket `recordings` only if caching Stream recordings locally is later needed — not required initially, Stream serves recording URLs directly

---

## Vercel AI SDK + Gemini + Groq

**Provider setup (`agent/models.ts`):**
```ts
import { google } from "@ai-sdk/google";
import { groq } from "@ai-sdk/groq";

export const primaryModel = google("gemini-flash-latest");
export const fallbackModel = groq("llama-3.3-8b-versatile");

export async function withFallback<T>(fn: (model: typeof primaryModel) => Promise<T>): Promise<T> {
  try {
    return await fn(primaryModel);
  } catch (error) {
    console.error("Gemini call failed, falling back to Groq:", error);
    return await fn(fallbackModel as unknown as typeof primaryModel);
  }
}
```

**Structured extraction (summary/action items/category) — `generateObject`:**
```ts
import { generateObject } from "ai";
import { z } from "zod";

const schema = z.object({
  summary: z.string(),
  keyPoints: z.array(z.string()),
  decisions: z.array(z.string()),
  category: z.string(),
  detectedTopics: z.array(z.string()),
  actionItems: z.array(z.object({
    title: z.string(),
    assignee: z.string().optional(),
    dueDate: z.string().optional(),
  })),
});

const { object } = await generateObject({ model: primaryModel, schema, prompt: transcriptPrompt });
```

**Embeddings:**
```ts
import { embed } from "ai";
import { google } from "@ai-sdk/google";

const { embedding } = await embed({
  model: google.textEmbeddingModel("gemini-embedding-001"),
  value: chunkText,
  // Pin to 768-dim to match the meeting_chunks.embedding vector(768) column.
  providerOptions: { google: { outputDimensionality: 768 } },
});
```

**Streaming chat (`app/api/ai/chat/route.ts`):**
```ts
import { streamText } from "ai";

const result = streamText({
  model: primaryModel,
  system: "Answer only from the provided meeting context. If it's not in the context, say so.",
  messages,
});
return result.toUIMessageStreamResponse();
```

**Rules:**
- Never call `google` or `groq` provider functions from a Client Component — API routes only
- For non-streaming calls, wrap in `withFallback`. For **streaming** (`streamText`), mid-stream provider failover is NOT supported — once tokens reach the client, switching models would duplicate output. Select the provider BEFORE streaming: probe the primary (e.g. a 1-token `generateText`) and use `fallbackModel` only if the probe fails. See `resolveChatModel()` in `src/agent/models.ts`.
- Streaming response helper in AI SDK v7 is `result.toUIMessageStreamResponse()` (NOT `toDataStreamResponse()`, which was removed). The client uses `@ai-sdk/react`'s `useChat` with a `DefaultChatTransport`.
- Never exceed free-tier rate limits by batching — process one meeting's extraction as a single request, not per-paragraph

---

## Playwright

```ts
// e2e/join-meeting.spec.ts
import { test, expect } from "@playwright/test";

test("user can join a meeting", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Join Meeting").click();
  // ...
});
```
Run against a local dev server with a seeded test Supabase project. Never point Playwright at production.

---

## Oxylabs (optional / stretch — topic enrichment)

Only used if a meeting's detected topic/company benefits from a short public-web lookup (e.g. enriching a "Client Discussion" category with the client company's public info). Server-side only, behind its own API route, never in the core Upload Transcript → Insights path — this is additive and must never block core processing if it fails or is unavailable.

---

## pdf-lib (Attendance PDF report — Step B3)

**MIT, zero cost, zero Next.js config.** No `serverExternalPackages` / `transpilePackages` needed (unlike `@react-pdf/renderer`, which breaks the Next 15 + React 19 bundler). Pure JS, runs in a Node-runtime API route.

**Rules:**
- Generation lives server-side only: `src/lib/attendance-pdf.ts` (pure generator, no `"use client"`) + `src/app/api/attendance/report/route.ts` (owner-checked, returns `application/pdf`). Attendance data never reaches the browser.
- Route must set `export const runtime = "nodejs"` (it uses `supabaseServer()`).
- Use `StandardFonts.Helvetica` / `HelveticaBold`. Standard fonts cover the ASCII/Latin names, emails, and timestamps in our data — do NOT register a TTF unless we later need non-Latin glyphs.
- Render timestamps in **UTC** and label them `(UTC)` — deterministic, avoids server-locale drift. This is a PDF byte buffer, not a DOM component, so the "no hex colors" UI rule does not apply; use plain `rgb()`.
- Return the PDF from a route as `new NextResponse(pdfBytes, { headers: { "Content-Type": "application/pdf", "Content-Disposition": \`attachment; filename="..."\` } })`.
- Keep the layout small and explicit (this is a tabular report). `buildReportRows()` is the pure, unit-testable core; `generateAttendancePdf()` wraps it. Test with `npx tsx scripts/check-attendance-pdf.ts` (no browser needed — asserts columns/counts + `%PDF-` header).
