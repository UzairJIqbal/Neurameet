# Build Plan

Order matters — each step depends on the one before it being real, not assumed. Each step gets its own `/architect` pass (where noted), its own approved prompt in `prompts/`, and its own verification before moving on.

The plan is in three phases: Core NeuraMeet Pipeline (Steps 0 to 9, built), FYP Polish Pass (Step 9.5, built), and Advanced Pipeline Features (new, sequential Steps A0 to C3), followed by Deploy (Step 11). Every third party tool in every phase must be zero cost.

---

## Core NeuraMeet Pipeline (Steps 0 to 9, already built)

## Step 0 — Fix existing bugs (foundation)
- `middleware.ts` route matcher — add leading slashes, match real paths
- `stream.actions.ts` — fix `issued` timestamp calculation
- Remove duplicate `sonner` usage in favor of `react-hot-toast`
- `MeetingSetup.tsx` — fix missing `break` in the `music calls` switch case

## Step 0.5 — Auth system verification
Test-and-verify checkpoint. Do not proceed to Step 3.5 until this passes.

**Test matrix:**
- [ ] Sign-up flow — new user creation works end-to-end
- [ ] Sign-in flow — existing user authenticates successfully
- [ ] Sign-out — session cleared, redirect to public page
- [ ] Session persistence — close tab, reopen, still authenticated
- [ ] Protected route redirect (unauthenticated) — direct URL to `/dashboard` bounces to sign-in
- [ ] Protected route redirect (authenticated) — direct URL to `/`, `/sign-in`, `/sign-up` bounces to `/dashboard`
- [ ] OAuth flows — Google and/or GitHub sign-in work end-to-end
- [ ] Edge case: expired session — token refresh or graceful re-login
- [ ] Edge case: direct URL access while authenticated on public routes
- [ ] Middleware + client-side redirect both fire correctly (no double-redirect loops)

**Outcome:** All checkboxes pass → proceed to Step 3.5. Any failure → fix before moving on.

## Step 3.5 — Existing feature audit + redesign
Sequential, one-at-a-time verification + redesign. Do not batch features — each must pass both function and design checks before the next opens.

For each feature:
1. **Test** — confirm current implementation works functionally
2. **Fix** — resolve anything broken
3. **Redesign** — match `context/ui-tokens.md` + relevant `context/designs/*.png` (where a matching design exists). Same Design Fidelity Rule as the dashboard shell: no invented styling.
4. **Verify** — both function and design pass → close this feature, open the next.

**Features in order:**
1. Meeting Room — grid/speaker layouts, controls, participant list, end call
2. Meeting Setup — device/mic checks, audio type selection
3. New Meeting — modal creation flow
4. Join Meeting — modal join flow
5. Previous — past meetings list
6. Upcoming — scheduled meetings list
7. Recording — recording list
8. Personal Room — personal room page

> **Follow-up correction pass (Step 3.5 dashboard shell):** The dashboard was originally marked done in the "App Shell" sweep, but a later re-verification against `context/designs/dashboard.png` found it still didn't match — collapsed/icon-only sidebar, extra stat cards + an "upcoming meeting" section that aren't in the design, and the dark sidebar shell bleeding into the content area. These were corrected in a follow-up pass (expanded labeled sidebar, design-faithful DashboardContent, removed the dark-shell wrapper, relocated the Navbar). Treat "App Shell done" as provisional until each screen is explicitly re-verified against its `context/designs/*.png`.

## Step 1 — Supabase setup
- Create Supabase project (free tier)
- Enable `pgvector` extension
- Create tables: `meetings`, `transcripts`, `meeting_insights`, `action_items`, `follow_ups`, `meeting_chunks`
- Create `match_meeting_chunks` RPC function for similarity search
- Add `lib/supabase-client.ts` and `lib/supabase-server.ts`

## Step 2 — AI provider setup
- Install `ai`, `@ai-sdk/google`, `@ai-sdk/groq`
- Add `agent/models.ts` with Gemini primary + Groq fallback
- Verify both keys work with a trivial `generateText` call before building features on top

