# Progress Tracker

Updated after every feature. Current state as of this rewrite.

---

## Done — Core NeuraMeet Pipeline (Steps 0 to 9)

- ✅ **Step 0** — Bug fixes: `middleware.ts` matcher paths, `stream.actions.ts` `issued` timestamp (`Date.now()/1000`), `MeetingSetup.tsx` switch fallthrough, `sonner` fully removed (`react-hot-toast` only).
- ✅ **Step 0.5** — Auth system verification: 20/20 Playwright tests passing (protected redirects, sign-in/out, OAuth, edge cases). CAPTCHA added; `/verify-email` flow built. Email verification disabled in Clerk dev (re-enable before production).
- ✅ **Step 3.5** — Feature audit + redesign (8 features, sequential): Meeting Room, Meeting Setup, New Meeting, Join Meeting (`/join-meeting` page), Previous/Upcoming/Recording (light list redesign), Personal Room (light detail). Dashboard re-verified against `context/designs/dashboard.png` and corrected (expanded labeled sidebar, light content shell, navbar relocated). Sidebar wired to all real routes. All locked tokens, `tsc` clean, build green.
- ✅ **Step 1** — Supabase free-tier project + `pgvector`, all 6 tables + `match_meeting_chunks` RPC, `lib/supabase-client.ts` + `lib/supabase-server.ts` (server hardened with `server-only`). `service_role` GRANTs added to `schema.sql`.
- ✅ **Step 2** — `ai` / `@ai-sdk/google` / `@ai-sdk/groq` + `zod` installed; `src/agent/models.ts` (`google("gemini-flash-latest")` primary + `groq("llama-3.1-8b-instant")` fallback + `withFallback`); both verified live.
- ✅ **Step 3** — Upload Transcript → AI Processing. Fixed `stream_call_id` unique-not-null crash; modal retokened; success redirect → `/meeting-intelligence/[id]`. Verified end-to-end (Clerk sign-in → upload → insights land). Root cause of original failure: `service_role` lacked table perms — fixed via GRANT block.
- ✅ **Step 4** — Meeting Intelligence UI: `GET /api/meetings` + `GET /api/meetings/[id]` (user-scoped), list + detail + 5 tabs (Overview, Summary, Action Items, Recording, Category). `tsc` + build green.
- ✅ **Step 5** — RAG embeddings: `src/agent/embed.ts` (chunk + Gemini `gemini-embedding-001` pinned 768-dim) + `POST /api/ai/embed` (ownership-checked). Upload → process → embed wired. Groq has no embedding model (Gemini-only).
- ✅ **Step 6** — AI Chat (scoped tab): `src/agent/rag.ts` (`retrieveContext` + `buildSystemPrompt`), `resolveChatModel()` probe-then-pick (Gemini → Groq), `POST /api/ai/chat` (`toUIMessageStreamResponse`), `ChatPanel.tsx` + `AiChatTab.tsx`. `tsc` + build green. General `/ai-chat` deferred to 9.5.
- ✅ **Step 7** — Follow-ups: auto-generated from action items in `process` route; read routes user-scoped; `updateFollowUpStatus` Server Action; `FollowUpList` + `FollowUpDetails` + pages. CRITICAL fix: embedded to-one Supabase relations return an **object** at runtime (`first<T>(rel)` helper added). Manual backfill SQL provided.
- ✅ **Step 8** — Recordings library polish (`View insights` button) + Settings page (`src/components/SettingsPage.tsx`, Account + Preferences with 3 `localStorage` toggles — non-functional, fixed in Advanced A1–A3).
- ✅ **Step 9** — Playwright E2E regression: 25 passed (1 setup + 4 authed e2e + 20 unauth). Surfaced + fixed `/api/ai/process` Groq `response_format: json_schema` rejection → `generateStructuredWithFallback` + `providerOptions.groq.structuredOutputs: false`.

## Done — Step 9.5 (FYP Polish Pass)

- ✅ General `/ai-chat` page + `GeneralChat.tsx`; `ChatPanel` takes optional `meetingId`; `Sidebar` `aiChat` type.
- ✅ Change-category write path: `updateMeetingCategory` Server Action + `CategoryTab.tsx` persist; `MEETING_CATEGORIES` / `MeetingCategory` in `meeting-types.ts`.
- ✅ Groq date-normalization guard: `src/lib/normalize-date.ts` (`normalizeDueDate`) used before action-item insert.
- ✅ AI provider quota pre-demo check: `scripts/check-providers.mjs` + `npm run check:providers`.
- ⬜ **Deferred:** Oxylabs enrichment — requires a paid API, violates the zero-cost rule. Intentionally not built.

## Pending — Advanced Pipeline Features (Steps A0 to C3)

