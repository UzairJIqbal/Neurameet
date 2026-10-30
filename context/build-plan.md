# Build Plan

Order matters — each step depends on the one before it being real, not assumed. Each step gets its own `/architect` pass (where noted), its own approved prompt in `prompts/`, and its own verification before moving on.

The plan is in these phases: Core NeuraMeet Pipeline (Steps 0 to 9, built), FYP Polish Pass (Step 9.5, built), Advanced Pipeline Features (Steps A0 to C3, built), **Meeting Experience Polish (Steps D0 to D3+, built, before Deploy)**, **Transcript Generation (Steps F0 to F8, built, before Deploy)**, **Guest Join with Owner Approval (Steps G0 to G1.5, G2 to G4, G8 integration audit, G9 manual walkthrough, new, before Deploy)**, Product Final Polishing (Steps P0 to P13), **Signature Feature: Promise Ledger (Steps S0+, new, before Deploy)**, then Deploy (Step 11). Every third party tool in every phase must be zero cost.

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
- **AI provider quota pre-demo check** — `scripts/check-providers.mjs` (plain ESM, probes `google("gemini-flash-latest")` + `groq("openai/gpt-oss-20b")`); `package.json` gained `"check:providers": "node scripts/check-providers.mjs"`.
- **Deferred:** Oxylabs enrichment — requires a paid API, which violates the project's hard zero-cost rule. Intentionally not built.
- **AI Chat personalization (Clerk identity + Stream/meeting data)** — The general assistant in `POST /api/ai/chat` now injects the signed-in user's real context so it answers "who am I", "what is my email", "how many meetings/recordings" instead of claiming no access. Identity comes from Clerk `currentUser()` (name + primary email); meetings from Supabase (`meetings`, user-scoped, with a per-status count summary so the model does not miscount the truncated list); recordings from Stream via a new shared helper `src/lib/recordings.ts` (`getUserRecordings`, also used by `/api/recordings`), fetched lazily only when the message mentions "record" to keep normal chat fast. All lookups isolated in try/catch. `tsc` clean, `npm run build` exit 0.

## Advanced Pipeline Features (new — Steps A0 to C3)
Built after the Core Pipeline (Steps 0 to 9) and the FYP Polish Pass (Step 9.5). Every third party tool used here must be zero cost. Reuse the existing Gemini primary plus Groq fallback and the existing pgvector embeddings; add no second provider or vector store. Each step gets its own `/architect` pass where noted, its own approved prompt in `prompts/`, and its own verification before moving on.

### Layer 1 — UI functionality audit and repair (Steps A0–A6)
Audit first (A0) to enumerate every dead or non-functional control; then make each functional one step at a time. The three Settings toggles are the known case; the audit (A0) is the source of truth for how many A-steps exist.

#### Step A0 — Functional UI audit
- Walk the entire app (Dashboard, Meeting Room, Setup, Meeting Intelligence tabs, Follow-ups, Recordings, Settings, AI Chat, landing) and enumerate every control that is dead, no-op, or non-functional.
- **Audit complete (verified by reading every handler, not assumed).** The definitive list (source of truth for A1+):
  - **A1** ✅ DONE — Settings "AI auto-summary on upload" toggle (`SettingsPage.tsx:62–95`): persists `aiAutoSummary` to `localStorage` (`neurameet:prefs`); nothing reads it, so it gates nothing. *(Made functional — see Step A1.)*
  - **A2** ✅ DONE — Settings "Email notifications" toggle (`SettingsPage.tsx:62–95`): persists `emailNotifications`; never read, no effect. *(Made functional — see Step A2.)*
  - **A3** ✅ DONE — Settings "Desktop reminders" toggle (`SettingsPage.tsx:62–95`): persists `desktopReminders`; never read, no effect. *(Made functional — see Step A3.)*
  - **A4** ✅ DONE — Dashboard "Meeting Intelligence → View All" link (`href="#"`, `DashboardContent.tsx:203`); Dashboard "Meeting Follow-ups → View All" link (`href="#"`, `DashboardContent.tsx:256`). *(Fixed — see Step A4.)*
  - **A5** ✅ DONE — Dashboard "Open Insights" buttons on meeting sample rows (`type="button"`, no `onClick`, `DashboardContent.tsx:237`) + "View Task"/"Review" follow-up CTA buttons on follow-up sample rows (no `onClick`, `DashboardContent.tsx:283`). Both are dead dashboard sample-row buttons → fold into one step. *(Fixed + Dashboard now on LIVE data so they route to detail pages — see Step A5.)*
  - **A6** ✅ DONE — Dashboard global "Search anything…" input (`type="text"`, no `onChange`/`onSubmit`/`onKeyDown` handler, `DashboardContent.tsx:158–162`).
  - **A7** ✅ DONE — Landing footer dead links (15× `href="#"`): Integrations, Changelog, Documentation, API Reference, Blog, Community, About, Careers, Contact, Partners, Twitter, LinkedIn, GitHub, Privacy Policy, Terms of Service (`LandingFooter.tsx:16–38, 64–85, 114–125`). New finding from the fresh walk.
  - **Excluded after review:** Dashboard Bell button (`DashboardContent.tsx:173–178`) — decorative status indicator, not a control.
- Each finding below is its own step. A7 was added by the audit; no step is skipped.

#### Step A1 — Make "AI auto-summary on upload" toggle functional
- `/architect` first (decision: mechanism + where the pref lives).
- Decide the zero-cost mechanism: read the pref (`localStorage` `neurameet:prefs` today, or a server-backed user-prefs row if one is added) and gate the Upload Transcript flow on it.
- When OFF: `UploadTranscriptModal` stores the transcript but skips `POST /api/ai/process` + `POST /api/ai/embed` (no summary / action items / category, no chunks). When ON: current behavior (process + embed).
- Persist the toggle state; reflect it on load. No new paid service.
- **Verification:** toggle OFF → upload → meeting appears in Meeting Intelligence WITHOUT insights/chunks (verify `meeting_insights` + `meeting_chunks` empty for that meeting); toggle ON → full processing runs. `npx tsc --noEmit` clean, `npm run build` exit 0.
- **✅ DONE (committed `1b4e867`):** implemented per the prompt in `prompts/step-A1-auto-summary-toggle.md`; `UploadTranscriptModal` skips `POST /api/ai/process` + `POST /api/ai/embed` when OFF, still redirects. `tsc` + `build` green.

#### Step A2 — Make "Email notifications" toggle functional
- `/architect` first — THE decision step: what zero-cost email path is feasible (e.g. a Supabase edge function using `auth.email()`, a free-tier transactional provider, or a Clerk webhook). Must stay zero cost — no new paid API.
- Implement the chosen mechanism so that, when ON, the user is emailed when a meeting finishes processing (summary ready). When OFF, no email.
- Server-side only: email send goes through an API route / Server Action with the service-role client; no keys in the browser.
- **Verification:** toggle ON → complete an upload→process → confirm the email arrives (or the chosen channel fires); toggle OFF → confirm it does not. `npx tsc --noEmit` clean, `npm run build` exit 0.
- **✅ DONE (committed `1b4e867`):** Resend free-tier email helper (`src/lib/email.ts`, server-only, non-fatal) + `/api/ai/process` sends a "summary ready" email on success when the pref is ON; `UploadTranscriptModal` passes the pref. Resend free tier approved as a zero-cost tool (no card) — recorded in AGENTS.md, do not re-litigate. `tsc` + `build` green.

> **Out-of-sequence Resilience Pass (between A2 and A3) — deliberate, not an accident.** A graceful-degradation audit was run and two fixes landed here: **G1** (root error boundary — `src/app/error.tsx`) and **G2** (surface embedding failure in the upload flow instead of failing silently). The original plan was to do this at **Step 10/11 (pre-deploy hardening)**, but it was pulled earlier **on purpose**: Layers 1–3 (Auto Attendance, AI engagement intelligence) build directly on top of the app and should inherit the safer foundation now, so demo/edge-case failures (blank Stream crash, silent no-RAG loop) are caught early rather than discovered at deploy. This does **not** renumber any A/B/C step.
> **✅ Resilience Pass DONE (committed `434e5ff`, branch `fix/graceful-degradation-g1-g2`):** G1 + G2 verified working; `tsc` + `next build` green. (Continued in later commits on the same branch: Meeting Setup device-permission bugfixes, Schedule Meeting modal fixes, A3 verification, A4/A5 dead-control cleanup, Dashboard live data + 3-cap refinement — all committed; branch unpushed per user instruction.)

- ✅ **Resilience fix (same branch `fix/graceful-degradation-g1-g2`) — Stream client connects on mount + call-list error surfaced.** `src/Providers/StreamClientProvider.tsx` calls `client.connectUser(...)` on client creation so `queryCalls` (used by Upcoming/Previous/Reminders via `useGetCall`) no longer hangs until the 5s axios timeout on dashboard pages where no call is joined. `UpcomingPage.tsx` + `PreviousPage.tsx` now `toast.error` the `useGetCall` error (matching other list screens); `ReminderManager` stays console-only by design. Regression: `tests/connection.spec.ts` + `chromium-connection` Playwright project. `tsc` + `build` green.

