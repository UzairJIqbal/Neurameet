# Step 6 — AI Chat (meeting-scoped RAG, streaming)

> Implement the 6th Meeting Intelligence tab: **AI Chat** — a streamed, meeting-grounded
> Q&A over that meeting's `meeting_chunks`, with Gemini→Groq fallback selected **before**
> streaming (never mid-stream). General `/ai-chat` page is **deferred** to a later step.

## Read first (in this order)
1. `AGENTS.md`, `context/architecture.md`, `context/code-standards.md`, `context/ui-tokens.md`, `context/ui-rules.md`, `context/ui-registry.md`, `context/library-docs.md`, `context/progress-tracker.md`
2. `src/agent/models.ts`, `src/agent/embed.ts`, `src/app/api/ai/process/route.ts`, `src/app/api/ai/embed/route.ts`
3. `src/components/meeting-intelligence/MeetingTabs.tsx`, `MeetingDetail.tsx`, `SummaryTab.tsx` (pattern reference), `src/lib/meeting-types.ts`
4. **Before writing any `@ai-sdk/react` code:** read the installed package's types (`node_modules/@ai-sdk/react/dist/*.d.ts`) and the AI SDK v7 chat docs. The v7 `useChat` API differs from older versions — confirm the exact hook return shape (input/submit handling, `sendMessage`, `status`, `stop`) against the installed version. Do **not** guess.

## Hard constraints (from AGENTS.md + this session's blueprint)
- AI SDK is **v7** (`ai@7.0.58`). The correct streaming response helper is
  `result.toUIMessageStreamResponse()` — **NOT** `toDataStreamResponse()` (removed in v7).
  `context/library-docs.md:159` is stale and must be corrected.
- **No mid-stream provider fallback is possible.** `streamText` returns synchronously and
  pushes tokens into the client's open stream; `onError` only forwards the error, it does
  not restart with Groq. Select the provider **before** streaming via a pre-flight probe.
- `@ai-sdk/react` is **not yet installed** — add it, version-matched to `ai@7`.
- No raw hex / raw Tailwind color classes anywhere (use UI tokens from `context/ui-tokens.md`).
- `react-hot-toast` only (no `sonner`).
- Route files carry `/* eslint-disable prettier/prettier */` at top + try/catch → 500.
- Every AI call wrapped in try/catch; failures logged, never crash the run.
- Server-only logic stays server-side. No `google`/`groq`/`supabaseServer` in Client Components.
- Update `context/progress-tracker.md` + `context/ui-registry.md` after the feature lands.

## Files to create / modify

### 1. `src/agent/models.ts` (modify)
Add a streaming-aware model resolver. Leave the existing `withFallback` untouched (still used by non-streaming `process`/`embed`).

```ts
import { generateText } from "ai";

const PROBE_TIMEOUT_MS = 4000;

// Pick the chat model BEFORE streaming. A 1-token probe against Gemini
// catches the dominant failure mode (down/quota/auth/network at request start).
// Mid-stream failure cannot be cleanly handed to Groq, so selection happens here.
export async function resolveChatModel(): Promise<typeof primaryModel> {
  try {
    await Promise.race([
      generateText({ model: primaryModel, prompt: "ping", maxOutputTokens: 1 }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("provider probe timeout")), PROBE_TIMEOUT_MS),
      ),
    ]);
    return primaryModel;
  } catch (err) {
    console.error("Gemini probe failed, using Groq for chat:", err);
    return fallbackModel as unknown as typeof primaryModel;
  }
}
```
Note: `maxOutputTokens` is the v7 option name (confirmed in `node_modules/ai/dist/index.d.ts`).

### 2. `src/agent/rag.ts` (new, `import "server-only"`)
- `retrieveContext(meetingId: string, question: string): Promise<string[]>`:
  - Embed the question with Gemini `gemini-embedding-001` (pinned to 768-dim via `providerOptions.google.outputDimensionality`; embeddings are Gemini-only, consistent with Step 5):
    `const { embedding } = await embed({ model: google.textEmbeddingModel("gemini-embedding-001"), value: question, providerOptions: { google: { outputDimensionality: 768 } } });`
  - `const { data, error } = await supabaseServer().rpc("match_meeting_chunks", { query_embedding: embedding, match_meeting_id: meetingId, match_count: 5 });`
  - On error → `console.error` + return `[]` (graceful, never throw into the route).
  - Return `data?.map((r) => r.chunk_text) ?? []`.