- ⬜ **Step A0** — Functional UI audit: **DONE (verified)**. Canonical dead-control list: 3 Settings toggles (`aiAutoSummary`/`emailNotifications`/`desktopReminders` — `localStorage` only, gate nothing → A1/A2/A3), 2 dead Dashboard "View All" `href="#"` links (→ A4), dead Dashboard "Open Insights" + follow-up CTA buttons (no `onClick` → A5), dead Dashboard global search input (no handler → A6), 15 landing footer `href="#"` links (→ A7). Bell button excluded (decorative). Full list in `build-plan.md` A0 section.
- ✅ **Step A1** — Make "AI auto-summary on upload" toggle functional: `src/lib/user-prefs.ts` (shared `PREFS_KEY`/`UserPrefKey`/`readUserPrefs`), `SettingsPage` uses the shared key, `UploadTranscriptModal` skips `/api/ai/process` + `/api/ai/embed` when OFF (store-only upload, still redirects). `tsc` clean, `npm run build` exit 0.
- ✅ **Step A2** — Make "Email notifications" toggle functional: `src/lib/email.ts` (server-only Resend helper, non-fatal, key in `RESEND_API_KEY` server env), `/api/ai/process` accepts `emailNotifications`, resolves recipient via Clerk `currentUser()` + meeting title, sends "summary ready" email on success, returns `emailSent`. `UploadTranscriptModal` passes the pref. Precedent: **Resend free tier approved as a zero-cost tool** (no card required) — recorded in AGENTS.md zero-cost clarification so future steps don't re-litigate. `tsc` clean, `npm run build` exit 0.
- ✅ **Resilience Pass — G1 (root error boundary) + G2 (embed-failure surfacing)** — Out-of-sequence, deliberate (see build-plan.md note between A2 and A3). **G1:** added `src/app/error.tsx` root-segment `"use client"` boundary so a `StreamClientProvider` mount throw (`app/(root)/layout.tsx` throws synchronously in `useEffect` when `NEXT_PUBLIC_STREAM_API_KEY` is missing/invalid) or any authenticated-app render throw shows a friendly "Something went wrong / Try again / Back to home" fallback instead of white-screening. Single root file is sufficient (a segment's `error.tsx` does NOT catch its own layout throw; the boundary lives in the parent root segment, which wraps the nested `(root)` layout). **G2:** `src/components/UploadTranscriptModal.tsx` now tracks `embedFailed` around `/api/ai/embed` and shows a warning toast ("Meeting processed, but AI chat indexing failed. Re-upload the transcript to enable AI chat.") instead of silently leaving the user in a misleading "upload a transcript first" loop; redirect still happens so summary/action items stay usable. Both `tsc` clean, `npm run build` exit 0; manual G1/G2 confirmed working. Residual (G2): chat tab still shows the generic no-context message for a failed-embed meeting — distinguishing needs DB state, deferred follow-up.
- ⬜ **Step A3** — Make "Desktop reminders" toggle functional (`/architect` first; browser Notification API vs Stream event).
- ⬜ **Step A4** — Fix dead Dashboard "View All" links → `/meeting-intelligence` + `/follow-ups`.
- ⬜ **Step A5** — Make Dashboard "Open Insights" buttons functional (route to MI list; `/meeting-intelligence/[id]` once Dashboard is on live data).
- ⬜ **Step A6** — Make Dashboard global search functional (decide zero-cost effect in short `/architect`).
- ⬜ **Step A7** — Fix landing footer dead links (`LandingFooter.tsx`, 15× `href="#"` → real routes or removed).
- ⬜ **Step B0** — Architect: `attendance_events` data model + zero-cost PDF library decision.
- ⬜ **Step B1** — Supabase `attendance_events` schema (add to `schema.sql` + GRANT).
- ⬜ **Step B2** — Stream SDK event tracking (join/leave/mic/camera → `attendance_events` via API route).
- ⬜ **Step B3** — PDF generation logic (one row per join session per participant).
- ⬜ **Step B4** — Download button + wiring on Overview tab.
- ⬜ **Step B5** — Verify Auto Attendance end-to-end.
- ⬜ **Step C1** — Cross-Meeting Search (over existing `meeting_chunks` embeddings).
- ⬜ **Step C2** — Meeting Prep Suggestions (from past related meetings).
- ⬜ **Step C3** — Speaker Engagement Insights (transcript + attendance + AI).

## Pending — Deploy

- ⬜ **Step 11** — Deploy to Vercel free tier + harden (re-enable Clerk email verification, verify every path, confirm no secret leaks, confirm free-tier limits).

## Key Decisions Locked

- Backend/data/vector store: **Supabase** (Postgres + pgvector) — not InsForge, not a separate vector DB
- AI models: **Gemini** (primary) + **Groq** (fallback) — both free tier, no paid APIs anywhere
- No FastAPI/Python — Next.js API routes own all AI/agent logic
- Testing: Playwright for final regression; per-feature verification at Step 0.5 and 3.5 are primary checkpoints
- Oxylabs enrichment stays deferred — requires a paid API, violates the zero-cost rule
- Supabase: created as a brand-new free-tier project from scratch
- **Zero-cost rule (explicit):** every third party tool in every phase — including all new Advanced features — must be zero cost. Only the free tiers already in use (Supabase, Gemini, Groq, Vercel, Stream, Clerk). Reuse the existing Gemini + Groq + pgvector setup; add no second provider, vector store, paid PDF service, or paid API.
- **Resend free tier approved (A2 precedent):** a free-tier third-party tool requiring no payment method (Resend, 3k emails/mo) is acceptable on the same standard as the named free tiers — not a "paid API", and an email-only delivery service is not a second AI/vector provider. Precedent clarified in AGENTS.md; do not re-litigate for future steps.

## Dev-Only Settings

- **Clerk email verification disabled for dev** — in Clerk Dashboard → User & Authentication → Email, "Verify at sign-up" is OFF to speed up dev sign-up testing. **MUST be re-enabled before the Step 11 production deploy.** (The `/verify-email` code already supports it — config-only, no code change.)

## Next Action

**Next action: Step A3 — Make "Desktop reminders" toggle functional (Advanced Pipeline, Layer 1).** A0 audit recorded; A1 + A2 done. A3 needs its own `/architect` pass — decide browser Notification API + periodic check against Upcoming meetings vs a Stream call-start event. A4–A7 are smaller, well-scoped fixes. Each step gets its own verification (`tsc` + `build` + the per-step check). Hard rule: every third party tool must be zero cost, reusing the existing Gemini + Groq + pgvector setup (Resend free tier already approved as the email tool per the A2 precedent).
