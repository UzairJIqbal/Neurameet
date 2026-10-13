# Step 9.5 — FYP Polish Pass (four safe sub items)

Build the four deferred Step 9.5 sub items that do not need a paid service.
Oxylabs enrichment is NOT part of this pass (it needs a paid API, which the
project hard rule forbids). Each sub item is small and reuses what already exists.

Scope source: `context/build-plan.md` Step 9.5, `docs/scope/scope.md` Deferred
list. Architecture: `context/architecture.md`. Library patterns:
`context/library-docs.md`. Code standards: `context/code-standards.md`.

Read these before implementing: `src/components/meeting-intelligence/ChatPanel.tsx`,
`AiChatTab.tsx`, `MeetingTabs.tsx`, `CategoryTab.tsx`, `src/app/api/ai/chat/route.ts`,
`src/app/api/ai/process/route.ts`, `src/actions/follow-ups.ts`, `src/agent/models.ts`,
`constants/index.tsx`, `src/components/Sidebar.tsx`.

## Decisions carried (recommended, override if wrong)

- Category write = Server Action, not an API route. Mirrors `updateFollowUpStatus`
  in `src/actions/follow-ups.ts`: `auth()`, ownership via the user's meeting ids,
  `supabaseServer()` update of `meeting_insights.category`, `revalidatePath`.
- Quota check = a runnable script (`scripts/check-providers.ts`), not a route.
  Matches "check before the demo" use: `npx tsx scripts/check-providers.ts`.
- General `/ai-chat` = pure assistant with no RAG context (no meetingId). This
  keeps the polish small and does not overlap Layer 3 cross meeting search.
  Cross meeting RAG stays a Layer 3 feature.

## Feature 12 — General `/ai-chat` page

Today `/ai-chat` is a dead link: `constants/index.tsx:64` links to it,
`DashboardContent.tsx` pushes to it, and `middleware.ts` matches it, but no page
exists. `ChatPanel.tsx` already takes `meetingId` and is reusable.

Done when: visiting `/ai-chat` opens a working chat page (sidebar shell + a
ChatPanel with no meeting scope) that streams answers from the AI provider; the
two dead links in `DashboardContent.tsx` now resolve to a real page.

Build plan:
- `ChatPanel.tsx`: change prop to `meetingId?: string`. Compute
  `const chatId = meetingId ?? "general"`. Use `chatId` for `useChat({ id })`,
  `loadMessages`/`saveMessages`, and `sessionStorage` key. In the
  `DefaultChatTransport` `body`, include `meetingId` only when present.
- `src/app/api/ai/chat/route.ts`: make `meetingId` optional. When absent, skip
  the meeting ownership lookup and `retrieveContext`; use a general system
  prompt (helpful meeting/productivity assistant, no meeting grounding). When
  present, keep today's scoped RAG path exactly.
- `src/components/meeting-intelligence/AiChatTab.tsx` (or a new
  `GeneralChat.tsx`): a wrapper with the page heading and `ChatPanel` with no
  `meetingId`.
- `src/app/(root)/(home)/ai-chat/page.tsx`: mirror
  `src/app/(root)/(home)/settings/page.tsx` — `<Sidebar_Com type="aiChat" />`.
- `src/components/Sidebar.tsx`: add `"aiChat"` to `SidebarPagesTypes` and a case
  `{type === "aiChat" && <GeneralChat />}`.
- No token/style changes beyond the locked tokens already used by `ChatPanel`.

## Feature 13 — Change category write path

The Category tab (`CategoryTab.tsx`) is read only. `meeting_insights.category`
is written only at processing time. Add a way to change it.

Done when: on the Category tab a user can pick a new category from the same set
used at processing (Product, Engineering, Sales, Design, Operations, General),
save it, and the change persists in `meeting_insights` and survives a reload.