- `buildSystemPrompt(context: string[]): string`: returns the grounding instruction —
  "You are a meeting assistant. Answer the user's question using ONLY the provided meeting
  transcript context. If the context does not contain the answer, say so plainly. Do not
  invent facts. Be concise." Append the joined context chunks when present.

### 3. `src/app/api/ai/chat/route.ts` (new)
```
POST /api/ai/chat
Body: { messages: UIMessage[], meetingId: string }
```
Steps:
1. `/* eslint-disable prettier/prettier */` + `"use server"`-free (route handler).
2. `const { userId } = await auth();` → `401` if absent.
3. Parse body; `meetingId` missing → `400`.
4. **Ownership check** (honor always-scope-by-user_id invariant): `supabaseServer().from("meetings").select("id").eq("id", meetingId).eq("user_id", userId).single()` → `404` if not owner / not found.
5. `const context = await retrieveContext(meetingId, lastUserMessage);` (extract the latest user text from `messages`).
6. If `context.length === 0`: `streamText({ model: await resolveChatModel(), system: "You are a meeting assistant.", messages: [...messages, { role: "user", content: "Tell the user there is no transcript context for this meeting yet and they should upload a transcript first." }] })` — i.e. stream a friendly no-context reply. **Do not** lazy-embed; keep it small.
7. Else: `const result = streamText({ model: await resolveChatModel(), system: buildSystemPrompt(context), messages });`
8. `return result.toUIMessageStreamResponse();` (v7 API).
9. Whole body in try/catch → `500` with `console.error`.

### 4. `src/components/meeting-intelligence/ChatPanel.tsx` (new, `"use client"`)
- Props: `{ meetingId: string }`.
- `const { messages, sendMessage, status, stop } = useChat({ api: "/api/ai/chat", body: { meetingId } });`
  - Confirm exact option/return names against installed `@ai-sdk/react` types (see Read step 4).
- Local `input` state; on submit call `sendMessage(input)` and clear.
- Render: scrollable message list (assistant vs user styled via UI tokens — `surface-container-*`, `on-surface*`, `primary*`), text input + Send button (disabled while `status === "streaming"`), and a Stop button while streaming.
- Use project UI components/tokens; no raw colors. `react-hot-toast` for errors.

### 5. `src/components/meeting-intelligence/AiChatTab.tsx` (new, `"use client"`)
- Props: `{ meetingId: string }`; renders `<ChatPanel meetingId={meetingId} />` inside the existing tab content container styling (match `SummaryTab`/`CategoryTab` layout shell).

### 6. `src/components/meeting-intelligence/MeetingTabs.tsx` (modify)
- Add `"AI Chat"` to `TABS` (becomes 6th tab).
- Thread `meetingId` into `MeetingTabs` props (add `meetingId: string`).
- Add render case: `{ active === "AI Chat" && <AiChatTab meetingId={meetingId} /> }`.

### 7. `src/components/meeting-intelligence/MeetingDetail.tsx` (modify)
- Pass `meetingId={meeting.id}` to `<MeetingTabs ... />`.

### 8. `context/library-docs.md` (modify — stale doc fix)
- Line ~159: `return result.toDataStreamResponse();` → `return result.toUIMessageStreamResponse();`
- Line ~164: clarify fallback wording to "for streaming, select the provider before streaming via a probe and use `fallbackModel` if the probe fails (mid-stream failover is not supported)."

### 9. `context/progress-tracker.md` + `context/ui-registry.md` (modify)
- Mark Step 6 (scoped AI Chat tab) in progress → closed; note `/ai-chat` general page deferred.
- Register `ChatPanel`, `AiChatTab` in `ui-registry.md` with their tokens/pattern.

## Verification (manual E2E — dev server must be running)
1. `npm install @ai-sdk/react` (verify it resolves against `ai@7`; fix major if peer-dep mismatch).
2. `npx tsc --noEmit` clean; `npm run build` exit 0.
3. `npm run dev`:
   - Upload a transcript (Step 5 populates `meeting_chunks`) → open that meeting → **AI Chat** tab → ask "What decisions were made?" → tokens stream in incrementally; answer grounded in the transcript.
   - No-context path: open a meeting with no chunks (created pre-Step 5) → ask anything → friendly "no context yet" reply, no crash.
   - Fallback: temporarily use a bad Gemini key → probe fails → Groq answers; confirm the client receives exactly **one** clean stream (no duplicated/garbled tail).

## Out of scope this session
- General `/ai-chat` page (no `meetingId`). Reuses `ChatPanel` later — build `ChatPanel` reusable but do not add the route/page now.
- Lazy-embedding of unembedded meetings (handled via friendly no-context message instead).
- Change-category write path (deferred from Step 4).