#### Step A3 — Make "Desktop reminders" toggle functional
- `/architect` first (decision: browser Notification API + a periodic check against the user's Upcoming meetings; or a Stream call-start event).
- When ON: request Notification permission and surface a browser notification at/near the start of each scheduled (Upcoming) meeting. When OFF: no reminders requested.
- Pure client-side, zero cost, reuses existing Upcoming data; no new provider.
- **Verification:** toggle ON → grant permission → a scheduled meeting produces a browser notification at its start time (simulate against an Upcoming row); toggle OFF → no notification. `npx tsc --noEmit` clean, `npm run build` exit 0.
- **✅ DONE (committed `1b4e867`) + fully verified end-to-end:** `ReminderManager.tsx` polls `upcomingCalls` (~30s) and fires a Web Notification in the lead window (dedup via `sessionStorage`); `SettingsPage` requests permission on the toggle gesture; denied-permission path shows a clear `toast.error`. Verifiable because Schedule Meeting is reachable from the Dashboard (A3 review fix). `tsc` + `build` green.

#### Step A4 — Fix dead Dashboard "View All" links
- Both "Meeting Intelligence → View All" and "Meeting Follow-ups → View All" currently point to `href="#"`.
- Repoint to real routes: `/meeting-intelligence` and `/follow-ups` (Next `<Link>`, not a raw anchor).
- Zero cost, no data dependency.
- **Verification:** click each → correct page loads. `npx tsc --noEmit` clean, `npm run build` exit 0.
- **✅ DONE (committed `1b4e867`):** both "View All" links are real `next/link` routes in `DashboardContent.tsx` (`/meeting-intelligence`, `/follow-ups`). Orphan cleanup folded in here: deleted `HomeCard.tsx` + `MeetingTypeLists.tsx` (imported nowhere) and the now-dead `meetingCardDetails` array + `MeetingCard` type in repo-root `constants/index.tsx`; quick-actions grid bumped `lg:grid-cols-4` → `lg:grid-cols-5`. `tsc` + `build` green.

#### Step A5 — Make Dashboard "Open Insights" buttons functional
- Sample meeting rows render "Open Insights" `type="button"` with no handler.
- Scope note: Dashboard meetings were hardcoded sample data (a separate deferred data-wiring task). That data-wiring task is **now DONE** (see "Dashboard live data" below), so the buttons route to the specific meeting: `router.push("/meeting-intelligence/[id]")`. Follow-up CTA buttons ("View Task"/"Review") route to `router.push("/follow-ups/[id]")`.
- **Verification:** clicking "Open Insights" navigates to the specific meeting's detail page; follow-up CTA → the follow-up detail page. `npx tsc --noEmit` clean, `npm run build` exit 0.
- **✅ DONE (committed `1b4e867`):** "Open Insights" → `/meeting-intelligence/[id]`; follow-up CTA → `/follow-ups/[id]`. Landed together with the Dashboard live-data step (real IDs now exist). `tsc` + `build` green.

#### Dashboard live data (the deferred data-wiring task referenced by A5)
- The Dashboard was the last authenticated screen still on hardcoded sample data (a `meetings` array of Sprint Planning / Client Discussion / Weekly Standup + a `followUps` array, a fake "Uzair" greeting, and fixed counts). Every other product screen already read real, user-scoped data.
- **Done (committed `1b4e867`):** `DashboardContent.tsx` now fetches client-side in a `useEffect` via `Promise.all([fetch("/api/meetings"), fetch("/api/follow-ups")])` (both user-scoped via Clerk) with a shared `isLoading` flag + `<LoaderOne />` and empty states ("No meetings yet." + Upload CTA; "No follow-ups yet."). Greeting uses Clerk `useUser()` first name + time-of-day; summary counts derive from the data (meetings "today" + open follow-ups). Both panels capped at the latest **3** items; "View All" → the full lists. Meeting Follow-ups panel unified to the same 12-col row style as Meeting Intelligence (icon + title/source, due-date meta, "Open" → `/follow-ups/[id]`). Landing-page marketing mockups (`MeetingHistory.tsx`, `LandingHero.tsx`) intentionally left as public showcases. Prompt: `prompts/step-live-dashboard-data.md`. `tsc` + `build` green.

#### Step A6 — Make Dashboard global search functional
- "Search anything…" input has no submit/filter handler.
- Scope a zero-cost effect: on Enter/submit, route to a search results view or filter the visible Meeting Intelligence list. Decide the exact behavior in a short `/architect` pass; keep it small (no new backend unless required).
- **Verification:** typing + submit produces the intended navigation/filter. `npx tsc --noEmit` clean, `npm run build` exit 0.
- **✅ DONE (this branch):** the "Search anything…" input is a controlled, live-filtering search over the dashboard's already-fetched `meetings` + `followUps` (no route/backend, zero cost). Both the Meeting Intelligence and Meeting Follow-ups panels filter on every keystroke by title + source meeting; the 3-cap is dropped while a query is active; each panel shows "No results for '<query>'" on no match vs "No meetings/follow-ups yet." when empty; "View All" hides while searching; an ✕ clear button resets. `tsc` + `build` green. Prompt: `prompts/step-A6-global-search.md`.

#### Step A7 — Fix landing footer dead links
- The landing footer (`LandingFooter.tsx`) has 15 `href="#"` links: Product (Integrations, Changelog), Resources (Documentation, API Reference, Blog, Community), Company (About, Careers, Contact, Partners), social icons (Twitter, LinkedIn, GitHub), Privacy Policy, Terms of Service.
- Decide the zero-cost fix per link: point real ones to existing routes/pages (e.g., `#features`/`#pricing` already scroll to landing sections — keep or wire), and remove or replace the rest with real destinations or drop them. No new backend. Keep the zero-cost rule; do not add a CMS.
- **Verification:** every footer link resolves to a real in-app route or is removed (no `href="#"` remains). `npx tsc --noEmit` clean, `npm run build` exit 0.
- **✅ DONE (this branch):** chosen strategy = keep the footer's full layout, render not-yet-built links as muted, non-clickable text with a subtle "Soon" tag (no fake links, no new pages/CMS). Each link carries an `active` flag + optional `href`; `active && href` renders a real `<a>`, otherwise a muted `<span aria-disabled title="Coming soon">`. Only `Features` (`#features`) stays active. `Pricing` is also inactive — its `#pricing` anchor has no target section. Social icons (Twitter/LinkedIn/GitHub) and legal links (Privacy Policy/Terms of Service) likewise inactive. All 15 `href="#"` removed. `tsc` clean, `next build` exit 0.

### Layer 2 — Auto Attendance (Steps B0–B5)
Track participant join/leave/mic/camera events in live meetings (Stream Video SDK, zero cost), persist to Supabase, and emit a downloadable PDF attendance report per meeting from the Overview tab. PDF library must be free/zero cost.

#### Step B0 — Architect: attendance data model + PDF library decision ✅ DONE
- `/architect` first. Decided `attendance_events` schema: `id`, `meeting_id` (fk `meetings`), `user_id` (Clerk id), `participant_email` (local from Clerk; remote null), `participant_name`, `session_started_at`, `session_ended_at`, `mic_toggles`, `camera_toggles`, `talk_time_seconds`, `mic_enabled_at`, `created_at`, `updated_at`. One row per join session per participant.
- Transport decided: **client captures Stream SDK events → new `POST /api/attendance/event` → server writes via `supabaseServer()` (service role)**. Never browser→Supabase directly. talk_time = cumulative mic-enabled (unmuted) duration, accumulated server-side from `mic_enabled_at` timestamps. Track all participants (remote email null, remote device toggles not captured this pass — documented). Reconnects close + reopen the session row.
- PDF library decision deferred to B3 (B0 scope closed; capture path is library-agnostic).
- Output: approved prompt `prompts/step-B1-B2-attendance-capture.md`.

#### Step B1 — Supabase schema (attendance_events table) ✅ DONE (code) — migration apply pending
- Added `attendance_events` to `supabase/schema.sql` (`CREATE TABLE IF NOT EXISTS`) + `idx_attendance_events_meeting_id` index. Covered by the existing `service_role` GRANT block.
- **Action required:** run the updated `schema.sql` in the Supabase SQL Editor — the sandbox has no DB access, so the table is not yet live.
- **Verification (code):** `npx tsc --noEmit` clean, `npm run build` exit 0.

#### Step B2 — Stream SDK event tracking (join/leave/mic/camera → DB) ✅ DONE (code) — live verify pending
- `src/app/api/attendance/event/route.ts` (Clerk `auth()` → resolve `stream_call_id` → `meetings.id` → switch on `event_type`: join/leave/mic_on/mic_off/camera_on; idempotent open-row reuse via `findOpenRow()`; server-side talk-time accumulation; server timestamps only).
- `src/hooks/useAttendanceTracking.ts` (client): subscribes to `call.session_participant_joined/left`, seeds local + present remote on JOINED, tracks local mic/camera via `useMicrophoneState`/`useCameraState`, best-effort leave on unmount + `reportLocalLeave`; wired into `MeetingRoom.tsx`.
- **Verification (code):** `npx tsc --noEmit` clean, `npm run build` exit 0, `/api/attendance/event` registered. **Live end-to-end verify (Beta closing gate) still pending** — needs a real Clerk-authed meeting loop the sandbox can't drive.

#### Step B3 — PDF generation logic ✅ DONE + VERIFIED (code + runtime)
- `pdf-lib` (MIT, zero-cost, zero Next.js config) chosen over `@react-pdf/renderer` (breaks Next 15 + React 19 bundler) / `jspdf` (verbose). Library decision deferred from B0 and finalized here.
- `src/lib/attendance-pdf.ts`: pure `buildReportRows()` (unit-testable core: 8 columns, counts, Duration/Talk-time formatting in `H:MM:SS`, UTC `MM-DD HH:mm` join/leave, `—` for nulls/open) + `generateAttendancePdf()` (`PDFDocument`/`Helvetica`/`HelveticaBold`, title + subtitle, one line per `attendance_events` row, auto-paginate, `Total sessions` footer) → `doc.save()` → `Uint8Array`.
- `src/app/api/attendance/report/route.ts` (`runtime = "nodejs"`): owner-only (`meetings.user_id === Clerk userId`) `GET ?meetingId=`, returns `application/pdf` with `Content-Disposition: attachment; filename="attendance-report-{meetingId}.pdf"`; `404` when no rows; `401` when unauthenticated; `500` on failure. `AttendanceRow` type added to `src/lib/meeting-types.ts`.
- **Verification (code):** `scripts/check-attendance-pdf.ts` (tsx) asserts 8 columns + 3 seeded lines + Duration/Talk-time formatting + valid `%PDF-` buffer — 14/14 pass, `PDF bytes: 1904`. `npx tsc --noEmit` clean, `npm run build` exit 0.
- **Verification (runtime, `/check verify`):** dev server boots and `/api/attendance/report` is registered and returns `401 {"error":"Unauthorized"}` for unauthenticated requests (auth gate proven); user downloaded a real PDF for live meeting `cecc84d3-…` from their own Supabase (owner check + data path confirmed visually). Not-owner `404` and no-data `404` not driven from the sandbox (need a second Clerk account / an empty meeting) — documented as blocked by environment, NOT a code gap. `pdf-lib` + `tsx` installed (`--legacy-peer-deps`); `library-docs.md` gained a `pdf-lib` section.

#### Step B4 — Download button + wiring on Overview tab ✅ DONE + VERIFIED (code + live end-to-end)
- Added an "Attendance Report" card to `OverviewTab.tsx` (Meeting Intelligence → selected meeting → Overview). The control is an `<a href="/api/attendance/report?meetingId={id}" download>` (anchor — no fetch/Blob; same-origin GET carries the Clerk cookie and the B3 route returns `Content-Disposition: attachment`), styled `bg-primary-container text-on-primary hover:bg-primary` with a `Download` lucide icon. Disabled state (greyed `bg-surface-container opacity-60 cursor-not-allowed`, `aria-disabled`) renders when `attendanceCount === 0`.
- `attendanceCount` is sourced from `GET /api/meetings/[id]` (a new parallel `supabase.from("attendance_events").select("*", { count: "exact", head: true }).eq("meeting_id", id)`), added as `attendanceCount: number` to `MeetingDetailResponse` (`src/lib/meeting-types.ts`), and threaded `MeetingDetail → MeetingTabs → OverviewTab`. No separate count endpoint, no 404 probing.
- **Verification (code):** `npx tsc --noEmit` clean, `npm run build` exit 0. **Verification (live end-to-end, user-driven):** Check 1 — meeting `cecc84d3-…` (4 sessions) downloaded a correct PDF through the Overview-tab Download control (columns, durations, talk-time, toggles all correct). Check 2 — a meeting with no attendance rows showed the greyed `aria-disabled` button with exact text `No attendance recorded yet.` and fired no request. Both B4 behaviors confirmed against real data.

#### Step B5 — Verify end-to-end ✅ DONE + VERIFIED (code + automated runtime)
- Full loop: join meeting (live or simulated) → toggle mic/camera → leave → Overview tab → download PDF → verify contents match events.
- **Verification (automated, `/check verify`):** `npx playwright test --project=chromium-attendance` → 2 passed (the `auth.setup.ts` shared Clerk session + the B5 spec in `tests/attendance.spec.ts`). The spec POSTs the event sequence (join → mic_on → camera_on → mic_off → leave) to `POST /api/attendance/event` (one open `attendance_events` row), resolves `meetingId` from `GET /api/meetings`, asserts `attendanceCount: 1` from `GET /api/meetings/[id]`, then `GET /api/attendance/report?meetingId=` returns `application/pdf` with the correct `content-disposition` and the extracted PDF text contains the participant name/email, the `Participant`/`Camera` headers, and `Total sessions: 1`; the Overview-tab `a[download]` anchor carries the right `href`. `npm run build` exit 0. Manual live WebRTC walkthrough still recommended to exercise a real Stream join (the sandbox can't drive one), but the data path is proven end-to-end. Confirm zero-cost path holds. `npx tsc --noEmit` clean, `npm run build` exit 0.

> **Auto Attendance (B0–B5) is complete and fully verified end-to-end.** B0 (data model + PDF decision), B1 (schema), B2 (capture hook + route), B3 (pdf-lib generator + owner-checked report route), B4 (Overview-tab Download control), and B5 (automated capture-to-report verification) are all built and green.

### Layer 3 — AI engagement intelligence (Steps C1–C3, reuse Gemini/Groq/pgvector)
No new provider or vector store. Each feature is its own build-verify cycle.

#### Step C1 — Cross-Meeting Search
- Build a search over the user's meetings using existing `meeting_chunks` embeddings (pgvector similarity). One UI entry (e.g. on the Meeting Intelligence list or AI Chat) that takes a query, embeds it, runs `match_meeting_chunks` across the user's meetings, and returns ranked matching meetings/snippets.
- Server-side embedding + similarity only (reuse `agent/rag.ts` patterns); user-scoped.
- **✅ DONE:** dedicated `/search` page (Option A — no extra meeting-list UI), no AI generation step. `match_meeting_chunks_user` RPC (user-scoped join) added to `supabase/schema.sql`; `searchAcrossMeetings()` + `CrossMeetingHit` added to `src/agent/rag.ts`; `POST /api/search` route (`auth()` guard, throws on RPC error so missing RPCs surface visibly); `SearchPage.tsx` groups hits by meeting with %-match badges + links to `/meeting-intelligence/[id]`; sidebar + `constants/index.tsx` gained the `Search` entry. Reuses Gemini embedding + pgvector, zero cost, no new tables/provider. RPC must be applied live in Supabase SQL Editor. **Verified end-to-end** (see progress-tracker). `npx tsc --noEmit` clean, `npm run build` exit 0. Prompt: `prompts/step-C1-cross-meeting-search.md`.

#### Step C2 — Meeting Prep Suggestions
- Given a meeting about to start (or its title/agenda), surface suggestions from past related meetings: retrieve related meetings via embeddings/keywords, then use Gemini (fallback Groq) to summarize relevant context, open action items, and prep notes.
- Reuses existing embeddings + AI SDK; user-scoped; server-side generation.
- **✅ DONE + VERIFIED (live end-to-end):** `src/agent/prep.ts` (`generatePrepSuggestions`) embeds the upcoming title plus notes (shared 768 dim embedding) then calls the `match_meeting_chunks_user` RPC, enriches related `meeting_insights` and open `follow_ups`, and calls `generateStructuredWithFallback` to return `{ context, openActionItems, discussionPoints, questionsToAsk }`. New `POST /api/prep` (`auth()` 401) and a `/prep` page (`PrepPage.tsx`, sidebar plus `constants` "Prep" entry). Zero cost, no new tables or provider. The Groq fallback model `llama-3.1-8b-instant` was retired and the interim `llama-3.3-8b-versatile` switch was also wrong (absent from this account's Groq key); the final fix sets `fallbackModel = groq("openai/gpt-oss-20b")` in `src/agent/models.ts`, and the fallback branch uses the default json_schema path (no `structuredOutputs: false` override), because gpt-oss-20b supports `response_format json_schema` but fails in json_object mode. `scripts/check-providers.mjs` probes `openai/gpt-oss-20b`. `tsc` clean, `npm run build` exit 0. **Verification (live):** a live prep run with Gemini returning a 503 fell back to Groq gpt-oss-20b through the json_schema path and returned valid structured prep suggestions (the no prior history branch, since the test user had no matching chunks). Prompt: `prompts/step-C2-meeting-prep.md`.
- **Verification:** opening prep for a meeting returns grounded suggestions drawn from past related meetings. `npx tsc --noEmit` clean, `npm run build` exit 0.

#### Step C3 — Speaker Engagement Insights
- Per-speaker engagement from transcript chunks (speaker labels if present), attendance (talk time), and the existing AI setup. Compute/summarize who spoke, how much, key contributions, and flag low-engagement participants.
- Reuses `meeting_chunks` + `attendance_events` (B1) + AI SDK; user-scoped; server-side.
- **Verification:** a meeting with transcript + attendance yields per-speaker insights; low-engagement speakers are flagged. `npx tsc --noEmit` clean, `npm run build` exit 0.

---

## Meeting Experience Polish (Steps D0 to D3+, new — before Deploy)

Redesign the live-call UI (Meeting Setup + Meeting Room) to Zoom/Google Meet quality, then add current, professional Stream Video SDK functionality on top — every feature verified against Stream's real, current API via the official Stream `stream`/`stream-react` skill (installed via the `getstream` CLI), never from memory or assumptions. Zero cost only: Stream free tier, no paid plan, no paid design tool. Each step follows the project loop: `/architect` where a decision is needed, `/develop` to build, `/check verify` for live confirmation, `/test` where it is a regression-worthy flow, `/sync` to close.

### Step D0 — Architect: audit Meeting Setup + Meeting Room against Stream's current API
- `/architect` first. Audit the current Meeting Setup and Meeting Room against (a) Stream's current capabilities, verified live via the official Stream `stream`/`stream-react` skill, and (b) Zoom/Google Meet quality UX patterns.
- Decide what is outdated, what is missing, and what the redesign scope actually is. The D0 output is the source of truth for how many D-steps exist (D1, D2, D3+).
- Zero-cost only: no paid Stream tier, no paid design tool. The architect pass must confirm every candidate Stream feature is free-tier before it is proposed.
- **Outcome:** an approved audit + redesign scope (a prompt in `prompts/`) that lists the exact D1/D2/D3+ steps. Nothing is built until D0 closes.

### Step D1 — Meeting Setup redesign (device preview, controls, layout)
- Aesthetic pass first: redesign the device/mic/camera preview, the control row, and the overall layout to a modern, polished, Zoom/Meet-quality look that matches the locked token system in `context/ui-tokens.md`.
- Then ensure the Stream SDK functionality underneath is current and correct, verified via the Stream skill.
- `/architect` only if a real decision is needed (e.g. preview layout, control placement); otherwise `/develop` straight from the D0 prompt.
- **Verification:** the setup screen reads as a professional pre-call experience; device preview + controls work; `npx tsc --noEmit` clean, `npm run build` exit 0.

### Step D2 — Meeting Room redesign (call layout, controls, participant grid) ✅ DONE
- Aesthetic pass first: redesign the in-call layout, the control bar, and the participant grid to a modern, polished, Zoom/Meet-quality look that matches the locked tokens.
- Then ensure the Stream SDK call logic underneath is current and correct, verified via the Stream skill.
- `/architect` only if a real decision is needed; otherwise `/develop` from the D0 prompt.
- **Verification:** the meeting room reads as a professional live-call experience; layouts/controls work; `npx tsc --noEmit` clean, `npm run build` exit 0. **Verified live end-to-end (user walkthrough):** top bar title/timer/participant-count, icon+label control pill, standalone `CallStatsButton` opens Call Stats, tokened participant panel, layout switching, and leave logging attendance all confirmed working against a real Clerk+Stream session. Reactions (`Reaction`/`ReactionsButton`) + in-call `Search` deferred to D3.1/D3.2 per the D0 split (no dead stub shipped).

### Step D3 — New professional Stream functionality (sub-steps D3.1, D3.2, D3.3+ …)
- Whatever D0's Stream skill audit finds is available on the free tier and worth adding: better call layouts, reactions, screen-share polish, noise cancellation if it is free-tier, etc.
- Each feature is its own sub-step — **D3.1** (Reactions, `Reaction`/`ReactionsButton`), **D3.2** (in-call `Search`), then **D3.3+** for any further free-tier Stream feature the D0 audit flagged (better layouts, screen-share polish, noise cancellation if free-tier, etc.) — each with its own `/architect` pass where noted, its own approved prompt, its own verification before the next opens. Same pattern as every other step in this project.
- ✅ **Step D3.1 — Reactions (closed):** `call.sendReaction({ type: "emoji", emoji_code })` from a tokened control-pill picker built on Stream's `defaultEmojiReactionMap`; the per-participant `<Reaction>` layer was removed as redundant because `ParticipantView` natively renders the glyph scoped to the sender's tile (the redundant custom layer escaped its flex container and pinned a stray unscoped giant reaction to the corner, plus duplicated the glyph on every tile). Free-tier, zero-cost, `tsc` + `build` green. **Verified live:** emoji reaction appears only on the sender's tile, no stray unscoped render.
- ✅ **Step D3.2 — In-call participant Search (closed):** **no new code.** The D0 audit intended to wire Stream `Search` into the participants panel, but `CallParticipantsList` (mounted in `MeetingRoom.tsx` since D2b) already embeds a working search: a `SearchInput` box, a default normalized name filter over `useParticipants({ sortBy: name })` as `activeUsersSearchFn`, debounced `useSearch`, and `EmptyParticipantSearchList` for no-match. Adding a custom search would duplicate SDK behavior (over-build, per AGENTS.md), so D3.2 closes as delivered-by-D2b. Free-tier, zero-cost, `tsc` + `build` green. Verified via SDK source review.
- **Hard rule:** before proposing any feature, confirm via the Stream skill that it is available on the free tier. If a candidate requires a paid Stream plan, drop it (zero-cost rule) — do not propose it.
- **Verification (per feature):** the feature works live against the current Stream API; `npx tsc --noEmit` clean, `npm run build` exit 0.

> **D3 concluded here (2026-08-21).** D3.1 (Reactions), D3.2 (in-call Search, no new code), and D3.3 (surface `CallRecordingList`) are all built, verified, and closed. **D3+ — the remaining free-tier backlog (screen-share prominence + layout option + `Tooltip`/`StreamTheme` polish, and `RingingCall`) — is deferred.** The D3 work was stopped after D3.3 per the user's decision; those candidate features are not built in this pass and are not required before Deploy. D3.4 (recording access control) is parked separately as look-after (see its row). The Meeting Experience Polish phase is effectively closed for now; Step 11 (Deploy) may be considered once the user confirms D3.4 + D3+ are resolved or not needed.

#### Step D3.3 — Surface CallRecordingList in the Meeting Room + composite (mixed-video) recording + recordings UI fixes ✅ DONE
- **D3.3 (CallRecordingList surfacing):** `RingingCall` (the original D3.3 in the D0 audit) was re-scoped out — it only renders during `CallingState.RINGING`, which needs a ring-out-to-members flow NeuraMeet doesn't have (joins are by link/ID). D3.3 was re-pointed to surfacing `CallRecordingList` in the Meeting Room: a tokened `Recordings` control-bar button toggles a right-side panel hosting Stream's free `CallRecordingList`, fed by `call.queryRecordings()` (loaded on open + on refresh). Custom tokened sub-components (`RecordingsPanelItem`/`RecordingsPanelHeader`/`RecordingsPanelEmpty`/`RecordingsPanelLoading`) keep Stream's built-in refresh/empty/loading orchestration but match the dark Meeting Room tokens. The meeting-detail `RecordingTab.tsx` is unchanged. `tsc` + `build` green.
- **Composite (mixed-video) call recording:** calls are configured (via `settings_override` on the four `getOrCreate`/`update` call sites — `MeetingModel.tsx` instant + `ScheduleMeeting`, `PersonalRoomPage.tsx` `createMeeting` + best-effort `call.update`) to auto-start a composite recording at creation (`frame_recording: { mode: "auto-on", quality: "720p", capture_interval_in_seconds: 2 }` + `individual_recording: { mode: "disabled" }`). `auto-on` is the ONLY mode that reliably stores a file on this Stream account (every Aug-20 stored recording is `auto-on`; `available` stored zero files even on manual `startFrameRecording()`, proven 2026-08-21). D3.4 temporarily switched to `available` (on-demand owner Record control) but that was the actual recordings bug and was reverted to `auto-on` by /develop Option A; the on-demand design is abandoned and the custom Record control is now redundant (left in place). `individual_recording: disabled` stops the audio-only duplicate. Composite video is free on the Stream plan (zero-cost rule preserved). `tsc` + `build` green.
- **Recordings UI fixes:** (1) Play button broke on `/recording` (`RecordingPage.tsx`) and `RecordingTab.tsx` (`window.open` blocked) — replaced with a real `<a href={url} target="_blank" rel="noreferrer">`, disabled with an explanatory title while the URL is still processing. (2) "View insights" silently vanished on `/recording` when unlinked — now always rendered, disabled + toast when no linked meeting. (3) Dead Start/End time in the Meeting Room Recordings panel (`RecordingsPanelItem`) now shows "Processing…" / "In progress · {start}" / the full "{start} – {end}" range with `break-words`. Key-collision fix: `RecordingPage.tsx` keyed rows by `recording?.id || recording?.call_id || index` (Stream `CallRecording` has no `id`, so multi-recording calls collapsed to one `call_id` key and React warned) — now `${recording?.id ?? recording?.call_id ?? "rec"}-${index}`. All tokened, no raw color classes. `tsc` + `build` green.

#### Step D3.4 — Meeting recording access control (owner-only record + participant consent notice + owner-only access) ⬜
- One sub-feature, its own `/architect` + `/develop` + `/check verify` + `/test` pass. **Needs a decision** (see the architect items below): the auto-on composite recording from the earlier Composite fix changes which event fires and how the owner start/stop control should behave. Zoom/Meet-style consent + access pattern. `tsc` + `build` green, live-walkthrough verified.
- **Acceptance criteria (the three points):**
  1. **Owner-only Record control** — only the meeting owner (the call creator) sees an active Record control in the Meeting Room; non-owners see no active Record button (hidden, or visibly disabled). Today `CallControls` bakes in a `RecordCallButton` with no hide prop, so this means composing a custom control bar from Stream's standalone buttons (`RecordCallButton`, `MicrophoneButton`, `CameraButton`, `ScreenShareButton`, `CancelCallButton`) and rendering `RecordCallButton` only when `isOwner`.
  2. **Participant consent notice** — when recording starts, every participant in the call sees a visible notification (toast or popup) saying the meeting is being recorded; it fires for ALL participants in real time, not just the owner. Hook Stream's native coordinator event (`call.recording_started` / `call.recording_stopped`, and the `frame_recording_started`/`frame_recording_stopped` pair for composite) via `call.on(...)` in `MeetingRoom.tsx` — no custom signaling mechanism.
  3. **Owner-only recording access afterward** — the Recordings panel (D3.3 Meeting Room), the meeting-detail `RecordingTab.tsx`, and the `/recording` page are visible/accessible to the owner only; non-owners see nothing. Reuse the B3/B4 owner-check pattern (`meetings.user_id === Clerk userId` server-side; `call.state.createdBy?.id === clerkUserId` client-side). The `/api/recordings` route currently uses `created_by_user_id: userId OR members: $in: [userId]` — change the `members` branch to owner-only so participant-members no longer see recordings on `/recording`.
- **Research-confirmed facts (no build yet):** owner anchor = Stream `call.state.createdBy?.id` (= the call creator's Stream user id = Clerk userId; same id used as `created_by_user_id` in `useGetCall`/`useGetCallbyId`); Supabase `meetings.user_id` = that same Clerk id (owner check proven by B3/B4 `meetings.user_id === Clerk userId`). Native events exist: `call.recording_started`/`call.recording_stopped`/`call.recording_ready` AND `call.frame_recording_started`/`call.frame_recording_stopped`, all broadcast to every participant; `call.on(event, handler)` returns an unsubscribe fn. `CallControls` has only an `onLeave` prop — its `RecordCallButton` cannot be hidden via props, hence the custom control bar.
- **Needs a decision (`/architect` pass):** the earlier Composite recording fix set `frame_recording: auto-on` + `individual_recording: disabled` on every call, so composite video now starts automatically at call start (NOT via the manual `RecordCallButton`, which calls `startRecording()` — the now-disabled individual system). The architect pass must settle: (a) which event actually fires for the auto-on composite (`frame_recording_started` vs `recording_started`) so the consent toast (point 2) hooks the correct event — verify against the SDK type defs or a live test, never assume; (b) what "owner can start/stop" (point 1) means given auto-on — gate the auto-on frame recording to owner + allow a manual owner stop (`stopFrameRecording`), or switch the call to a manual owner-only frame-recording start/stop (turn off `frame_recording: auto-on` on the three `getOrCreate` sites). This is the central design call for D3.4. **RESOLVED (see Decision outcome below):** chose manual owner-on-demand (`available`) + an `EndCallButton` stop/grace/end guard; live 2-party verification still OPEN.
- **Owner-anchor consistency note:** `meetings.user_id` is lazily set to the first joiner (B2 fix), so for the live Record button (point 1) and the consent notice (point 2) the authoritative owner is `call.state.createdBy` (always the Stream call creator); for the post-call surfaces (point 3) `meeting.user_id` (detail) + Stream `created_by_user_id` (route) resolve to the same creator. Pick one consistent definition in the architect pass.
- **Verification:** `npx tsc --noEmit` clean, `npm run build` exit 0; live walkthrough — owner sees + can use the Record control, non-owner sees no active Record button, all participants (incl. non-owner) see the recording-started toast, non-owner sees no recordings in the panel/tab/`/recording` while the owner does; Playwright regression for the access-denied path where feasible. Zero-cost: Stream core SDK events + existing components + Supabase owner check, no new paid tool.
- **Decision outcome (2026-08-21, /debug, FINAL, ROOT CAUSE FOUND):** The auto-on vs available config AND the End Call stop-then-end race were both red herrings (verified by live Stream call-type introspection via the official `getstream` CLI + `stream-react` `VIDEO.md`). The real root cause: the **`default` call type grants `start-frame-recording` only to `admin`**, not to `call_member`/`user` (the roles the owner joins as). `auto-on` worked on Aug 20 because Stream's server auto-starts it (admin context, no client capability needed); `available` (on-demand) needs the owner's client-side `call.startFrameRecording()`, which was denied server-side — so every `available` call had `recordings=0`. FIX APPLIED: (1) granted `start-frame-recording` to `call_member` + `user` on the `default` call type via the Stream API (`getstream api UpdateCallType` / `scripts/stream-fix-grants.mjs`) — a reversible Stream account config change; (2) `frame_recording` stays `available` (owner-on-demand per requirement) at all four `getOrCreate`/`update` sites; `individual_recording: disabled` kept; (3) `EndCallButton.tsx` still awaits `stopFrameRecording()` + ~2.5s grace before `endCall()` (hygiene). `tsc` + `build` green. VERIFICATION: grant confirmed via re-read; a live test with a FRESH call id (start/stop/manual-end) should now store a `recording_type: "composite"` file. If it still fails, the next lever is individual audio — a `/architect` decision. Owner-scoping (`created_by_user_id`) was ruled out as a cause.

> **Meeting Experience Polish is the final phase before Deploy.** D0–D3 are built (D3.1/D3.2/D3.3 closed). D3.4 (recording access control) is parked as look-after and D3+ (screen-share/layout/Tooltip backlog) is deferred, so the polish phase is effectively closed for now. Step 11 (Deploy) does not start until the user decides D3.4 + D3+ are resolved or confirmed not needed (the user stopped D3 here after D3.3).

---

## Transcript Generation (Steps F0 to F8, new — before Deploy)

Automatic speaker labeled transcript from the meeting's real recorded audio, replacing hand-typed test transcripts as the **primary `.txt` generator**. The F-series' ONLY job is to produce a downloadable `"Name: text"` transcript file (any signed-in participant can generate it). **It NEVER triggers AI.** Every AI path — Summary, Action Items, Category, RAG embeddings — is entered ONLY through the existing **Upload Transcript** flow (Dashboard → Upload Transcript), which already calls `/api/transcript/upload` → `/api/ai/process` → `/api/ai/embed` unchanged. The F-series output is simply uploaded there by the user, exactly like pasting a transcript manually today. Zero cost only: reuse Stream's per participant audio (individual recording) and Groq Whisper (free tier, English and Urdu), add no second provider or paid service. Each step follows the project loop: `/architect` where a decision is needed, `/develop` to build, `/check verify` for live confirmation, `/test` where it is regression worthy, `/sync` to close.

### Step F0 — Architect: verify Stream individual recording access + Groq Whisper API shape, decide trigger and merge owner ⬜
- `/architect` first. Confirm three things before any code:
  1. **Stream individual recording is real and free tier on this account.** The D3.4 recovery (2026-08-21) found that the per call `individual_recording` override may be a no-op — the live call reported `settings.recording = { audio_only: true, mode: "available" }`, so the individual setting key is `recording`, not `individual_recording`, and the per participant audio only track must be confirmed available and stored. Composite frame recording was proven non functional on this account, so do not assume individual works by analogy. Verify via the Stream skill (`stream` / `stream-react`) and/or a live `queryRecordings()` call that one audio file per participant is produced and downloadable. If individual recording needs a paid plan, drop the feature (zero cost rule) rather than proposing it.
  2. **Groq Whisper API shape + free tier limits.** Confirm the Groq transcription endpoint (Whisper, the Groq STT model), the request shape (file vs URL), the response shape (segments with timestamps plus text, language auto detection for English and Urdu), and the free tier per minute or file size limits. Confirm both English and Urdu are supported natively (no separate system per language).
  3. **Trigger point + where logic lives.** Decide: auto generate on call end, or an on demand "Generate Transcript" button on the meeting detail page (or both). Decide where the fetch, transcribe, merge, and format steps run (server side API route with the service role client plus the Groq server key, never the browser), and how processing status is tracked and shown.
- **Outcome:** an approved prompt in `prompts/` that records the three confirmations above plus the trigger decision and the module layout. Nothing is built until F0 closes.
- **Verification:** the architect notes are written and the zero cost path is confirmed for both Stream individual recording and Groq Whisper. `npx tsc --noEmit` clean once any scaffold exists, `npm run build` exit 0.

### Step F1 — Fetch individual audio recordings per participant after a call ends ⬜
- After the trigger decided in F0 fires (call end or the button), fetch each participant's individual audio recording from Stream. Resolve participants to known names from the existing meeting and attendance data (Stream `call.state.createdBy` plus Clerk, or `attendance_events`) so each audio file is tied to a known speaker. Map recording file to participant id to name.
- Reuse the existing recording access pattern (the D3.3 `queryRecordings()` surface and the owner check from B3/B4) — do not duplicate the auth or fetch logic.
- **Verification:** for a real meeting with N participants, N individual audio files are fetched and each is mapped to the correct participant name. `npx tsc --noEmit` clean, `npm run build` exit 0.

### Step F2 — Transcribe each track via Groq Whisper (English + Urdu) ⬜
- Send each participant's audio file to Groq Whisper through a server side route (Groq API key server only, never the browser). Keep the per segment timestamps so merge (F3) can order by time.
- Use language auto detection so English and Urdu both work without a per language branch; confirm Urdu transcription quality in F6.
- **Verification:** each track returns timestamped segments with text; English and Urdu both transcribe. `npx tsc --noEmit` clean, `npm run build` exit 0.

### Step F3 — Merge tracks into one speaker labeled transcript, chronological order ⬜
- Interleave every participant's timestamped segments into a single chronological stream, and format each line as "SpeakerName: text". Order by segment start time across all participants. Resolve each speaker name from the F1 mapping (fall back to the Stream or Clerk display name when an id has no meeting row).
- Keep the merge and format logic small and pure (unit testable), server side.
- **Verification:** a two participant bilingual test produces a single "Name: text" transcript in time order, with no orphaned or mis attributed lines. `npx tsc --noEmit` clean, `npm run build` exit 0.

### Step F4 — (REMOVED) No auto-AI wire ⬜
- **There is no F4 AI wire.** The F-series does NOT feed the recording into `/api/ai/process`. AI processing is entered ONLY via the existing Upload Transcript flow. The F3 `.txt` is downloaded by the recap page and the user uploads it through Dashboard → Upload Transcript (the same path a pasted transcript uses). No second summarization or embedding path is added by the F-series.

### Step F5 — UI trigger + status (`.txt` only, any signed-in participant) ⬜
- Add the on-demand "Generate Transcript" button on the after-meeting recap page (decided in F0). It is the SAME button for owner and every other participant: it downloads a `.txt` file (`Name: text` per line) via a `Blob` anchor — **no AI triggered**. Reuse the recap page tokens; mirror the Overview-tab control patterns (button, disabled while processing, clear status).
- Show clear status (transcribing, merged, ready/downloaded, no recording yet, too short, failed) and degrade gracefully (Stream finalization timing, silent tracks, too-short, Groq failure, double-click, logged-out redirect). The "View full meeting insights" link on the recap page is shown only when `meeting_insights` already exists (i.e. AI was run via Upload Transcript), never triggered from here.
- **Verification:** clicking the button (any signed-in participant) downloads a `.txt` and leaves `meeting_insights` empty (no AI). `npx tsc --noEmit` clean, `npm run build` exit 0.

### Step F6 — Verify end-to-end with a real bilingual test meeting (English and Urdu) ⬜
- Full loop: a real meeting with English and Urdu speakers → individual recordings fetched → Groq Whisper transcribes both languages → merged "Name: text" `.txt` downloads correctly from the recap page → the user uploads that `.txt` via Dashboard → Upload Transcript → Summary, Action Items, Category, RAG embeddings all correct.
- Drive the data path with a Playwright regression where the sandbox allows (mock the audio fetch plus Groq call, assert the `.txt` content shape); manual live bilingual walkthrough still recommended because the sandbox cannot drive a real Stream join or Groq STT.
- **Verification:** a live bilingual meeting produces a correct speaker-labeled `.txt`; uploading it via the existing Upload Transcript flow yields correct insights; the free tier limits held. `npx tsc --noEmit` clean, `npm run build` exit 0.

### Step F8 — Transcript Cleanup Pass (light AI accuracy clean, automatic, before `.txt`, zero-cost) ✅ DONE
- **Goal:** a light grammar/accuracy correction of the merged `"SpeakerName: text"` transcript, run AUTOMATICALLY as the last stage of F-series generation (Option A — the user gets an already-cleaned `.txt`), using the existing Gemini primary + Groq fallback text-generation infra (`generateStructuredWithFallback`). No new provider, no new model, zero extra cost beyond the existing free-tier usage.
- **Two cleanup behaviors in ONE prompt call (no sequential double pass):**
  1. **Word-level correction:** fix garbled / misheard / dropped words within a line (mic quality noise). Preserve meaning.
  2. **Line-level reconstruction:** when a mic glitch splits ONE continuous thought into multiple fragmented lines from the SAME speaker, merge them into one coherent `"SpeakerName: text"` line.
- **Hard rules (all in the prompt, single call):** only merge consecutive lines from the SAME speaker (never across speakers — that would misattribute speech); merge only when the fragments clearly form one continuous thought; if a line is genuinely meaningless noise with no reconstructable content, drop it rather than fabricate; NEVER invent words/content that weren't said (reconstruction = rejoining real fragments, not guessing missing speech); preserve chronological order and the `"SpeakerName: text"` line format; do NOT summarize, do NOT remove real content, do NOT alter speaker labels or line structure.
- **Where it runs:** a new `cleanupTranscript(raw)` in `src/agent/transcript-generation.ts` (a server-only module — it already carries `server-only` via `supabase-server`) called inside `generateTranscriptForMeeting` right after the merge builds `transcript` and BEFORE `return { status: "ok", transcript }`. The cleaned string becomes the cached `transcripts.raw_text` and the downloaded `.txt` — no new DB column, no new route, no new UI (Option A: one less button).
- **Fallback chain (explicit FYP-demo safety):** `generateStructuredWithFallback` = Gemini primary → Groq fallback (the SAME infra as Summary/Action Items, NOT a new system). If BOTH fail (the helper throws after its internal Gemini→Groq retry), an outer try/catch returns the RAW uncleaned transcript and logs — never blocks the download, never crashes, never shows a blocking error. A slightly rough transcript is infinitely better than a broken feature during a live demo. Cleanup is a nice-to-have enhancement, not a blocking dependency.
- **Truncation guard (protects content):** the cleaned result is accepted only if `cleaned.length >= CLEANUP_MIN_RATIO * raw.length` (ratio ~0.6). A >40% shrink signals either output truncation or the forbidden summarization behavior, so the run falls back to raw. This keeps the cleanup strictly lossless in content.
- **No double cleanup:** exactly ONE AI call (`generateStructuredWithFallback`); the Groq fallback is the only retry. Never a second full Gemini-then-Groq cleanup chain (that would compound drift from the original transcript).
- **Verification:** `npx tsc --noEmit` clean, `npm run build` exit 0; vitest unit tests for a pure `fallbackToRawIfTooShort` guard + a mocked-AI test covering cleaned-returned / truncated→raw / both-throw→raw; manual live bilingual meeting → `.txt` keeps correct speaker labels and loses no real content (only noise removed / fragments rejoined).
- **Open risk (noted, acceptable):** very long meetings produce long transcripts that may exceed free-tier output token limits; the truncation guard then falls back to raw (graceful). No mitigation built now (per-speaker chunking could be added later if needed — out of scope).
- **Verification (2026-08-23):** `npx tsc --noEmit` clean, `npm run build` exit 0; vitest 8 new F8 tests green (guard boundary + `cleanupTranscript` cleaned / truncated→raw / empty→raw / both-throw→raw) for a 20/20 suite.

### Step F9 — Multilingual → Always-English Output (pending approval)
- **Goal:** Fix the confirmed production bug where non-English speech (Urdu, Punjabi, German…) came back as **garbage English** because `transcribeChunk` forced Whisper `language: "en"` (Whisper then machine-translated the audio into unreliable English). Output must always be clean English.
- **Mechanism (pipeline-only, zero-cost):**
  1. Stop forcing `"en"` in `transcribeChunk` — an unsupplied `language` now means **omit the field** so Whisper **auto-detects** the spoken language and writes accurate source text (Urdu in Arabic script, English in English). An explicit hint still wins.
  2. Fold translation into the existing F8 `cleanupTranscript` pass: `buildCleanupPrompt` gains a first rule that translates any non-English line into English (preserving every `"SpeakerName: text"` line, the speaker label, and chronological order — never translating names). One `generateStructuredWithFallback` call (Gemini→Groq), same `fallbackToRawIfTooShort` guard + try/catch graceful fallback. `cleanupSchema`'s `cleanedTranscript` describes output as English.
  3. Correct `WHISPER_DOMAIN_HINT` "Neuromeet" → "Neurameet" so Whisper spells the product name right.
  4. `generateTranscriptForMeeting` ok result now sets `language: "en"`.
- **Devanagari risk:** Whisper auto-detect often returns `"hi"` for Urdu; the LLM translate step converts it to English before caching, so the user never sees Devanagari. Optional hardening (re-run chunk with `language: "ur"`) is out of scope for v1.
- **No new UI/route/schema.** The `transcripts.language` column + migration already exist (Bug 2); the recap path sends no `language`, so the cache branch is moot but harmless.
- **Files:** `src/agent/transcript-generation.ts` (3 changes), `src/agent/transcript-generation.test.ts` (assertion "Neuromeet"→"Neurameet" + new translate tests).
- **Prompt:** `prompts/step-F9-multilingual-translate-to-english.md`.

---

## Guest Join with Owner Approval (Steps G0 to G4, new — before Deploy)

Bring unauthenticated participants (shared meeting link, not signed in) into a real-time video meeting without forcing account creation. A lightweight guest pre-join screen shows camera/mic preview on one side and a name plus email input with an "Ask to join" button on the other. When a guest asks to join the meeting owner receives a real-time notification and can Accept or Deny. The owner controls the flow per meeting with a toggle between open admission and approval required. This is strictly additive: the existing signed-in join path is untouched, and zero-cost rules hold (Stream free tier only, no new provider). Each step follows the project loop: `/architect` where a decision is needed, `/develop` to build, `/check verify` for live confirmation, `/test` where it is regression-worthy, `/sync` to close.

### Step G0 — Architect: verify Stream guest/anonymous capability, decide identity capture + approval notification, confirm no impact on signed-in flow
- `/architect` first. Confirm three things before any code:
  1. **Stream guest/anonymous-user capability.** Verify against the installed SDK type definitions (`node_modules/@stream-io/video-client`) that `GuestUser` and `AnonymousUser` are real types, that `StreamVideoClient.createGuestUser(data: CreateGuestRequest)` exists on the node client and returns a `{ access_token, user }` usable for joining, and that `connectAnonymousUser` is private (so the guest path uses `connectUser` with an anonymous/guest user object). Verify against the Stream skill (`stream`/`stream-react`) whether an API call is needed server-side to mint the token, or whether the client can create a guest user directly.
  2. **Identity capture approach.** Stream guest/anonymous users carry a display name only (no email). Decide: capture name + email client-side with validation on the guest pre-join page; the Stream token carries the display name; email is passed through to the owner notification and attendance attribution (server side, via the approval flow, never exposed to the Stream token). Confirm this means no Clerk account is required and no new schema column is needed.
  3. **Owner approval notification mechanism.** Reuse existing real-time infrastructure — Stream call events or a lightweight server-side mechanism — do NOT build a new notification system. Decide the exact event/shape and where the owner UI renders (in-call banner + Accept/Deny, and/or the meeting detail page when the owner is viewing but not in the call).
  4. **Zero-cost feasibility.** Confirm the Stream free tier supports guest/anonymous users and call events for approval signaling. No new provider, no paid Stream tier.
  5. **No impact on signed-in flow.** Confirm the existing signed-in join path (`StreamClientProvider.tsx` → Clerk-backed `tokenProvider` → `connectUser` → `useGetCallbyId` with `allowLinkAccess`) is entirely untouched — guests use a parallel client construction path with their own anonymous/guest token.
- **Attendance/transcript implication check (informational, no decision):** `attendance_events` already has `stream_user_id` (text) + `participant_name` + `participant_email` columns from the B-series work, and the `resolveSpeakerName` fallback chain can attribute guest participants by name. Confirm NO new schema column is required — guests are attributable via existing columns. State this explicitly in the architect output.
- **Outcome:** an approved prompt in `prompts/` that records the five confirmations above plus the identity capture decision and the owner notification mechanism. Nothing is built until G0 closes.
- **Verification:** the architect notes are written and the zero-cost path is confirmed for the guest join mechanism; `npx tsc --noEmit` clean once any scaffold exists, `npm run build` exit 0.

### Step G1 — Guest Setup page ✅ DONE
- The guest pre-join screen: camera/mic preview on one side, a name plus email input (client-side validated) and an "Ask to join" button on the other. No account creation required.
- Built on a public route (outside the signed-in sidebar group) so an unauthenticated participant clicks a meeting link and lands here instead of the Clerk sign-in page.
- Uses a guest Stream client (anonymous/guest user from G0) for the preview only — preview is local, no join yet.
- **Implementation:** `src/lib/guest-store.ts` (in-memory Promise-cache dedup, 10-min TTL), `src/app/api/guest/request-join/route.ts` (POST, `createGuestUser`, `sendCallEvent`), `src/app/api/guest/status/route.ts` (GET poll), `src/components/GuestStreamClientProvider.tsx` (two-step `connectUser`, standalone), `src/app/(root)/meeting/[id]/guest/page.tsx` (lobby → waiting → admitted/denied/expired/not_found). `/meeting/:id/guest` added to `isPublicRoute` in `middleware.ts`.
- **Verification:** `npx tsc --noEmit` clean (only pre-existing unrelated `AfterMeetingRecap.test.tsx` error), `npx vitest run src/lib/guest-store.test.ts` 17/17 green, `npm run build` exit 0.

### Step G2 — Owner approval notification + Accept/Deny ✅ DONE
- When a guest asks to join, the meeting owner (signed in, in the call or viewing the meeting) receives a real-time notification: "X wants to join". Owner can Accept or Deny. On Accept the guest is admitted into the Meeting Room; on Deny the guest is rejected with a message.
- Reuses the Stream `guest.request_join` call event (decided in G0) + GET /api/guest/status polling fallback.
- **Implementation:** `getGuest(guest_token)` export added to `src/lib/guest-store.ts` (sanitized read: `{ meeting_id, name, status } | undefined`); `POST /api/guest/admit` + `POST /api/guest/deny` route handlers (Clerk `auth()` → 401; `getStatus` → 409 if not pending; `getGuest` cross-check → 403 on `meeting_id` mismatch; owner check via `meetings.user_id === userId` → 403; `admit()`/`deny()` return-value check → 409 if false; best-effort `sendCallEvent` emit of `guest.admitted`/`guest.denied`); owner notification via `call.on("all", handler)` in `MeetingRoom.tsx` filtering for `custom.event === "guest.request_join"`, react-hot-toast with Accept/Deny buttons.
- **3 gap fixes applied:** (1) `admit()`/`deny()` return value checked → 409 with `{ error: "Guest request already resolved or expired" }` if false; (2) toast dedup via `toast(..., { id: guest_token })` so duplicates update the same toast; (3) stale toast auto-dismiss via `setTimeout(() => toast.dismiss(guest_token), 10 * 60 * 1000)` matching the guest-store TTL, with `useRef`-tracked timer cleanup.
- **Verification:** `npx tsc --noEmit` clean (only pre-existing unrelated `AfterMeetingRecap.test.tsx` error), `npx vitest run src/lib/guest-store.test.ts` 21/21 green (17 original + 4 `getGuest` tests), `npm run build` exit 0.

### Step G1.5 — Signed-out call room redirect (code complete, pending live verification)
The G0 §1 requirement says "the same link, not a separate URL" — but the G0–G2 build only made the guest lobby (`/meeting/:id/guest`) public; it never wired the redirect FROM the call room (`/meeting/[id]`) for signed-out visitors. A signed-out visitor clicking a shared meeting link currently hits Clerk sign-in instead of the guest lobby.

- **Review-process note:** a "same link" requirement must enumerate the middleware redirect rule explicitly in the implementation spec, not just the target route's public/protected status. This is the process gap G1.5 closes.
- **Fix (small, not a redesign):** in `src/middleware.ts`, add a redirect branch that detects the call room pattern (`/meeting/<id>` only, via strict regex `/^\/meeting\/[^/]+\/?$/`) and, when the visitor is unauthenticated (`!userId`), redirects to `/meeting/<id>/guest`. Signed-in visitors fall through to `auth.protect()` and land on MeetingSetup unchanged. `/meeting/:id/guest` is already public (excluded from the regex). `/meeting-intelligence/<id>` (detail page) is a distinct route — the regex does not match it, so it stays protected (confirmed by route tree: only `/meeting/[id]/page.tsx` and `/meeting/[id]/guest/` exist under `/meeting/`).
- **Verification:** `npx tsc --noEmit` clean (one pre-existing unrelated `AfterMeetingRecap.test.tsx` fixture error, confirmed on base), `npm run build` exit 0. **Pending live walk-through** (sandbox has no Clerk + Stream credentials): (1) signed-out → `/meeting/[id]` → guest lobby; (2) signed-in → `/meeting/[id]` → MeetingSetup unchanged; (3) `/meeting-intelligence/[id]` → still protected.
- **Pending live verification** — G4 is held until G1.5 is confirmed live.

### Step G3 — Owner per meeting toggle (open admission vs approval required)
- An owner-level setting per meeting: "Anyone can join freely" or "Require approval for guests". Stored zero-cost (Supabase, no new provider). "Anyone can join freely" admits directly; "Require approval" routes through G2.
- Decision point in `/architect`: when the toggle is stored and whether it is set at meeting creation or in-call (or both).
- **Verification:** the owner can set the admission mode per meeting; the mode is respected by the guest join path and the G2 approval UI; `npx tsc --noEmit` clean, `npm run build` exit 0.

### Step G4 — Attendance + transcript compatibility for guests
- A guest who joins without a Clerk account has no Clerk userId but still shows up correctly in attendance reports and generated transcripts using the name/identifier they provided.
- Uses the existing `attendance_events` columns (`stream_user_id`, `participant_name`, `participant_email`) and the `resolveSpeakerName` fallback chain — NO new schema.
- **Verification:** guests appear in attendance reports and transcripts by the name they provided; `npx tsc --noEmit` clean, `npm run build` exit 0.

### Step G6 — Edge case hardening for Guest Join with Owner Approval
- `/architect` first. Enumerate and gracefully handle every plausible edge case in the G0-G4 guest join flow. This is a comprehensive audit of the owner-approval path (the open-mode path is simpler and mostly covered by the same mechanisms).
- The 11 edge cases to analyze and resolve (each traced to actual code, not assumed):
  1. **Owner leaves within milliseconds of a guest's join request** — the guest's `POST /api/guest/request-join` arrives, the `guest.request_join` Stream event emits, but the owner has just left. Does the guest see a stale "waiting" forever, or does the system detect no-owner-present and respond appropriately (fall back cleanly, show a clear message, or admit via the next owner who joins)?
  2. **Guest requests and never returns (closes tab / navigates away)** — the pending entry sits in `guest-store.ts` with a 10-min TTL. Does the owner's Accept/Deny toast auto-clear when the TTL expires? Does the owner see a stale pending request?
  3. **Owner denies, guest immediately resubmits (same tab, new nonce)** — is a fresh request cleanly created, or does stale denied state leak through the `guest-store.ts` Promise-cache?
  4. **Two guests request simultaneously** — does the owner see two distinct, correctly-labeled toasts (no id collision, no dedup incorrectly merging different people)?
  5. **Owner flips `guest_admission_mode` from approval to open while a guest is already pending** — previously decided: pending stays pending, only new requests pick up open mode. Re-confirm this is still the actual behavior in code, not just the original decision.
  6. **Guest's poll experiences a network drop/reconnect** — does polling resume correctly via `GET /api/guest/status`, or does the guest get stuck in "waiting" forever?
  7. **Owner is NOT currently in the call** (e.g. viewing the meeting detail page) when a guest requests — does the poll-based fallback (not just the Stream call event) still surface the request somewhere the owner will see it, or explicitly document that it won't and whether that's acceptable?
  8. **Owner ends the call for everyone** while a guest is (a) still pending, or (b) freshly admitted but hasn't finished joining the SFU yet — what happens to the guest in each case?
  9. **Guest is admitted but their tab/browser was already closed before admission resolved** — confirm this doesn't leave a permanent ghost participant (relates to the earlier `updateCallMembers` removal — re-verify they hold under this specific timing).
  10. **Same guest opens two separate tabs/attempts for the same meeting** — two legitimate separate nonces/requests. Decide and document: is this acceptable (two independent join attempts), or should it be prevented/merged? State the decision explicitly.
  11. **Owner's own session expires (Clerk token) while the Accept/Deny toast is showing** — does clicking Accept then fail gracefully (redirect to sign-in, clear error) rather than silently doing nothing?
- **Output:** an approved architect document (`prompts/step-G6-edge-cases-architect.md`) covering each scenario with: current actual behavior (traced from code), verdict (acceptable vs needs fix), and a precise fix description if needed. No code written yet — this is the architect pass only.
- **Hard gate:** G7 comes after G6 is approved — do not do both at once.

### Step G7 — Responsive polishing for the guest join flow ✅
- `/architect` first (after G6 approval). Audit + fix responsiveness across every guest-facing screen: guest lobby (`/meeting/:id/guest`), name modal, waiting screen, and the owner's Accept/Deny toast (which lives in `MeetingRoom.tsx`). Cover all breakpoints (375 / 768 / 1440). Follow the same pattern as Step P13 (Responsive Polishing): canonical problem list, then fix in priority order. Hard rules: reuse the token system and Tailwind `sm:`/`md:`/`lg:`/`xl:` only, no new framework; the `GuestStreamClientProvider` preview + `GuestCallFlow` phases must stay usable on small screens.
- **Verification:** every guest-facing screen usable at 375, 768, and 1440 with no horizontal overflow, no unusable touch targets, and no broken call UI; `npx tsc --noEmit` clean, `npm run build` exit 0. All verified: 14 new revert-guard unit tests (G7.1–G7.8), 195/195 vitest green, build exit 0.
- **Built:** 10 canonical defects fixed (G7-D1 through G7-D10) across NameModal (`p-4 sm:p-6`, `whitespace-nowrap`), requesting overlays (`px-4 sm:px-8`), Accept/Deny toast (`min-w-[260px] sm:min-w-[280px]`, `max-w-[calc(100vw-2rem)]`, `w-[70px] sm:w-[90px]`), GuestWaitingScreen (`px-4 sm:px-6`, `text-body-sm sm:text-body-md`), TerminalScreen (`px-4 sm:px-8`), and GuestStreamClientProvider (`flex min-h-screen items-center justify-center`). Revert-guard tests in `src/components/GuestResponsive.test.tsx` and `src/components/MeetingRoom.test.tsx`.
- **Architect pass:** `prompts/step-G7-responsive-polishing.md` — 10 canonical defects (G7-D1 through G7-D10), 10 fix steps (G7.1 through G7.10).

### Step G8 — Guest Join Integration Audit · completed
- Systematically found every place in the app that displays, processes, or reasons about meeting participants and classified each for guest compatibility. All 8 bugs found (G8-F1 through G8-F8) fixed and verified.
- **Output**: `prompts/step-G8-integration-audit.md` — audit document. All fixes applied: `attendance-merge.ts` composite key with `stream_user_id`, `meetings/[id]` fallback query, `attendance/event` validation, `Navbar`/`Sidebar`/`FloatingChat` guest fallbacks, `ai/process` email notification, `AfterMeetingRecap.tsx` composite React keys + `meeting-recap.ts` `stream_user_id` select. **Verification:** 200/200 tests green, `tsc --noEmit` clean, build exit 0.

### Step G9 — Manual live walkthrough (reserved, no agent action)
- This step is user-owned, not agent-built. After G8 is complete, the user runs a full end-to-end live walkthrough of the entire Guest Join feature: create a meeting, share the link, sign out, join as a guest, owner accepts/denies, test each edge case from G6 manually. Catch any remaining inappropriate behavior before Deploy.
- **Output:** a user-reported pass/fail. No code, no architect, no agent action.

## Product Final Polishing (Steps P0 to P11, new — before Deploy)

A sequential manual QA polish pass. Each step is a discrete bug or UX fix found during a full walkthrough of the built app. Fix in priority order — **P0 first (usability-blocking), then P1 through P11**. Each step follows the project loop: `/architect` where a decision is needed, `/develop` to build, `/check verify` for live confirmation, `/test` where regression-worthy, `/sync` to close. The zero-cost rule still applies (no new paid tools); the only "new" UI is presentation-layer replacement (P9) that reuses the existing chat backend. No new AI/DB features beyond what the steps name.

### Step P0 — Stuck loaders / broken redirects (CRITICAL, app-wide) ⬜
- Audit every loading state across the app: page transitions, client data fetches (`useEffect` + `fetch`), and post-action redirects. Find every instance where a spinner can hang indefinitely or a redirect never resolves, trapping the user so they can only escape with a force-refresh.
- For each stuck state, add a bounded timeout plus a safe fallback (an error/retry state, or a redirect to `/dashboard`), so no path can trap the user.
- Known suspects to check (from prior work, not yet a full audit): the `StreamClientProvider` connect-on-mount fix removed the 5s `queryCalls` timeout; the recap `.txt` poll is already capped at ~5 min (keep that pattern); verify any other `fetch`/redirect that lacks a timeout or an error branch.
- **Verification:** walk every authenticated route; trigger each loading state (auth redirect, data fetch, post-action redirect) and confirm none hangs past a bounded timeout with a fallback (error/retry or safe redirect). Playwright regression for the highest-risk paths. `npx tsc --noEmit` clean, `npm run build` exit 0.

### Step P1 — Landing page redesign (light theme + real copy) ⬜
- `/architect` first (aesthetic direction before code). The landing page uses a dark background inconsistent with the rest of the app's light design system (Dashboard, Meeting Intelligence, etc. are all light-themed). Redesign to match the locked token system in `context/ui-tokens.md` (light theme, consistent tokens).
- Rewrite the generic marketing copy to actually describe NeuraMeet's real features — AI transcription, meeting intelligence, attendance reports, follow-ups, RAG chat — professionally, not placeholder text.
- **Design Fidelity Rule:** there is no `context/designs/*.png` for the landing page, so verify against `context/ui-tokens.md` + the light app surfaces; do not invent styling. The landing page is the public showcase, so a distinct light treatment (not the dark inverse-shell) is the goal.
- **Verification:** landing reads as part of the same light system as Dashboard/Meeting Intelligence; copy reflects real features; `npx tsc --noEmit` clean, `npm run build` exit 0.

### Step P2 — Sign-in/Sign-up testimonial panel ⬜
- The right-side testimonial ("NeuraMeet has completely transformed…") is static generic marketing fluff. Replace with something more useful/professional for a new user — e.g. a visual walkthrough of scheduling a meeting, or key feature highlights — instead of a fake quote.
- Keep the `AuthLayout` split (form left 40%, panel right 60%); only the right-panel content changes. The auth shell may keep its distinct treatment (per the existing `AuthLayout` pattern), but the fake testimonial goes.
- **Verification:** right panel shows a useful walkthrough/feature highlights, no fake testimonial; `npx tsc --noEmit` clean, `npm run build` exit 0.

### Step P3 — Dashboard loading skeleton (fixed size, no layout shift) ⬜
- The Meeting Intelligence and Meeting Follow-ups cards currently grow in height during their loading state (janky, unprofessional) before settling to final size.
- Fix: use a fixed-size skeleton loader matching the final card dimensions, so no layout shift (CLS) occurs between loading and loaded.
- **Verification:** no layout shift between loading and loaded states; skeleton matches final card height; `npx tsc --noEmit` clean, `npm run build` exit 0.

### Step P4 — Sidebar cleanup ⬜
- `/architect` first (icon strategy). (a) Several sidebar items (Personal Room, Follow-ups, Settings, etc.) share the same icon — give each a distinct, appropriate icon. Decide whether to keep the current PNG icons from `/icons/sidebar/*` or switch to distinct lucide icons (a larger change if switching); pick one approach.
- (b) Reorder sidebar items by actual importance/usage frequency (Dashboard first is already correct; Prep is currently last — move it up if it is a frequently-used feature; use judgment on the rest).
- (c) The bottom sidebar button shows "Uzair Javaid" / email but its actual function (sign out) is not clear from the UI. Redesign so its purpose (account menu / sign out) is obvious — e.g. add a visible chevron/dropdown indicator or an explicit menu-trigger affordance.
- **Verification:** each sidebar item has a distinct icon; order reflects usage; the account button clearly signals a menu/sign-out; `npx tsc --noEmit` clean, `npm run build` exit 0.

### Step P5 — Instant Meeting flow redesign (shareable link) ⬜
- Current flow (New Meeting → Create Now → straight into Meeting Setup → Meeting Room) does not match "instant meeting" — there is no way to invite others.
- Redesign: Create Now → generates a shareable meeting link the creator can copy/send → participants join via that link. This fulfills "instant meeting" (quick to start, shareable, others join in).
- Design the exact UX — link display, copy button, join button for the creator. Reuse the existing link generation (Schedule Meeting already produces `${origin}/meeting/${call.id}` with a Copy link control — reuse that pattern in `MeetingModel.tsx`).
- **Verification:** Create Now yields a shareable link + copy + join; a second user joining via the link lands in the room; `npx tsc --noEmit` clean, `npm run build` exit 0.

### Step P6 — Schedule Meeting modal missing title field ⬜
- The Schedule Meeting popup only has a description textarea — no title field. Title is the primary identifier used everywhere else (meeting lists, dashboard, detail, recap). Add a required title input.
- **Verification:** Schedule Meeting requires a title; the created meeting's `meetings.title` is populated and shows correctly in lists/dashboard/detail; `npx tsc --noEmit` clean, `npm run build` exit 0.

### Step P7 — Dashboard Quick Actions layout (3+2 grid) ✅
- Currently 5 quick-action cards in one cramped row. Change to a 3+2 grid (3 on top row, 2 on second row) so each card has more breathing room and is visually bigger/clearer.
- **Verification:** quick actions render as a 3+2 grid; cards larger/clearer; `npx tsc --noEmit` clean, `npm run build` exit 0.

### Step P8 — Dashboard Meeting Intelligence / Follow-ups layout (stacked) ✅
- Was side-by-side (two columns, `lg:grid-cols-12` with `lg:col-span-8` MI + `lg:col-span-4` Follow-ups). Changed to stacked full-width at all breakpoints: `DashboardContent.tsx` wrapper `grid grid-cols-1 gap-6 lg:grid-cols-12` → `grid grid-cols-1 gap-8`; MI panel `flex flex-col gap-4 lg:col-span-8` → `flex flex-col gap-4`; Follow-ups panel `flex flex-col gap-4 lg:col-span-4` → `flex flex-col gap-4`. Meeting Intelligence on top, Follow-ups below, each full-width.
- **Verification:** sections stack full-width; content breathes; `npx tsc --noEmit` clean, `npm run build` exit 0. Prompt: `prompts/step-P8-dashboard-stacked.md`.

### Step P9 — Floating support chat widget (bottom-right) — design revised 2026-08-26 ✅ (rebuilt)
- The original P9 shipped a minimal chat-bubble (collapsed FAB → `ChatPanel`). It was **redesigned** to a fuller **support chat widget** per the spec below. Presentation-layer change only — reuses the existing `ChatPanel` (meetingId optional) + `POST /api/ai/chat` backend; no new AI/DB feature. Rebuilt 2026-08-26: `tsc` clean (only the pre-existing unrelated `AfterMeetingRecap.test.tsx` fixture error), `npm run build` exit 0. Files: `src/components/FloatingChat.tsx` (rewritten widget), `src/lib/chatHistory.ts` (new, lists `sessionStorage` conversations + relative time), `src/components/meeting-intelligence/ChatPanel.tsx` (now persists `updatedAt`).
- `/architect` the redesign first: mount point stays `Sidebar_Com` (every authenticated nav page, excludes live `/meeting/[id]` call, hides on `/ai-chat`); decide (a) Home/Messages tab state model, (b) what backs "Recent message" + the Messages conversation list (static seed vs. last-session chat history from `/api/ai/chat` context — zero-cost, no new backend), (c) the "Ask a question" CTA/pill behavior (opens the chat composer / `ChatPanel`).
- **Widget spec (new design):**
  - **Trigger:** bottom-right `fixed` button opens a panel ~`380px` wide, `rounded-2xl`, dark theme, drop shadow.
  - **Header:** brand logo/name left; row of overlapping `rounded-full` team-member avatars right; `X` close far right.
  - **Greeting:** `Hi {userName} 👋` large bold heading; `How can we help?` subheading.
  - **Body (Home tab)** — stacked cards with subtle dividers between them: (1) **Recent message** = icon/avatar left, title bold, 1-line truncated preview, right-aligned relative timestamp (e.g. `"6d"`); (2) **Ask a question** static CTA card, subtext `"AI Agent and team can help"`, small avatar cluster right; (3) text link row with `ExternalLink` icon, no avatar.
  - **Footer:** 2-tab nav (Home, Messages), icon above label, active tab bold/highlighted.
  - **Messages tab:** swaps the body to a flat list of past conversations (icon, title, preview, timestamp); header/footer unchanged; a floating pill button **"Ask a question"** appears bottom-right in this view.
  - **Style:** dark bg (spec `#0e0e10`-ish → map to nearest design token, **do NOT hardcode hex** per global rule), white text, `rounded-full` avatars, subtle dividers, sans-serif bold headings. Icons from `lucide-react`.
- **Color note (decided in /architect):** stick with the existing design system — the panel uses the `inverse-*` tokens (`bg-inverse-surface` `#2D303D`, `text-inverse-on-surface` `#EFF0FF`, `inverse-primary` for accents). No new `#0e0e10` token is added (the spec's hex is a visual target only; the global "no hardcoded hex" rule holds). White text via `text-inverse-on-surface`; subtle dividers via `border-white/10`.
- **Verification:** widget opens from bottom-right on every authenticated page (excl. live call + `/ai-chat`); Home shows greeting + 3 cards; Messages tab swaps to conversation list + floating pill; reuses chat backend; `npx tsc --noEmit` clean, `npm run build` exit 0; Playwright regression open/close + tab switch.
- **Verification:** bubble appears on every authenticated page; opens/closes a slide-in chat panel; reuses the existing chat backend; `npx tsc --noEmit` clean, `npm run build` exit 0; Playwright regression for open/close + send.

### Step P9.1 — General AI chat page redesign (restyle, reuse ChatPanel) ✅
- The standalone `/ai-chat` page (built at FYP feature 12) currently renders `GeneralChat.tsx` inside a plain `flex flex-col gap-3` wrapper with no card container, so it reads as unfinished next to Dashboard / Meeting Intelligence / Follow-ups. `/architect` first (aesthetic direction, then restyle only).
- Re style so the chat area sits in a proper card container with consistent spacing and tokens, matching the rest of the product UI. Reuse the existing `ChatPanel` standalone variant (the same styling the meeting scoped AI Chat tab and the floating bubble already use) so all three chat surfaces are consistent.
- Re style `GeneralChat.tsx` and the `/ai-chat` page shell only. No new AI or database feature, no new route.
- **Verification:** the `/ai-chat` page reads as part of the same light card system as Dashboard / Meeting Intelligence / Follow-ups; spacing and tokens match `context/ui-tokens.md`; message bubbles match the meeting scoped tab and the bubble; `npx tsc --noEmit` clean, `npm run build` exit 0.
- **Done (2026-08-26):** `GeneralChat.tsx` wrapped in a `section` (Follow-ups page pattern) with an `h1` page title + `ChatPanel` as the card; `ChatPanel` standalone styling and `h-[60vh]` left untouched. `tsc` clean (only the pre-existing unrelated `AfterMeetingRecap.test.tsx` fixture), `npm run build` exit 0.
- **Follow-up built same session — Clear conversation button:** added a variant-aware `Trash2` **Clear conversation** button inside `ChatPanel` (next to the input) that wipes the chat via `clearChatStorage(chatId)` + `setMessages([])`, so the general page, the meeting tab, and the floating widget all clear identically. The widget's old duplicate header clear was removed and now defers to `ChatPanel`. No new AI/DB. `tsc` clean, `npm run build` exit 0.

### Step P10 — After-meeting recap page fixes ⬜
- (a) Bug: participant status shows "active" even after the meeting actually ended — should show "ended".
- (b) Bug: "Total Time" always shows "—", never calculates actual duration — fix the duration calculation (`getMeetingRecap` + `formatDuration` vs `recap.startedAt`/`endedAt`; ensure `endedAt` is set when the call ends).
- (c) Page feels too empty — enrich with more useful content/actions (use judgment — e.g. meeting summary preview if available, quick links).
- (d) Missing a "Back to Dashboard" button — add one, plus a way to reach Upload Transcript from this page.
- (e) Bug: browser back requires two presses to leave this page and reach the dashboard — fix the navigation/history stack so one back-press works.
- **Verification:** status shows "ended" post-call; Total Time calculates correctly; page enriched; Back to Dashboard + Upload Transcript reachable; one back-press leaves the page; `npx tsc --noEmit` clean, `npm run build` exit 0.

### Step P11 — Meeting Intelligence tabs — real-meeting data accuracy audit ✅
- Using a transcript generated from an ACTUAL meeting (via the F-series pipeline, not hand-typed), verify each tab's behavior:
- (a) **Attendance Report** — confirm this feature is intended active for EVERY meeting (not just some); audit the trigger condition and fix if it is not showing when it should.
- (b) **Category** — real meetings' transcripts are currently always categorized "Engineering" regardless of content. Investigate whether the categorization prompt/logic is broken for real-meeting-style transcripts (as opposed to hand-typed test transcripts, which categorize correctly). Fix so category reflects actual meeting content.
- (c) **Action Items** — real meetings currently show zero action items. Investigate whether this is correct (the test meeting had no actionable content) or a bug in extraction from F-series-generated transcripts specifically.
- (d) **Recording tab** — always shows "No recordings" even when a meeting's transcript came from the F-series Record → Generate Transcript → Upload flow (which requires the owner to have clicked Record, so a recording DOES exist). Fix: every meeting whose transcript came from that flow should show its actual recording.
- **Verification:** each tab reflects real-meeting data correctly; regression tests where feasible; `npx tsc --noEmit` clean, `npm run build` exit 0.

---

## Step P12 — Meeting pages updation (redesign, delete functionality, scroll fixes) ✅

A redesign pass over the four meeting list pages: Meeting Intelligence, Recordings, Previous, Upcoming. It adds the missing delete functionality across the app, fixes the stuck scroll on the Recordings and Previous pages, and fixes the useless controls the user flagged. Each sub page is its own `/architect` + `/develop` + `/check verify` + `/test` pass. The zero-cost rule applies: Supabase cascade deletes + Stream recording deletes only, no new paid tool. Each sub step gets its own approved prompt in `prompts/`.

### Step P12.0 — Delete functionality audit + shared delete primitive ✅
- Audit every feature that holds user-created data and decide which need a delete action. Confirmed targets: (1) **Meetings** — the four list pages all render meetings, so a cascade delete that removes the meeting plus its `transcripts`, `meeting_chunks`, `action_items`, `follow_ups`, `meeting_categories`, and `attendance_events`; (2) **Recordings** — delete the Stream recording (server-side Stream `call.deleteRecording`) for the owner; (3) **Follow-ups** — delete a follow-up (natural sibling of the existing status update). Not in scope: attendance report rows (owner-only read only), transcript partial clear (regenerate path already exists via re-upload).
- Build a shared, tokened delete confirmation pattern (a small confirm popover/dialog, not a raw `window.confirm`) reused by all four pages plus Follow-ups, with owner-only gating and clear destructive styling (the `error`/`on-error` tokens, never `primary`).
- Backend: add `DELETE /api/meetings/[id]` (owner-only via Clerk `auth()` + `meetings.user_id` check) that cascades the related rows, either via FK `ON DELETE CASCADE` added to `supabase/schema.sql` or explicit ordered deletes in the route (decide in `/architect`; prefer cascade constraints so future writes stay consistent). Add `DELETE /api/recordings/[id]` (owner-only, calls Stream `call.deleteRecording`). Add `DELETE /api/follow-ups/[id]` (owner-only) reusing the existing follow-ups server client.
- **Verification:** deleting a meeting removes it from Meeting Intelligence + Previous and unlinks its Recording "View insights" (the recording row stays but the link breaks); deleting a recording removes it from `/recording`; deleting a follow-up removes it from the Follow-ups list; each is owner-only (non-owner 401/404); `npx tsc --noEmit` clean, `npm run build` exit 0.

### Step P12.1 — Meeting Intelligence list: add delete ✅
- The list currently has only "Open Insights". Add a Delete (trash) control per row using the shared P12.0 primitive, calling `DELETE /api/meetings/[id]`, with confirm + cascade + refetch. Keep "Open Insights" → `/meeting-intelligence/[id]`.
- **Verification:** row delete removes the meeting everywhere and refetches the list; `npx tsc --noEmit` clean, `npm run build` exit 0.

### Step P12.2 — Recordings page: fix stuck scroll + add delete + analyzed features ✅
- **Fix stuck scroll:** the app shell is a fixed `h-screen overflow-hidden` chain (`src/app/(root)/layout.tsx` → `(home)/layout.tsx` `h-screen` → `Sidebar_Com` content div `overflow-y-auto`). Confirm the long list scrolls inside the bounded content column; if the flex `min-h-0` chain is broken at any parent, restore it so the Recordings list scrolls instead of being clipped. Add `overflow-y-auto`/max-height only where the scroll container is actually missing (do not paper over a root cause).
- Add a Delete (trash) control per recording using the shared primitive, calling `DELETE /api/recordings/[id]` (owner-only, Stream delete). Keep Play + View insights.
- **Analyzed necessary feature:** a search/filter input over the recordings list (by filename or linked meeting title). The list auto-polls for up to 15 minutes and grows, so a lightweight client-side filter over the already-fetched recordings is zero cost and stops a dead long list. Add an empty-filter state.
- **Verification:** long recording lists scroll; each row has Play + View insights + Delete; the filter narrows the list live; `npx tsc --noEmit` clean, `npm run build` exit 0.

### Step P12.3 — Previous meetings page: fix stuck scroll + replace useless "Open" + add delete ✅
- **Fix stuck scroll** (same chain audit as P12.2).
- The only control is "Open" → `router.push("/meeting/${call.id}")`, which lands on the Meeting Setup pre-call screen — useless for a past meeting. Replace it with "Open Insights" → `/meeting-intelligence/[id]` (the real post-meeting detail: insights, summary, recording, chat). Add a Delete control per row (cascade `DELETE /api/meetings/[id]`).
- **Verification:** "Open" is gone; past meetings open their insights; delete cascades; scroll works; `npx tsc --noEmit` clean, `npm run build` exit 0.

### Step P12.4 — Upcoming meetings page: disable Start until meeting time + add delete ✅
- The "Start" button is always active even though the meeting is in the future. Disable it until `call.state.startsAt` arrives: show a countdown ("Starts in 2h 15m") or "Starts soon" while disabled, and enable + highlight it at the start time (compute against `Date.now()` on render, poll ~30s). Keep Copy Link.
- Add a Cancel/Delete control per row (cascade `DELETE /api/meetings/[id]`, which also cancels the scheduled Stream call) so a scheduled meeting can be removed before it happens. Owner-only.
- Decision left to build: whether to also add an "Edit/Reschedule" — out of scope unless trivial, to avoid over-build; note it as a possible follow-up.
- **Verification:** Start stays disabled with a countdown until the start time, then enables; Cancel removes the scheduled meeting; `npx tsc --noEmit` clean, `npm run build` exit 0.

### Step P12.5 — Follow-ups delete + list/details action-cell consistency ✅
- `FollowUpList.tsx` per-row Delete + `FollowUpDetails.tsx` header Delete (the extra feature that needed delete; reuses the shared `ConfirmDelete` primitive + `DELETE /api/follow-ups/[id]`). The follow-up list action cell was restructured to the same 3-column shape as the other list pages (`md:col-span-4 md:flex-nowrap` + `whitespace-nowrap` on `Open`) so arming the two-step confirm never reflows.

### Step P12 scroll — sibling fix ✅
- The same plain-`<div>`-wraps-`Sidebar_Com` scroll bug was on `upcoming/page.tsx` and `personal-room/page.tsx`; both fixed by rendering `Sidebar_Com` directly. `meeting-intelligence` + `follow-ups` were already correct.

---

## Step P13 — Responsive Polishing (audit + fix responsiveness across every screen) ⬜

An audit first, then a fix pass over responsiveness across the entire app, so the product is usable on mobile (~375px), tablet (~768px), and desktop (~1440px), not just desktop first. Step P13.0 produces a canonical problem list (the same rigor as the A0 UI audit); P13.1+ fixes are spawned from that list in priority order (most used screens first: Dashboard, Meeting Intelligence, Meeting Room). Each fix is its own `/architect` (only where a layout decision is needed) + `/develop` + `/check verify` (real breakpoint testing) + `/test` where regression-worthy + `/sync` to close. Verification is manual per fix at true mobile width; this pass does not add automated Playwright viewport tests. Hard rules: reuse the existing token system and Tailwind `sm:`/`md:`/`lg:`/`xl:` utilities only, no new CSS framework and no new dependency; the sidebar must get a sensible mobile behavior (collapse / hamburger / off canvas) if it does not already have one, checked before assuming it is broken; the live call UI (Meeting Room + Meeting Setup) needs special attention so video tiles, the control bar, and the side panels (Recordings / People / Reactions) stay usable on small screens without breaking the call; tables and grids (Meeting Intelligence list, Follow-ups, Recordings) reflow to stacked cards on mobile instead of horizontal scroll or clipping; the floating chat bubble (P9) must not obstruct critical UI or become unusable on small screens; and every fix is verified at true mobile width, not just on a slightly shrunk window. Zero cost: layout and CSS only, no new AI/DB/paid tool.

### Step P13.0 — Responsive audit at 3 breakpoints ⬜
- Walk every screen at mobile (~375px), tablet (~768px), and desktop (~1440px): landing page, auth (sign in / sign up), dashboard, meeting intelligence (list + each tab: Overview, Summary, Action Items, Recording, Category, AI Chat), follow-ups (list + details), recordings, personal room, settings, search, prep, meeting room, meeting setup, after meeting recap. Record every responsiveness problem with its screen, breakpoint, and symptom (horizontal overflow / cramped or unreadable text / broken layout / unusable touch targets / bad sidebar behavior on small screens / tables or grids that do not reflow / modals or panels that do not fit the viewport). Also capture dropdown menu rendering (the shared `ui/dropdown-menu.tsx` has inert tokens that make Settings, category, and audio-type selectors look broken, including on mobile). Produce one canonical list, same rigor as the A0 audit, ordered by usage frequency. Also confirm the current sidebar behavior on mobile before proposing a change. The P13.1 through P13.10 numbers below are provisional and are finalized (merged or split) from the audit findings.
- **Verification:** the canonical audit list exists (in a prompt under `prompts/` and summarized here); every screen is covered; the sidebar's current mobile behavior is documented; `npx tsc --noEmit` clean.

### Step P13.1 — Sidebar mobile behavior ⬜
- (Spawned from P13.0; expected first because the sidebar wraps every authenticated screen.) Confirm the current behavior, then add a sensible mobile pattern (collapse to a hamburger / off canvas drawer) if missing, keeping the desktop sidebar intact. Owner avatar + sign out must stay reachable on mobile.
- **Verification:** at ~375px the sidebar collapses and the app is reachable; no content is hidden behind it; `npx tsc --noEmit` clean, `npm run build` exit 0.

### Step P13.2 — Landing page + auth pages ⬜
- (Spawned from P13.0.) Fix overflow / cramped copy / broken hero and footer grids / unusable auth inputs at mobile and tablet; keep the light token system.
- **Verification:** landing + auth render cleanly at 375 and 768; `npx tsc --noEmit` clean, `npm run build` exit 0.

### Step P13.3 — Dashboard ⬜
- (Spawned from P13.0; core flow, high priority.) Quick Actions 3+2 grid (P7), the stacked Meeting Intelligence / Follow-ups panels (P8), and the floating chat bubble already partly adapt; confirm and fix any remaining overflow, cramped text, or touch targets at 375/768.
- **Verification:** dashboard usable at all three breakpoints; `npx tsc --noEmit` clean, `npm run build` exit 0.

### Step P13.4 — Meeting Intelligence list + tabs ⬜
- (Spawned from P13.0; core flow.) Reflow the list to stacked cards on mobile; fix each tab (Overview, Summary, Action Items, Recording, Category) layout so text, tables, and the attendance report fit small viewports without horizontal scroll.
- **Verification:** list + every tab usable at 375/768; `npx tsc --noEmit` clean, `npm run build` exit 0.

### Step P13.5 — Follow-ups + Recordings reflow ⬜
- (Spawned from P13.0.) Reflow both lists to stacked cards on mobile (not horizontal scroll/clip); keep the per row controls (Open / Delete / Play) reachable as touch targets; confirm the Recordings filter input fits.
- **Verification:** both lists reflow to cards at 375; controls reachable; `npx tsc --noEmit` clean, `npm run build` exit 0.

### Step P13.6 — Meeting Room + Meeting Setup ⬜
- (Spawned from P13.0; live call UI, special attention.) Video tile grid, the control bar (mic / camera / screen share / leave / etc.), and the side panels (Recordings / People / Reactions) must stay usable on small screens without breaking the call. Confirm the device preview and pre call controls in Meeting Setup fit 375.
- **Verification:** a call can be joined, controlled, and left from a 375px viewport with all controls reachable and the tiles visible; `npx tsc --noEmit` clean, `npm run build` exit 0.

### Step P13.7 — Personal Room + Settings ⬜
- (Spawned from P13.0.) Fix overflow / cramped controls / unusable inputs in both at mobile and tablet.
- **Verification:** both usable at 375/768; `npx tsc --noEmit` clean, `npm run build` exit 0.

### Step P13.8 — Search + Prep + after meeting recap ⬜
- (Spawned from P13.0.) Search results, prep suggestions, and the recap timeline / next steps grids must fit small viewports without clipping or horizontal scroll.
- **Verification:** all three usable at 375/768; `npx tsc --noEmit` clean, `npm run build` exit 0.

### Step P13.9 — Floating chat bubble small screen ⬜
- (Spawned from P13.0.) Confirm the P9 bubble does not obstruct critical UI or become unusable at 375/768; it should stay reachable, not cover the control bar or primary actions, and the expanded panel must fit the viewport.
- **Verification:** bubble usable at 375/768, no obstruction of core UI; `npx tsc --noEmit` clean, `npm run build` exit 0.

### Step P13.10 — Shared dropdown menu tokens ⬜
- (Spawned from P13.0; underpins P13.4 / P13.6 / P13.7.) The shared `ui/dropdown-menu.tsx` uses inert shadcn tokens (missing `bg-popover`, `bg-accent`, and similar), so every dropdown from it renders unstyled or broken, including on mobile: the account menu (partially fixed locally), the layout/audio-type selectors in Meeting Setup, and the category selector in Meeting Intelligence. Add the missing token definitions (or map them to the existing `context/ui-tokens.md` values) so all dropdowns render correctly at every breakpoint. Owner-only and read surfaces unaffected.
- **Verification:** Settings, the Meeting Setup audio-type selector, and the Meeting Intelligence category selector all open and render correctly at 375/768; `npx tsc --noEmit` clean, `npm run build` exit 0.

---

## Signature Feature: Promise Ledger (Steps S0+, new, before Deploy)

The one feature meant to make NeuraMeet stand out to the FYP panel. Research and reasoning: `reports/NeuraMeet unique FYP feature.md`. Scope row: `docs/scope/scope.md` #17 (workflow tier GA: verify, test, a fresh review, then document).

### Step S0 — Promise Ledger architect ⬜
- Run `/architect promise ledger` before any code. Decide: the data model for ledger items (decisions and promises) and the links between them across meetings; where extraction runs (extend the existing `/api/ai/process` rather than duplicate it); how a new meeting is matched against open items (pgvector similarity over existing embeddings, then one LLM judgment call); the new API route(s), to be added to the AGENTS.md contract list; how Urdu English and Roman Urdu quotes are kept as evidence; and the owner confirm or reject flow
- Fix the claim wording now: "none of the major platforms or notetakers we reviewed", never "no app in the world". Check Gong's next steps tracking before the viva
- Output: a spec with a build plan; the S1+ steps below are filled from it

### Steps S1+ — Build (filled from the S0 spec) ⬜
- Expected shape, from the research report: extract decisions and promises with quote + timestamp; store and embed them; match each new meeting against open items and set kept / open / overdue / reversed; ledger UI (a tab or page) with evidence quotes, reversal alerts, and confirm or reject; feed open items into meeting prep; seeded three meeting bilingual demo
- **Verification:** a hand labelled set of 30 to 50 meeting pairs (about half Urdu English), precision and recall reported per language; `npx tsc --noEmit` clean, `npm run build` exit 0, vitest green
- **Zero cost:** about 2 to 3 Gemini calls per meeting (Groq fallback) plus one embedding batch; no extra Whisper calls; no new provider

---

## Step 11 — Deploy, then polish and harden
- Deploy to Vercel (free tier)
- Verify every navigation path, loading state, error state, and that no secret leaks to the client bundle
- Confirm all AI/DB usage stays within Supabase and Gemini/Groq free-tier limits
- **Resilience hardening (pre-deploy):** make Groq fallback selection resilient to future model retirements. Today `src/agent/models.ts` hardcodes one `fallbackModel` id (`openai/gpt-oss-20b`) that feeds `withFallback`, `resolveChatModel`, and `generateStructuredWithFallback`, so a single retirement silently breaks every AI fallback (prep, RAG chat, search). Before the production deploy, replace the single hardcoded id with a small ordered candidate list (for example `openai/gpt-oss-20b`, then `openai/gpt-oss-120b`, then other free-tier ids available on this account) probed at startup or inside `npm run check:providers`, and pick the first live one. Candidate list = the models currently available on this Groq account. This is the durable fix for the C2-era fallback breakage.
  - **Also evaluate during this pre-deploy pass (added 2026-08-28):** Gemini free-tier rate limiting is currently so heavy that Groq is effectively carrying all AI load. Determine whether that limit is **quota-based** (fixed daily/monthly cap) or **burst-based** (short-term spikes rejected with 503), and whether **request pacing** (e.g. a small concurrency cap or token-bucket throttle on the primary) meaningfully reduces the fallbacks. This is a resilience concern, not an active bug — the fallback is working as designed. **Do NOT swap providers mid-debug:** while F9/P10/P11 are still open, keep Gemini primary + Groq fallback exactly as-is. Any provider swap (for example OpenRouter as a multi-model proxy) is **deferred to AFTER deploy is stable** and must be scoped as its own `/architect` decision at that point, not now.

---

Each step = one short prompt naming the relevant skills, one AI-written plan in `prompts/`, one approval, one implementation, one verification — per the Vibe Engineering loop.
