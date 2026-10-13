# Plan: Fix G1 + G2 — graceful-degradation gaps

**Scope:** Fix only **G1** (root error boundary) and **G2** (embedding-failure surfacing).
Leave **G3–G6** untouched. Zero-cost, no new dependencies.

---

## G1 — Root error boundary (prevent white-screen)

### Problem
`StreamClientProvider` is mounted in `src/app/(root)/layout.tsx` and throws
`new Error("API key not found")` (and can also throw inside `new StreamVideoClient(...)`)
**synchronously inside a `useEffect`** when the Stream env is missing/invalid. There is
**no `error.tsx` anywhere in the app**, so this white-screens the entire authenticated
app. Any unexpected render throw in any page likewise has no safety net.

### Fix
Add **one** file: `src/app/error.tsx` — the root-segment error boundary.

- `"use client"` component with the standard Next.js signature `{ error, reset }`.
- `useEffect` logs the error for client-side visibility.
- Renders a centered, friendly fallback using **existing design tokens only**
  (no raw hex): `bg-inverse-surface`, `text-inverse-on-surface`, `text-inverse-on-surface/70`,
  `bg-primary-container`, `text-on-primary`, `border-outline-variant`, etc.
  - Heading: "Something went wrong"
  - Body: "We hit an unexpected error while loading this page. You can retry, or go back to the home page."
  - "Try again" button → calls `reset()`
  - "Back to home" link → `"/"`
- No new dependencies; only `react` + existing Tailwind token classes.

### Why a single root file (not also `(root)/error.tsx`)
A segment's `error.tsx` does **not** catch errors thrown from that segment's own layout.
Because the throw originates in `app/(root)/layout.tsx` (a nested layout), the boundary
must live in a **parent** segment. The root `app/error.tsx` wraps the entire subtree
*including* `(root)/layout.tsx`, so it catches the Stream provider throw. A second
`(root)/error.tsx` would be redundant and would not catch the layout throw anyway.
One file is the minimal correct fix. (Catching the true root `app/layout.tsx` throw would
require `app/global-error.tsx`; not needed here since Stream lives in the nested layout.)

### Files
- **NEW** `src/app/error.tsx`

---

## G2 — Surface embedding failure (no silent no-RAG loop)

### Choice: **(a) warn at upload time** — chosen over (b)
- Option (b) (chat tab detects "failed embed" vs "never embedded") requires a **new DB
  status column + migration + embed-route persistence + chat-tab read** — a multi-file
  schema change that over-engineers this gap.
- Option (a) is a **single-file change** that breaks the *silence*: the user gets a clear,
  actionable message at the exact moment embedding fails, instead of being silently
  dropped into the misleading "upload a transcript first" chat loop.
- This matches the project's "keep it small" rule and the Explicit choice offered in the task.

### Fix — `src/components/UploadTranscriptModal.tsx`, in `handleUpload`
1. **Remove** the early `toast.success("Transcript processed successfully!")`
   (currently before the embed block).
2. Track an `embedFailed` boolean around the **existing** embed fetch (the try/catch that
   currently logs and ignores the failure). On `!embedRes.ok` **or** catch → `embedFailed = true`
   (keep the existing `console.error` logging).
3. After `onClose()` + `router.push(\`/meeting-intelligence/${meetingId}\`)`, branch the toast:
   - `embedFailed` → `toast.error("Meeting processed, but AI chat indexing failed. Re-upload the transcript to enable AI chat.")`
   - else → `toast.success("Transcript processed successfully!")`
4. The redirect still happens in **both** cases (summary + action items remain usable);
   only the chat-indexing toast differs. Embedding is still non-fatal to the overall flow.

### Residual (acknowledged, intentionally out of scope)
The AI Chat tab will still show the generic "no transcript context / upload a transcript
first" message for a meeting whose embed failed, because telling "failed embed" apart from
"never embedded" needs DB state (option b). The user is now **informed at upload time**, so
the failure is no longer *silent*. Closing that residual is a follow-up if desired.

### Files
- **EDIT** `src/components/UploadTranscriptModal.tsx`

---

## Checks (run before declaring done)
- `npx tsc --noEmit` — new `error.tsx` types + modal change.
- `npm run lint`.
- `npm run build` — confirm the error boundary compiles under the App Router.
- Manual G1: temporarily set `NEXT_PUBLIC_STREAM_API_KEY=""`, reload an authed page →
  expect the friendly fallback, **not** a white screen.
- Manual G2: force `/api/ai/embed` to 500 (e.g. bad Gemini key), upload a transcript →
  expect the warning toast + redirect; Summary/Action Items work, Chat tab shows generic msg.

## Explicitly skipped (do NOT touch)
G3 — `tokenProvider` / `MeetingSetup` render throws (no boundary needed beyond G1; tokenProvider
is async SDK-handled). G4 — Supabase connection misreported as 404. G5 — raw AI-SDK error
strings shown to user. G6 — chat mid-stream probe missing Groq handoff. **No schema changes.
No new libraries.**
