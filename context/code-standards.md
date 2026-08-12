# Code Standards

Implementation rules and conventions for the entire NeuraMeet project. Follow these in every session without exception.

---

## Engineering Mindset

- Think before implementing — understand what is being built and why before writing a line
- Read context files first — never assume, verify against `architecture.md` and `project-overview.md`
- Scope is sacred — build only what the current feature requires
- Every feature must be testable immediately after implementation
- Clean over clever — simple, readable code
- One thing at a time — complete one feature fully before the next
- Failures are expected — every AI/network call wrapped in try/catch, logged, never crashes the whole flow

---

## TypeScript

- Strict mode — no exceptions
- Never use `any` — use `unknown` and narrow
- Avoid type assertions (`as SomeType`) unless unavoidable, and comment why
- All function parameters and return types explicitly typed
- `type` for object shapes/unions, `interface` only for extendable component props
- All async functions have proper error handling — no floating unhandled promises
- `const` by default, `let` only when reassignment is necessary

---

## Next.js 15 Conventions

- App Router only
- React 19 APIs throughout
- Server Components by default
- `"use client"` only when the component needs `useState`/`useReducer`, `useEffect`, browser APIs, event listeners, or a client-only third-party library (Stream video hooks, AI SDK `useChat`)
- Never add `"use client"` to layout files unless required
- Data fetching happens in Server Components or API routes — never fetch Supabase/AI directly from a Client Component

---

## AI / Model Rules

- All model calls go through the Vercel AI SDK (`ai`, `@ai-sdk/google`, `@ai-sdk/groq`) — never call a provider's raw REST API directly
- Primary model: Gemini (`@ai-sdk/google`). On error or rate limit, fall back to Groq (`@ai-sdk/groq`) — implement this fallback once in `agent/models.ts`, reuse everywhere
- Never call a paid model or paid API tier — Gemini free tier and Groq free tier only
- Structured extraction (summary, action items, category) uses AI SDK `generateObject` with a Zod schema — never parse freeform text with regex
- Chat responses use AI SDK `streamText` / `useChat` — never a blocking non-streamed call for chat
- Every model call wrapped in try/catch; on failure, return a clear error to the UI, never a silent empty result

---

## Supabase / Data Rules

- Server-side writes always use the service-role client (`lib/supabase-server.ts`) — never the anon/browser client
- Every query scoped to the owning `user_id` (via `meetings.user_id`) — never an unscoped query
- Handle the `error` return of every Supabase call — never assume success
- `meeting_chunks` embeddings are generated once per transcript; re-embed only on explicit re-process, never automatically on every read

---

## Component Rules

- No business logic in `components/` — data fetching happens via hooks (`hooks/`) that call API routes
- Reuse existing UI kit components (see `ui-registry.md`) before creating a new one
- Every new component gets a `ui-registry.md` entry immediately

---

## Testing (Playwright)

- Critical flows get an E2E spec: join meeting, upload transcript → insights appear, ask a question in AI Chat and receive a response, mark a follow-up complete
- Tests live in `e2e/`, run against a seeded/test Supabase project — never against production data

---

## General Do Nots

- No `sonner` in new code — `react-hot-toast` only
- No FastAPI/Python — Next.js API routes only
- No paid API keys anywhere in the codebase or `.env.local`
- No secrets in client components or `NEXT_PUBLIC_*` env vars except the Clerk publishable key, Stream app id/api key, and Supabase URL/anon key