## Step 3 — Upload Transcript → AI Processing
- `POST /api/transcript/upload` — store transcript
- `POST /api/ai/process` — `generateObject` extraction (summary, key points, decisions, category, action items)
- Write results to `meeting_insights` and `action_items`
- Wire the existing "Upload Transcript" Quick Action card to this flow

## Step 4 — Meeting Intelligence UI
- Meeting List page (reads `meetings` + `meeting_insights`)
- Selected Meeting header + tabs: Overview, Summary, Action Items, Recording, Category
- Recording tab reads the Stream recording URL for that call

## Step 5 — RAG embeddings
- `POST /api/ai/embed` — chunk transcript, embed via Gemini embedding model, store in `meeting_chunks`
- Runs automatically right after Step 3's processing completes

## Step 6 — AI Chat (meeting-scoped + general)
- `POST /api/ai/chat` — streamed, retrieves top-k chunks via `match_meeting_chunks` when `meetingId` present
- `ChatPanel` component (AI SDK `useChat`), used in `AiChatTab` and general `/ai-chat`

## Step 7 — Follow-ups
- Auto-generate `follow_ups` rows from `action_items` after Step 3
- Follow-up List + Details pages, status update Server Action

## Step 8 — Recordings + Settings polish
- Recordings library page, linking each recording back to its meeting's insight page
- Settings page (basic preferences)

## Step 9 — Playwright regression pass
Full end-to-end regression. This is the final checkpoint, not the only one — Steps 0.5 and 3.5 catch issues earlier.
- Join meeting, upload transcript → insights appear, ask a question in AI Chat, mark a follow-up complete

## Step 9.5 — FYP Polish Pass (DONE)
Built this session. Features 12–15:
- **General `/ai-chat` page** — `src/app/(root)/(home)/ai-chat/page.tsx` + `src/components/meeting-intelligence/GeneralChat.tsx`; `ChatPanel.tsx` takes optional `meetingId` (general = pure assistant, no RAG); `Sidebar.tsx` gained the `aiChat` page type. API route `src/app/api/ai/chat/route.ts` accepts a missing `meetingId` and uses a general system prompt.
- **Change-category write path** — `src/actions/meetings.ts` (`updateMeetingCategory` Server Action, validates against `MEETING_CATEGORIES`, ownership check) + `src/components/meeting-intelligence/CategoryTab.tsx` rewritten to persist. `MEETING_CATEGORIES` / `MeetingCategory` added to `src/lib/meeting-types.ts`.
- **Groq date-normalization guard** — `src/lib/normalize-date.ts` (`normalizeDueDate` → null for empty/invalid, rejects NaN + years outside 2000–2100, never throws); `src/app/api/ai/process/route.ts` uses it before action-item insert.
- **AI provider quota pre-demo check** — `scripts/check-providers.mjs` (plain ESM, probes `google("gemini-flash-latest")` + `groq("llama-3.1-8b-instant")`); `package.json` gained `"check:providers": "node scripts/check-providers.mjs"`.
- **Deferred:** Oxylabs enrichment — requires a paid API, which violates the project's hard zero-cost rule. Intentionally not built.

## Advanced Pipeline Features (new — Steps A0 to C3)
Built after the Core Pipeline (Steps 0 to 9) and the FYP Polish Pass (Step 9.5). Every third party tool used here must be zero cost. Reuse the existing Gemini primary plus Groq fallback and the existing pgvector embeddings; add no second provider or vector store. Each step gets its own `/architect` pass where noted, its own approved prompt in `prompts/`, and its own verification before moving on.

### Layer 1 — UI functionality audit and repair (Steps A0–A6)
Audit first (A0) to enumerate every dead or non-functional control; then make each functional one step at a time. The three Settings toggles are the known case; the audit (A0) is the source of truth for how many A-steps exist.