Build plan:
- New `src/actions/meetings.ts` (`"use server"` + `import "server-only"`):
  `updateMeetingCategory(meetingId, category)`. Validate `category` against the
  six allowed values. `auth()` → 401. Ownership check via the user's meeting
  ids (same pattern as `follow-ups.ts`). `supabaseServer()`
  `.from("meeting_insights").update({ category }).eq("meeting_id", meetingId)`.
  `revalidatePath("/meeting-intelligence/[id]")` (and the list). try/catch →
  `{ ok: false, error }`.
- `CategoryTab.tsx`: add a controlled `<select>` (the six categories) prefilled
  from `insights.category`, a Save button, and wire the save to
  `updateMeetingCategory` via `useTransition` + `react-hot-toast` (success and
  error). Keep the existing read only badge display as the current value.
- `src/lib/meeting-types.ts`: add a `MeetingCategory` union type for the six
  values and reuse it in the action and the select.

## Feature 14 — Groq date normalization guard

In `process/route.ts:101` the action item `due_date` is inserted as
`item.dueDate ?? null` with no guard. Groq free tier sometimes emits malformed
values (e.g. "October Friday") that fail the `date` column insert. Today this is
non fatal and only logged, but the guard should coerce plausible values to ISO
and null the rest, keeping the pipeline alive.

Done when: a malformed `dueDate` from the model results in `null` (logged) and
never throws or blocks the action items / follow ups insert; a valid
`YYYY-MM-DD` passes through unchanged.

Build plan:
- New `src/lib/normalize-date.ts`: `normalizeDueDate(raw: string | null |
  undefined): string | null`. Return `null` for empty/null. Try `new Date(raw)`;
  if valid and the year is in a sane range (2000 to 2100), return
  `YYYY-MM-DD`. Otherwise `console.warn` and return `null`. Keep it small and
  dependency free.
- `process/route.ts`: use `due_date: normalizeDueDate(item.dueDate)` at the
  action items insert. Never wrap this in a way that blocks the wider insert.
- This is server side only; no client code touches it.

## Feature 15 — AI provider quota pre demo check

Gemini free tier quota (20 req/day) was exhausted, so Groq carried the load.
Before the FYP demo we must confirm Gemini is live again, or know it is not.
This is a runnable check, not a UI feature.

Done when: `npx tsx scripts/check-providers.ts` probes both Gemini and Groq with
a 1 token call and prints each provider's status (live / failed), the model id,
and the error if any. Zero cost, server side only.

Build plan:
- New `scripts/check-providers.ts`: import `primaryModel`, `fallbackModel` from
  `src/agent/models.ts` and `generateText` from `ai`. For each, run a 1 token
  `generateText({ model, prompt: "ping", maxOutputTokens: 1 })` inside try/catch
  with a short timeout. Print a clear line per provider. Exit 0.
- Add an npm script `check:providers` in `package.json` running
  `tsx scripts/check-providers.ts` (add `tsx` to devDependencies if missing).
- Reuse the existing provider setup; add no second provider.

## Cross cutting rules

- No hardcoded hex or raw Tailwind color classes; use the locked tokens.
- Strict TypeScript, no `any`, small functions, explicit types.
- Every AI/provider call is wrapped in try/catch and degrades; never crash the
  run.
- Server keys and AI calls stay server side only.
- Do not touch unrelated files. No over engineering.

## Verification

1. `npx tsc --noEmit` is clean.
2. `npm run build` exits 0.
3. `npm run lint` is clean (if a lint script exists).
4. Manual: sign in, open `/ai-chat`, send a message, see a streamed reply.
5. Manual: open a meeting, Category tab, change category, reload, value persists.
6. Manual: run `npm run check:providers`, see both providers reported.
7. Re run the affected Playwright specs if any path changed.

## Test steps to share

- `/ai-chat` page loads and answers (general assistant, no meeting scope).
- Category tab edit saves and survives reload.
- `npm run check:providers` reports Gemini and Groq status.
- `npx tsc --noEmit` and `npm run build` pass.