#### Step A0 — Functional UI audit
- Walk the entire app (Dashboard, Meeting Room, Setup, Meeting Intelligence tabs, Follow-ups, Recordings, Settings, AI Chat, landing) and enumerate every control that is dead, no-op, or non-functional.
- **Audit complete (verified by reading every handler, not assumed).** The definitive list (source of truth for A1+):
  - **A1** — Settings "AI auto-summary on upload" toggle (`SettingsPage.tsx:62–95`): persists `aiAutoSummary` to `localStorage` (`neurameet:prefs`); nothing reads it, so it gates nothing.
  - **A2** — Settings "Email notifications" toggle (`SettingsPage.tsx:62–95`): persists `emailNotifications`; never read, no effect.
  - **A3** — Settings "Desktop reminders" toggle (`SettingsPage.tsx:62–95`): persists `desktopReminders`; never read, no effect.
  - **A4** — Dashboard "Meeting Intelligence → View All" link (`href="#"`, `DashboardContent.tsx:203`); Dashboard "Meeting Follow-ups → View All" link (`href="#"`, `DashboardContent.tsx:256`).
  - **A5** — Dashboard "Open Insights" buttons on meeting sample rows (`type="button"`, no `onClick`, `DashboardContent.tsx:237`) + "View Task"/"Review" follow-up CTA buttons on follow-up sample rows (no `onClick`, `DashboardContent.tsx:283`). Both are dead dashboard sample-row buttons → fold into one step.
  - **A6** — Dashboard global "Search anything…" input (`type="text"`, no `onChange`/`onSubmit`/`onKeyDown` handler, `DashboardContent.tsx:158–162`).
  - **A7** — Landing footer dead links (15× `href="#"`): Integrations, Changelog, Documentation, API Reference, Blog, Community, About, Careers, Contact, Partners, Twitter, LinkedIn, GitHub, Privacy Policy, Terms of Service (`LandingFooter.tsx:16–38, 64–85, 114–125`). New finding from the fresh walk.
  - **Excluded after review:** Dashboard Bell button (`DashboardContent.tsx:173–178`) — decorative status indicator, not a control.
- Each finding below is its own step. A7 was added by the audit; no step is skipped.

#### Step A1 — Make "AI auto-summary on upload" toggle functional
- `/architect` first (decision: mechanism + where the pref lives).
- Decide the zero-cost mechanism: read the pref (`localStorage` `neurameet:prefs` today, or a server-backed user-prefs row if one is added) and gate the Upload Transcript flow on it.
- When OFF: `UploadTranscriptModal` stores the transcript but skips `POST /api/ai/process` + `POST /api/ai/embed` (no summary / action items / category, no chunks). When ON: current behavior (process + embed).
- Persist the toggle state; reflect it on load. No new paid service.
- **Verification:** toggle OFF → upload → meeting appears in Meeting Intelligence WITHOUT insights/chunks (verify `meeting_insights` + `meeting_chunks` empty for that meeting); toggle ON → full processing runs. `npx tsc --noEmit` clean, `npm run build` exit 0.

#### Step A2 — Make "Email notifications" toggle functional
- `/architect` first — THE decision step: what zero-cost email path is feasible (e.g. a Supabase edge function using `auth.email()`, a free-tier transactional provider, or a Clerk webhook). Must stay zero cost — no new paid API.
- Implement the chosen mechanism so that, when ON, the user is emailed when a meeting finishes processing (summary ready). When OFF, no email.
- Server-side only: email send goes through an API route / Server Action with the service-role client; no keys in the browser.
- **Verification:** toggle ON → complete an upload→process → confirm the email arrives (or the chosen channel fires); toggle OFF → confirm it does not. `npx tsc --noEmit` clean, `npm run build` exit 0.

> **Out-of-sequence Resilience Pass (between A2 and A3) — deliberate, not an accident.** A graceful-degradation audit was run and two fixes landed here: **G1** (root error boundary — `src/app/error.tsx`) and **G2** (surface embedding failure in the upload flow instead of failing silently). The original plan was to do this at **Step 10/11 (pre-deploy hardening)**, but it was pulled earlier **on purpose**: Layers 1–3 (Auto Attendance, AI engagement intelligence) build directly on top of the app and should inherit the safer foundation now, so demo/edge-case failures (blank Stream crash, silent no-RAG loop) are caught early rather than discovered at deploy. This does **not** renumber any A/B/C step.

#### Step A3 — Make "Desktop reminders" toggle functional
- `/architect` first (decision: browser Notification API + a periodic check against the user's Upcoming meetings; or a Stream call-start event).
- When ON: request Notification permission and surface a browser notification at/near the start of each scheduled (Upcoming) meeting. When OFF: no reminders requested.
- Pure client-side, zero cost, reuses existing Upcoming data; no new provider.
- **Verification:** toggle ON → grant permission → a scheduled meeting produces a browser notification at its start time (simulate against an Upcoming row); toggle OFF → no notification. `npx tsc --noEmit` clean, `npm run build` exit 0.

#### Step A4 — Fix dead Dashboard "View All" links
- Both "Meeting Intelligence → View All" and "Meeting Follow-ups → View All" currently point to `href="#"`.
- Repoint to real routes: `/meeting-intelligence` and `/follow-ups` (Next `<Link>`, not a raw anchor).
- Zero cost, no data dependency.
- **Verification:** click each → correct page loads. `npx tsc --noEmit` clean, `npm run build` exit 0.

#### Step A5 — Make Dashboard "Open Insights" buttons functional
- Sample meeting rows render "Open Insights" `type="button"` with no handler.
- Scope note: Dashboard meetings are still hardcoded sample data (a separate deferred data-wiring task). Minimum zero-cost fix this step: route each "Open Insights" button to `/meeting-intelligence` (the real list) via `router.push`. If the Dashboard is wired to live data first, route to `/meeting-intelligence/[id]` instead.
- **Verification:** clicking "Open Insights" navigates to the Meeting Intelligence list (or the specific meeting when live data lands). `npx tsc --noEmit` clean, `npm run build` exit 0.

#### Step A6 — Make Dashboard global search functional
- "Search anything…" input has no submit/filter handler.
- Scope a zero-cost effect: on Enter/submit, route to a search results view or filter the visible Meeting Intelligence list. Decide the exact behavior in a short `/architect` pass; keep it small (no new backend unless required).
- **Verification:** typing + submit produces the intended navigation/filter. `npx tsc --noEmit` clean, `npm run build` exit 0.

#### Step A7 — Fix landing footer dead links
- The landing footer (`LandingFooter.tsx`) has 15 `href="#"` links: Product (Integrations, Changelog), Resources (Documentation, API Reference, Blog, Community), Company (About, Careers, Contact, Partners), social icons (Twitter, LinkedIn, GitHub), Privacy Policy, Terms of Service.
- Decide the zero-cost fix per link: point real ones to existing routes/pages (e.g., `#features`/`#pricing` already scroll to landing sections — keep or wire), and remove or replace the rest with real destinations or drop them. No new backend. Keep the zero-cost rule; do not add a CMS.
- **Verification:** every footer link resolves to a real in-app route or is removed (no `href="#"` remains). `npx tsc --noEmit` clean, `npm run build` exit 0.

### Layer 2 — Auto Attendance (Steps B0–B5)
Track participant join/leave/mic/camera events in live meetings (Stream Video SDK, zero cost), persist to Supabase, and emit a downloadable PDF attendance report per meeting from the Overview tab. PDF library must be free/zero cost.

#### Step B0 — Architect: attendance data model + PDF library decision
- `/architect` first. Decide `attendance_events` schema (columns below are a starting point, confirmed at B1): `id`, `meeting_id` (fk `meetings`), `user_id` (Clerk id), `participant_email`, `session_started_at`, `session_ended_at`, `talk_time_seconds`, `mic_toggles`, `camera_toggles`. One row per join session per participant.
- Decide the zero-cost PDF library (client-side `jsPDF` / `@react-pdf/renderer`, or a server-side generator) — must be free, no paid PDF service.
- Confirm the Stream SDK event hooks available in `src/actions/stream.actions.ts` / `src/Providers/` for join, leave, mic, camera.
- Output: the approved prompt + final schema in `prompts/` before B1.

#### Step B1 — Supabase schema (attendance_events table)
- Add `attendance_events` to `supabase/schema.sql` (`CREATE TABLE IF NOT EXISTS`) + index on `(meeting_id)`.
- Run in Supabase SQL Editor; grant `service_role` perms (mirror the existing GRANT block).
- Enable the table in the server client only.
- **Verification:** table exists; a manual insert + select succeeds. `npx tsc --noEmit` clean, `npm run build` exit 0.

#### Step B2 — Stream SDK event tracking (join/leave/mic/camera → DB)
- Subscribe to call lifecycle + participant events in the Stream wrapper; on join/leave/mic-toggle/camera-toggle, write/update the matching `attendance_events` row via an API route (server-side, service-role) — never from the browser directly.
- Aggregate per session: join → open row; leave → close row + compute talk time; mic/camera toggles → increment counters. Handle reconnects (close + reopen a session row).
- **Verification:** join a meeting, toggle mic/camera, leave → one row per session with correct timings + toggle counts. `npx tsc --noEmit` clean, `npm run build` exit 0.

#### Step B3 — PDF generation logic
- Implement attendance report generation (chosen library from B0): one row per join session per participant (email, join time, leave time, talk time, mic + camera toggle counts) for a given `meeting_id`.
- Server-side if the library supports it; otherwise client-side from data fetched via an API route. Zero cost, no external service.
- **Verification:** given seeded `attendance_events` rows, the generator produces a correct PDF (all columns present, counts accurate).

#### Step B4 — Download button + wiring on Overview tab
- Add a "Download attendance report" control on the Meeting Overview tab (Meeting Intelligence → selected meeting → Overview).
- Fetch the meeting's attendance rows (user-scoped) and trigger the B3 generator/download.
- **Verification:** on a meeting with attendance data, the button downloads a correct PDF; on a meeting with none, it shows the empty/disabled state gracefully. `npx tsc --noEmit` clean, `npm run build` exit 0.

#### Step B5 — Verify end-to-end
- Full loop: join meeting (live or simulated) → toggle mic/camera → leave → Overview tab → download PDF → verify contents match events.
- Playwright or manual click-through (Clerk OAuth may require manual driving). Confirm zero-cost path holds. `npx tsc --noEmit` clean, `npm run build` exit 0.

### Layer 3 — AI engagement intelligence (Steps C1–C3, reuse Gemini/Groq/pgvector)
No new provider or vector store. Each feature is its own build-verify cycle.

#### Step C1 — Cross-Meeting Search
- Build a search over the user's meetings using existing `meeting_chunks` embeddings (pgvector similarity). One UI entry (e.g. on the Meeting Intelligence list or AI Chat) that takes a query, embeds it, runs `match_meeting_chunks` across the user's meetings, and returns ranked matching meetings/snippets.
- Server-side embedding + similarity only (reuse `agent/rag.ts` patterns); user-scoped.
- **Verification:** a query returns the correct meetings + quoted chunks; cross-meeting ranking is sensible. `npx tsc --noEmit` clean, `npm run build` exit 0.

#### Step C2 — Meeting Prep Suggestions
- Given a meeting about to start (or its title/agenda), surface suggestions from past related meetings: retrieve related meetings via embeddings/keywords, then use Gemini (fallback Groq) to summarize relevant context, open action items, and prep notes.
- Reuses existing embeddings + AI SDK; user-scoped; server-side generation.
- **Verification:** opening prep for a meeting returns grounded suggestions drawn from past related meetings. `npx tsc --noEmit` clean, `npm run build` exit 0.

#### Step C3 — Speaker Engagement Insights
- Per-speaker engagement from transcript chunks (speaker labels if present), attendance (talk time), and the existing AI setup. Compute/summarize who spoke, how much, key contributions, and flag low-engagement participants.
- Reuses `meeting_chunks` + `attendance_events` (B1) + AI SDK; user-scoped; server-side.
- **Verification:** a meeting with transcript + attendance yields per-speaker insights; low-engagement speakers are flagged. `npx tsc --noEmit` clean, `npm run build` exit 0.

---

## Step 11 — Deploy, then polish and harden
- Deploy to Vercel (free tier)
- Verify every navigation path, loading state, error state, and that no secret leaks to the client bundle
- Confirm all AI/DB usage stays within Supabase and Gemini/Groq free-tier limits

---

Each step = one short prompt naming the relevant skills, one AI-written plan in `prompts/`, one approval, one implementation, one verification — per the Vibe Engineering loop.
