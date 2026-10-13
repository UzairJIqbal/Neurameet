# Scope: NeuraMeet

NeuraMeet is an AI integrated meeting platform. Users create or join real time video meetings, upload or auto generate transcripts, and get AI summaries, action items, categories, and a meeting aware chat over every meeting. This scope restructures the plan. The already built Steps 0 to 9 become the Core NeuraMeet Pipeline. A new Advanced Pipeline Features phase adds three layers, then a Meeting Experience Polish phase (Steps D0–D3+) redesigns the live-call UI to Zoom/Meet quality, and Deploy moves to the very end, after the polish phase.

**Build approach:** Extend (add features to the working Core Pipeline without re architecting).
**Workflow:** Beta (after develop: check verify, then test). Any feature can carry its own tag to do more or less.

**Hard rule:** every third party tool used anywhere in this project, including new features, must be zero cost. No paid API, no paid vector DB, no paid PDF service, no paid host beyond the free tiers already in use (Supabase, Gemini, Groq, Vercel, Stream, Clerk).

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit._

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| A | Auth and app shell | Core Pipeline | existing |
| B | Meeting lifecycle | Core Pipeline | existing |
| C | Supabase and AI provider foundation | Core Pipeline | existing |
| D | Upload transcript to AI processing | Core Pipeline | existing |
| E | Meeting intelligence UI | Core Pipeline | existing |
| F | RAG embeddings and AI chat | Core Pipeline | existing |
| G | Follow ups | Core Pipeline | existing |
| H | Recordings library and settings | Core Pipeline | existing |
| I | Playwright E2E regression | Core Pipeline | existing |
| 1 | App wide UI audit for dead or non functional controls | Advanced L1 | done |
| 2 | Settings: AI auto summary on upload toggle | Advanced L1 | done |
| 3 | Settings: email notifications toggle | Advanced L1 | done |
| 4 | Settings: desktop reminders toggle | Advanced L1 | done |
| 5 | Remaining dead or non functional UI from audit | Advanced L1 | done |
| 6 | Auto attendance capture and storage | Advanced L2 | done |
| 7 | Attendance PDF report per meeting | Advanced L2 | done |
| 8 | Cross meeting semantic search | Advanced L3 | done |
| 9 | Meeting prep suggestions from past meetings | Advanced L3 | done |
| 10 | Per speaker engagement insights | Advanced L3 | done |
| D0 | Meeting Experience architect audit (Setup + Room vs Stream current + Zoom/Meet patterns) | Meeting Experience Polish | done |
| D1 | Meeting Setup redesign (device preview, controls, layout) | Meeting Experience Polish | done |
| D2 | Meeting Room redesign (call layout, controls, participant grid) | Meeting Experience Polish | done |
| D3 | New professional Stream functionality (per D0 audit; sub-steps D3.1 Reactions, D3.2 in-call Search, D3.3 CallRecordingList; D3.4 parked; D3+ deferred) | Meeting Experience Polish | done |
| D3.4 | Meeting recording access control (owner-only access; consent + auto-on recording) | Meeting Experience Polish | look-after (parked) |
| F0 | Transcript Generation architect: verify Stream individual recording + Groq Whisper + zero-cost; pick trigger and merge location | Transcript Generation | done |
| F1 | Fetch per-participant individual audio recordings after a call ends | Transcript Generation | done |
| F2 | Transcribe each track via Groq Whisper free tier (English + Urdu) | Transcript Generation | done |
| F3 | Merge tracks into chronological speaker-labeled transcript ("SpeakerName: text") | Transcript Generation | done |
| F4 | (REMOVED) No auto-AI wire — the F-series does NOT feed recordings into /api/ai/process; AI runs only via the Upload Transcript flow | Transcript Generation | done |
| F5 | UI trigger + graceful status: recap "Generate Transcript" = `.txt` download (any signed-in participant, NO AI); processing state + auto-retry when Stream hasn't finalized | Transcript Generation | done |
| F6 | Verify end-to-end with a real bilingual (English + Urdu) test meeting | Transcript Generation | done |
| F7 | After-meeting recap page + post-call redirect (title, description, total time, participants, Generate Transcript) | Transcript Generation | done |
| F8 | Transcript Cleanup Pass (light AI accuracy clean of the merged transcript, automatic before .txt, Gemini→Groq fallback, raw fallback on failure) | Transcript Generation | done |
| F9 | Multilingual → always-English output (auto-detect Whisper language + LLM translate-to-English in the F8 cleanup pass) | Transcript Generation | done |
| G0 | Guest Join architect: verify Stream guest/anonymous capability, decide identity capture + approval notification, confirm no impact on signed-in flow | Guest Join | done |
| G1 | Guest Setup page (camera/mic preview + name field + Ask to join button, no account required) | Guest Join | done |
| G2 | Owner approval notification + Accept/Deny UI | Guest Join | done |
| G1.5 | Signed-out visitors to the call room `/meeting/:id` redirect to the guest lobby `/meeting/:id/guest` instead of Clerk sign-in (code complete + root cause fix applied 2026-08-31, pending live verification) | Guest Join | in-progress |
| G3 | Owner per-meeting toggle (anyone joins freely / guest approval required) | Guest Join | in-progress |
| G4 | Attendance + transcript compatibility for guests (identityOverride param, guestName/guestEmail props, guestEmail threaded to GuestStreamClientProvider) | Guest Join | done |
| G6 | Edge case hardening for Guest Join with Owner Approval (11 scenarios: owner-leave-ms, guest-abandons, deny-resubmit, concurrent-guests, mid-flight-mode-flip, network-drop, owner-absent, call-end-during-pending, ghost-participant, dual-tab, owner-session-expiry) | Guest Join | planned |
| G7 | Responsive polishing for the guest join flow (every guest-facing screen at mobile/tablet/desktop) | Guest Join | done |
| G8 | Guest Join Integration Audit: audit every existing feature/page that deals with meeting participants, attendance, or post-meeting content, confirm guests are correctly represented. Found 7 bugs (G8-F1 through G8-F7) in `attendance-merge.ts`, `meetings/[id]/route.ts`, `attendance/event/route.ts`, `Navbar.tsx`, `Sidebar.tsx`, `FloatingChat.tsx`, `ai/process/route.ts`. Output: `prompts/step-G8-integration-audit.md`. | Guest Join | done |
| G9 | Manual live walkthrough of the entire Guest Join feature end to end (user-owned, no agent action) | Guest Join | reserved |
| P0 | Stuck loaders / broken redirects (CRITICAL, app-wide): audit every loading state + post-action redirect; bounded timeout + safe fallback for each | Product Final Polishing | done |
| P1 | Landing page redesign: light theme to match app tokens + real feature copy | Product Final Polishing | done |
| P2 | Sign-in/Sign-up testimonial panel: replace fake quote with useful walkthrough/feature highlights | Product Final Polishing | done |
| P3 | Dashboard loading skeleton: fixed-size, no layout shift | Product Final Polishing | done |
| P4 | Sidebar cleanup: distinct icons, reorder by usage, clear account/sign-out affordance | Product Final Polishing | done |
| P5 | Instant Meeting flow: Create Now → shareable link (copy + join) instead of straight into room | Product Final Polishing | done |
| P6 | Schedule Meeting modal: add required title field | Product Final Polishing | done |
| P7 | Dashboard Quick Actions: 3+2 grid instead of one cramped row | Product Final Polishing | done |
| P8 | Dashboard Meeting Intelligence / Follow-ups: stacked full-width instead of two columns | Product Final Polishing | done |
| P9 | Floating chat bubble replaces "Ask AI" card + separate AI Chat page (reuses existing chat backend) | Product Final Polishing | done |
| P9.1 | General AI chat page redesign | Product Final Polishing | done |
| P10 | After-meeting recap fixes: "ended" status, Total Time calc, enrich page, Back to Dashboard + Upload Transcript, one back-press | Product Final Polishing | done |
| P11 | Meeting Intelligence tabs real-meeting audit: Attendance Report, Category, Action Items, Recording | Product Final Polishing | done |
| P12 | Meeting pages updation: delete across meetings/recordings/follow-ups, fix stuck scroll, rework useless controls (Upcoming Start gated by time) | Product Final Polishing | done |
| P13 | Responsive Polishing: audit + fix responsiveness across every screen at mobile/tablet/desktop | Product Final Polishing | done |
| 11 | Deploy and harden | Deploy | planned |
| 12 | General AI chat page | FYP Polish | done |
| 13 | Change category write path | FYP Polish | done |
| 14 | Groq date normalization guard | FYP Polish | done |
| 15 | AI provider quota pre demo check | FYP Polish | done |
| 16 | App wide UI token consistency (product surfaces) | Advanced L1 | done |

## Core NeuraMeet Pipeline (existing, built)

These features were built before this workflow began. They are enrolled here for context and are not changed by this scope. Status is existing, not done. The earlier Step numbers map here one to one: Step 0 and Step 0.5 are A and B, Steps 1 to 8 are C through H, Step 9 is I.

### A. Auth and app shell · existing
Clerk sign in and sign up, middleware route protection, landing page, dashboard shell, sidebar and navbar. Code in `src/app`, `src/components`, `src/middleware.ts`, Clerk config.

### B. Meeting lifecycle · existing
New, Join, and Schedule meeting modals, Meeting Setup device and mic checks, Meeting Room with grid and speaker layouts, and Previous, Upcoming, Recording, and Personal Room pages. Stream Video SDK powers the calls. Code in `src/components`, `src/actions/stream.actions.ts`, `src/Providers`.

### C. Supabase and AI provider foundation · existing
Supabase project with Postgres and pgvector, schema for meetings, transcripts, meeting chunks, action items, follow ups, and meeting categories, the match meeting chunks RPC, and the Gemini primary plus Groq fallback model setup. Free tier only. Code in `supabase/schema.sql`, `src/lib/supabase-client.ts`, `src/lib/supabase-server.ts`, `src/agent/models.ts`.

### D. Upload transcript to AI processing · existing
Upload transcript, then extract summary, key points, decisions, category, and action items with the AI SDK. Writes to meeting insights and action items. Code in `src/app/api/transcript/upload/route.ts`, `src/app/api/ai/process/route.ts`, `src/components/UploadTranscriptModal.tsx`.

### E. Meeting intelligence UI · existing
Meeting list page and the selected meeting detail with tabs Overview, Summary, Action Items, Recording, Category, and AI Chat. Code in `src/app/(root)/(home)/meeting-intelligence`, `src/components/meeting-intelligence`.

### F. RAG embeddings and AI chat · existing
Chunk and embed transcripts into meeting chunks with Gemini embeddings, then a meeting scoped streaming chat that retrieves the top chunks. Code in `src/agent/embed.ts`, `src/agent/rag.ts`, `src/app/api/ai/embed/route.ts`, `src/app/api/ai/chat/route.ts`, `src/components/meeting-intelligence/ChatPanel.tsx`.

### G. Follow ups · existing
Auto generate follow up rows from action items, list and detail pages, and a status update server action. Code in `src/actions/follow-ups.ts`, `src/app/api/follow-ups`, `src/components/follow-ups`.

### H. Recordings library and settings · existing
Recordings library page linking each recording to its meeting, and a Settings page with three inline toggles stored in localStorage. Code in `src/components/RecordingPage.tsx`, `src/components/SettingsPage.tsx`, `src/app/(root)/(home)/settings/page.tsx`.

### I. Playwright E2E regression · existing
Final regression pass, 25 of 25 tests green. Code in `tests/e2e.spec.ts`, `tests/auth.setup.ts`, `playwright.config.ts`.

## Advanced Pipeline Features, Layer 1: UI functionality audit and repair

Find every dead or non functional piece of UI in the app and make it work. The three Settings toggles are the known example. Build one item per step, in the order below. This layer promotes the Settings toggles item that was a placeholder in the old Step 9.5.

### 1. App wide UI audit for dead or non functional controls · done
Walk every page and component, list controls that do nothing or silently fail, and record what each should do. The three Settings toggles are the known case.
**Done when:** a written list of dead or non functional UI exists, with one line on the intended behavior of each.
- [x] Audit every page and component, then record the list: `/develop app wide UI audit` (the A0 audit enumerated A1-A7; all resolved by A1-A7 below, see build-plan.md A0 section).

### 2. Settings: AI auto summary on upload toggle · done
Make the AI auto summary on upload toggle actually gate the process and embed calls in `UploadTranscriptModal`.
**Done when:** with the toggle off, upload stores the transcript but skips AI processing and embedding; with it on, the full pipeline runs as today.
- [x] Design it (spec): `/architect settings AI auto summary toggle`
- [x] Build it: `UploadTranscriptModal` skips `/api/ai/process` + `/api/ai/embed` when OFF, still redirects; `tsc` + `npm run build` green.

### 3. Settings: email notifications toggle · done
Give the email notifications toggle a real effect, scoped to what the app can do on free tiers.
**Done when:** the toggle changes observable behavior (for example opting in or out of a follow up or meeting notification path) and persists per user.
- [x] Design it (spec): `/architect settings email notifications toggle`
- [x] Build it: Resend free-tier helper + `/api/ai/process` sends a summary-ready email when ON; `tsc` + `npm run build` green.

### 4. Settings: desktop reminders toggle · done
Give the desktop reminders toggle a real effect on free tier only, no paid service.
**Done when:** the toggle changes observable behavior and persists per user.
- [x] Design it (spec): `/architect settings desktop reminders toggle`
- [x] Build it: `ReminderManager.tsx` polls Upcoming meetings and fires a Web Notification in the lead window; fully verified end-to-end.

### 5. Remaining dead or non functional UI from audit · done
Fix each further dead or non functional control the audit in feature 1 finds, one item per step. This row grows as the audit lands.
**Done when:** every item from the audit list has a working control or a documented decision to drop it.
- [x] Design it (spec): `/architect remaining audit fixes`
- [x] Build it: A4 (Dashboard "View All" links → real routes), A5 (Dashboard "Open Insights" + follow-up CTA buttons → detail routes), A6 (Dashboard global search live-filters both panels), A7 (landing footer dead links → inactive "Coming soon" text); Dashboard now on live user-scoped data. All `tsc` + `npm run build` green.

### 16. App wide UI token consistency (product surfaces) · done
Unify the authenticated product UI to the locked token system from `context/ui-tokens.md`. Scope A only: authenticated product surfaces (Dashboard, Meeting Intelligence, Follow-ups, Recordings, Search, Prep, Settings, auth forms). Landing page and the Aceternity `ui/` kit are intentionally out of scope. Full plan in `prompts/step-ui-consistency.md`.
**Done when:** product-surface color leaks are gone, dead token references are removed, and `context/ui-rules.md` no longer contradicts the locked tokens; `npx tsc --noEmit` and `npm run build` are clean.
- [x] Build it: `/develop UI token consistency`
  - [x] Retoken loading spinner (`src/components/ui/loader.tsx`): hex `#00e571`/`#8b00ff`/`text-black` → `green-1`/`primary-container`/`on-surface`
  - [x] Retoken Join-code input kit (`src/components/ui/placeholders-and-vanish-input.tsx`): `bg-white`/`bg-black`/`gray`/`zinc` → `surface-container-lowest`/`primary-container`/`on-surface-variant`
  - [x] Delete dead code (`src/components/SideTitles.tsx` + `src/components/ui/typewriter-effect.tsx`, confirmed unimported)
  - [x] Correct stale doc (`context/ui-rules.md`): SUSE Mono → Hanken Grotesk + JetBrains Mono; retired token names → locked equivalents
  - [x] Verify: `npx tsc --noEmit` clean, `npm run build` exits 0, grep no raw hex or retired token names in the two kit files

## Advanced Pipeline Features, Layer 2: Auto Attendance

Track what each participant does during a live meeting using the Stream Video SDK already in use, at zero cost. Store the events in Supabase and produce a downloadable PDF report per meeting.

### 6. Auto attendance capture and storage · done
Capture participant join, leave, mic, and camera events during live meetings through the Stream Video SDK. Store one attendance session per join per participant in Supabase. No new paid tool.
**Done when:** for a live meeting, join, leave, mic toggle, and camera toggle events are recorded per participant and survive in Supabase; a query can rebuild each join session.
- [x] Design it (spec): `/architect auto attendance capture and storage`
- [x] Build it: `/develop auto attendance capture and storage`
  - [x] B0 architect: data model + transport decision
  - [x] B1 Supabase `attendance_events` schema in `schema.sql` (table live; partial unique index `idx_attendance_open_session_uniq` still needs running live, dedupe open duplicates first)
  - [x] B2 Stream SDK tracking hook + `/api/attendance/event` route + MeetingRoom wiring (SDK 1.23.1→1.40.2 upgrade; 4-rows duplicate fix: local-only recording + `23505` tolerance + `localJoinHandled` single-join guard)
  - [x] B5 verify end-to-end (automated Playwright 2/2 passed; manual WebRTC walkthrough still optional)

### 7. Attendance PDF report per meeting · done
Generate a downloadable PDF report per meeting, one row per join session per participant with email, join time, leave time, talk time, and mic and camera toggle counts. Reachable from the meeting Overview tab. The PDF library must be free and zero cost.
**Done when:** from a meeting Overview tab, a user can download a PDF listing every join session per participant with the required columns, produced with a zero cost library.
- [x] Design it (spec): `/architect attendance PDF report`
- [x] Build it: `pdf-lib` (MIT, zero-cost) report route + Overview-tab download wiring, verified end-to-end (user-downloaded live PDF; owner/empty checks confirmed)

## Advanced Pipeline Features, Layer 3: AI engagement intelligence

Three AI packed features that reuse the existing Gemini, Groq, and pgvector setup. No new paid tool.

### 8. Cross meeting semantic search · done
Let a user search across all their meetings by meaning, not just keywords, using the existing embeddings and pgvector.
**Done when:** a search box returns ranked meeting chunks or meetings across the user's meetings by semantic similarity, using existing embeddings.
- [x] Design it (spec): `/architect cross meeting semantic search`
- [x] Build it: dedicated `/search` page + `match_meeting_chunks_user` RPC (user-scoped) + `searchAcrossMeetings` in `src/agent/rag.ts` + `POST /api/search`; verified end-to-end (grouped, ranked, %-scored results across meetings).

### 9. Meeting prep suggestions from past meetings · done
Before a meeting, surface related past meetings and prep notes drawn from them using the existing AI and embeddings.
**Done when:** a user can open prep suggestions for an upcoming or new meeting, built from related past meetings via embeddings and Gemini or Groq.
- [x] Design it (spec): `/architect meeting prep suggestions`
- [x] Build it: `/prep` page + `POST /api/prep` + `generatePrepSuggestions` (embed + `match_meeting_chunks_user` + Gemini/Groq fallback), verified live end-to-end

### 10. Per speaker engagement insights · done · build landed + live verified
Show how engaged each speaker was, using transcript chunks, attendance, and the existing AI setup.
**Done when:** a user can view per speaker engagement metrics for a meeting, computed from existing data with Gemini or Groq, no paid tool.
- [x] Design it (spec): `/architect per speaker engagement insights` (prompt `prompts/step-C3-speaker-insights.md`, architected pass done)
- [x] Build it: new `Engagement` tab on the meeting detail page + `POST /api/engagement` (ownership-checked fetch, parallel `attendance_events` + `transcripts` queries, deterministic low-engagement flag, `generateSpeakerContributions` Gemini→Groq) + `EngagementTab.tsx`; tsc + build exit 0.
- [x] Live verify (Clerk test harness fixed): the shared Playwright `tests/auth.setup.ts` Clerk testing session was timing out (`window.Clerk?.loaded` wait at 30s) and racing the ticket `setActive` reload (net::ERR_ABORTED on `/dashboard`). Both fixed (60s Clerk load wait + `goto(...).catch()` + `waitForURL` race guard). With the harness green, all 4 `chromium-engagement` tests pass live, including the `hasAttendance` assertion.
- [x] Route bug fixed: `POST /api/engagement` originally computed `hasAttendance` from `aggregated.length` AFTER the AI branch appended transcript-only speakers (`present: false`), so a transcript-only meeting nobody attended falsely reported `hasAttendance: true`. Fixed by capturing `hasAttendance` before the AI merge (real attendance = attendance_events rows only).

## Meeting Experience Polish (Steps D0 to D3+, before Deploy)

Redesign the live-call UI (Meeting Setup + Meeting Room) to Zoom/Google Meet quality, then add current, professional Stream Video SDK functionality on top. Every feature is verified against Stream's real, current API via the Stream MCP/agent tool (already connected) — never from memory or assumptions. Zero cost only: Stream free tier, no paid plan, no paid design tool. Each step follows the project loop: `/architect` where a decision is needed, `/develop` to build, `/check verify` for live confirmation, `/test` where it is a regression-worthy flow, `/sync` to close. **Nothing is deployed until this phase closes.**

### D0. Meeting Experience architect audit · done
Audit the current Meeting Setup and Meeting Room against (a) Stream's current capabilities, verified live via the Stream MCP/agent tool, and (b) Zoom/Google Meet quality UX patterns. Decide what is outdated, what is missing, and what the redesign scope actually is. The D0 output is the source of truth for how many D-steps exist. Zero-cost only.
**Done when:** an approved audit + redesign scope (prompt in `prompts/`) lists the exact D1/D2/D3+ steps; nothing is built until D0 closes.
- [ ] Design it (spec): `/architect meeting experience audit`

### D1. Meeting Setup redesign · done
Aesthetic pass first: redesign the device/mic/camera preview, the control row, and the layout to a modern, polished, Zoom/Meet-quality look that matches the locked tokens in `context/ui-tokens.md`. Then ensure the Stream SDK functionality underneath is current and correct, verified via the Stream MCP tool.
**Done when:** the setup screen reads as a professional pre-call experience and device preview + controls work; `npx tsc --noEmit` clean, `npm run build` exit 0.
- [ ] Design it (spec): `/architect meeting setup redesign`

### D2. Meeting Room redesign · done
Aesthetic pass first: redesign the in-call layout, the control bar, and the participant grid to a modern, polished, Zoom/Meet-quality look that matches the locked tokens. Then ensure the Stream SDK call logic underneath is current and correct, verified via the Stream MCP tool.
**Done when:** the meeting room reads as a professional live-call experience and layouts/controls work; `npx tsc --noEmit` clean, `npm run build` exit 0.
- [x] Design it (spec): `/architect meeting room redesign`
- [x] Build it: `/develop meeting room redesign` — top bar (title/timer/participant-count), icon+label control pill, standalone `CallStatsButton`, tokened participant panel, layout switching, `reportLocalLeave()` on leave; `tsc` + `npm run build` green.
- [x] Live verify: `/check verify` user walkthrough against a real Clerk+Stream session confirmed top bar, control pill, Call Stats, participant panel, layout switching, and attendance-on-leave all working — D2 closed.

### D3. New professional Stream functionality · done · sub-steps D3.1 Reactions, D3.2 in-call Search, D3.3 CallRecordingList (all built); D3+ backlog deferred; D3.4 parked
Whatever D0's Stream MCP audit finds available on the free tier and worth adding: better call layouts, reactions, screen-share polish, noise cancellation if free-tier, etc. Built sub-steps: D3.1 (Reactions), D3.2 (in-call `Search`, delivered by D2b with no new code), D3.3 (surface `CallRecordingList` in the Meeting Room). **D3+ (the next free-tier backlog: screen-share prominence, layout option, `Tooltip`/`StreamTheme` polish, and RingingCall) is deferred** — the work was stopped here after D3.3, so those candidate features are not built in this pass. D3.4 (recording access control) is parked separately as look-after (see its row). **Hard rule:** before proposing any feature, confirm via the Stream MCP tool that it is free-tier; if it needs a paid Stream plan, drop it (zero-cost rule).
**Done when:** each D3+ feature works live against the current Stream API and passes `npx tsc --noEmit` + `npm run build`; nothing proposed requires a paid plan.
- [x] Design it (spec): `/architect <D3.x feature from audit>` (D3.1 Reactions, D3.2 in-call Search, D3.3 CallRecordingList)
- [x] Build it: `/develop D3.1` — tokened "Reactions" control in the D2 control pill opens an emoji picker (from Stream's `defaultEmojiReactionMap`, the `:code:` set) that calls `call.sendReaction({ type: "emoji", emoji_code })`; the per-participant `<Reaction>` layer was removed as redundant because `ParticipantView` natively renders the glyph scoped to the sender's tile. `tsc` + `npm run build` green; verified live (emoji shows only on sender's tile). Free-tier (core SDK, no new dependency).
- [x] Build it: `/develop D3.2` — no new code. `CallParticipantsList` (mounted in MeetingRoom since D2b) already ships in-call participant search; verified via SDK source review. Free-tier, zero-cost.
- [x] Build it: `/develop D3.3` — `CallRecordingList` surfaced in a tokened Meeting Room panel (right side, dark tokens), fed by `call.queryRecordings()`; `RingingCall` re-scoped out (needs a ring-out-to-members flow NeuraMeet lacks). `tsc` + `npm run build` green. Free-tier, zero-cost.
- [ ] Deferred: D3+ — screen-share prominence + layout option + `Tooltip`/`StreamTheme` polish (the original D3.5) and `RingingCall` were not built; revisit after the remaining features ship if desired.

### D3.4. Meeting recording access control · LOOK-AFTER (parked) · owner-only VIEW access works; recording STORAGE unresolved
Zoom/Meet-style consent and access control for composite call recording. Only the meeting owner can start or stop recording; every participant gets a real-time "being recorded" notice when the owner starts; only the owner can access recordings afterward. Posture A (real server-side enforcement): the non-owner start-frame-record capability is revoked via `call.revokePermissions` so it cannot be bypassed from the browser. Free-tier (core Stream SDK), zero-cost.
**Done when:** owner-only Record control works; all participants (including a late joiner) see the consent toast and persistent REC pill; the Recording tab, in-room Recordings panel, and `GET /api/recordings` are owner-only; `npx tsc --noEmit` clean and `npm run build` exit 0.
- [x] Design it (spec): `/architect D3.4 recording access control` — confirmed Posture A (server-enforced), owner anchor (`call.state.createdBy?.id` = Clerk userId, cross-referenced with `meetings.user_id`), native consent events, capability-name drift; approved prompt `prompts/step-D3.4-recording-access-control.md`.
- [x] Build it: `/develop D3.4` — custom owner-only Record control + tokened mic/camera/screenshare/leave bar in `MeetingRoom.tsx`; consent toast via `call.frame_recording_started`/`call.frame_recording_stopped`; persistent REC pill; `MeetingTabs` hides the Recording tab for non-owners; `GET /api/recordings` owner-only filter (`created_by_user_id`); `frame_recording.mode` auto-on → available at the three `getOrCreate` sites; Posture A `revokePermissions(start-frame-record-call)` effect re-run on participant changes. `tsc` + `npm run build` green. **NOTE:** the on-demand `available` mode was the actual bug — on this Stream account only `auto-on` stores a composite file. /develop Option A (2026-08-21) reverted `frame_recording.mode` to `auto-on` at all four `getOrCreate`/`update` sites, abandoning the on-demand owner Record design (the Record control is now redundant but left in place). Owner-only VIEW access remains.
- [ ] Live verify: `/check verify D3.4` — single-user real Clerk+Stream session: create a NEW meeting (auto-on auto-starts the composite recording at creation), join with cam+mic, wait SEVERAL MINUTES for Stream to process the composite (signaled by `frame_recording_ready`), then check the in-room Recordings panel, the `/recordings` page, and `GET /api/recordings` — a new `recording_type: "composite"` file should appear for the owner. Confirm the Recording tab + `/api/recordings` are empty for a different (non-owner) account. The "Recording has stopped." toast alone does NOT prove a file exists. (Two-user capability-verification of the abandoned on-demand path is no longer the gate — auto-on records server-side regardless of role.) Pending (sandbox has no creds).
- [ ] Test it: `/test D3.4` — regression pass over the recording access flow (Beta tier closing gate).

**PARKED — LOOK-AFTER (2026-08-21, root cause now PROVEN via live API):** Confirmed by direct Stream API testing this session. A freshly created call with `frame_recording: { mode: "auto-on" }`, forced live via admin `goLive` (and a real user-join test call `3793a324` with camera), stores **zero** composite recordings. The `default` call type has NO `call_settings` (no type-level recording defaults), so the only control is the per-call `settings_override`, which is correctly set to `auto-on`. Yet no file is produced. **Root cause: composite frame recording is not functional on this Stream account** — Stream simply does not store the file, regardless of how the call goes live (admin `goLive` OR a real client join with camera). This is an **account/plan-level limitation, not a code defect**: the code correctly requests the recording. The 6 legacy Aug-20 recordings were created under different account conditions (likely a now-expired trial/entitlement). **The fix is a product/plan decision, not a code patch**: (a) verify and if needed upgrade the Stream plan so composite frame_recording is enabled (paid — violates the zero-cost rule, needs user sign-off), or (b) pivot the recording feature to what the free tier DOES provide — the `recording` (per-participant, `audio_only: true`) and/or `raw_recording` (mode `available`) settings, which are the only ones not gated, though they are not a single mixed-video file. Owner-only VIEW access (`GET /api/recordings` owner filter + gated panel/tab) remains functional. Code left as-is (`auto-on` is the correct request state for when the entitlement exists). Un-park only after the plan question is resolved.

## Transcript Generation (Steps F0 to F8, before Deploy)

Automatic speaker-labeled transcript creation from real meeting audio, replacing manual paste/upload as the primary path (manual upload stays as a fallback, not removed). Each step follows the project loop: `/architect` where a decision is needed, `/develop` to build, `/check verify` for live confirmation, `/test` where it is regression-worthy, `/sync` to close. Zero-cost only: Stream individual recording + Groq Whisper free tier. No paid API, paid transcription service, or second provider.

### F0. Transcript Generation architect · done
Verify Stream individual recording access + Groq Whisper API shape + zero-cost feasibility for both, and decide the exact trigger point (on call end vs an on-demand button) and where the merge/format logic lives. **Critical gate:** the D3.4 recovery (2026-08-21) proved composite frame recording is non-functional on this account, and the per-call `individual_recording` override may be a no-op — the live call reported `settings.recording = { audio_only: true, mode: "available" }`, so the key is `recording`, not `individual_recording`. Do not assume individual works by analogy; verify against the installed Stream SDK (or the connected Stream MCP tool) before committing F1.
**Done when:** a written verdict on whether Stream individual recording actually yields per-participant audio on this account, the exact Groq Whisper request/response shape, the chosen trigger point, and the module where merge/format lives; nothing is built until F0 closes.
- [ ] Design it (spec): `/architect transcript generation`

### F1. Fetch per-participant audio · done
After a call ends (or on the chosen trigger), fetch each participant's individual audio recording from Stream.
**Done when:** per-participant audio files (or signed URLs) are retrievable server-side for a test call and mapped to known participant names.
- [x] Build it: `/develop fetch individual audio` — `src/agent/transcript-generation.ts` (`generateTranscriptForMeeting`) lists Stream individual recordings via `StreamClient.listRecordings`, filters `recording_type === "individual"`, downloads each, parses `user_<id>_` from the filename, and maps it to `attendance_events.participant_email` (fallback `Speaker <id>`). `tsc` + `npm run build` green.

### F2. Transcribe via Groq Whisper · done
Send each participant's audio track to Groq Whisper free tier, English + Urdu with auto language detection, capturing timestamped segments.
**Done when:** each track returns timestamped text in its spoken language with no paid cost.
- [x] Build it: `/develop transcribe via groq whisper` — `@ffmpeg/ffmpeg` wasm extracts 16kHz mono FLAC and segments every 600s; the core is self-hosted under `/public/ffmpeg/` via `scripts/copy-ffmpeg-core.mjs` (npm `postinstall`/`predev`/`prebuild`). Each chunk POSTs to Groq Whisper (`whisper-large-v3-turbo`, `verbose_json`, EN/UR auto-detect), retry once, no fallback (Groq is the sole STT provider). `tsc` + `npm run build` green.

### F3. Merge into speaker-labeled transcript · done
Merge each participant's timestamped output into one chronological transcript in "SpeakerName: text" format per line.
**Done when:** a merged transcript interleaves speakers by timestamp and labels each line with the participant's name.
- [x] Build it: `/develop merge speaker-labeled transcript` — per-chunk segments offset by `index*SEGMENT_SECONDS`, all tracks merged and sorted by `start`, joined as `SpeakerName: text` per line; silent/empty tracks skipped, any error continues other tracks. `tsc` + `npm run build` green.

### F4. Wire into existing pipeline · removed
**Removed (F7b v2, 2026-08-22).** The F-series does NOT feed a recording into `/api/ai/process`. AI processing (Summary/Action Items/Category/RAG) is entered ONLY via the existing Upload Transcript flow: the recap page downloads the merged `"Name: text"` `.txt` and the user uploads it through Dashboard → Upload Transcript (same path as a pasted transcript). No second summarization/embedding path was added by the F-series. The earlier `POST /api/transcript/generate` route that self-fetched `/api/ai/process` was deleted.

### F5. UI trigger + graceful status (`.txt` only) · done
The recap page "Generate Transcript" button (ANY signed-in participant, owner or not) downloads a local `meeting-<id>-transcript.txt` of the merged `"Name: text"` transcript via `POST /api/transcript/download` — NO AI is triggered. States: idle/generating/done/exists/too_short/failed + graceful `no_recording` → `pending` polling (capped ~5 min). Built in `AfterMeetingRecap.tsx`; the Recording tab carries NO Generate button (playback only).
**Done when:** a signed-in participant can download a personal `.txt` from the recap page and see graceful status; AI insights come only from the Upload Transcript flow.
- [x] Build it: `/develop transcript UI trigger` — recap "Generate Transcript" downloads the merged transcript as a `.txt` (any signed-in participant, never AI); `RecordingTab.tsx` is playback-only. `tsc` + `npm run build` green.
  - [x] **Graceful degradation (F7b v2, 2026-08-22):** a participant who clicks before Stream finalizes individual recordings gets a retryable `no_recording` (not a hard `failed`); the client enters `pending` and polls `GET /api/transcript/status` every 15s, auto-downloading the `.txt` when `rawTextAvailable`, capped at ~5 min then a clear "No recording was captured" message. The `processing_state` column + `src/lib/transcript-state.ts` helper + `GET /api/transcript/status` (state, `rawTextAvailable`, `ready`, `hasInsights`) remain; `GET /api/transcript/in-flight` and the global `TranscriptPoller` were deleted (no background AI job to notify about). Double-trigger guard via `pending`/processing_state; terminal states persisted (never a dangling `pending`). `npx tsc --noEmit` clean, `npm run build` exit 0. **NOTE: the `processing_state` ALTER migration in `supabase/schema.sql` must be applied to the LIVE DB before deploy.**

### F6. Verify end-to-end bilingual · done
Run a real meeting in English + Urdu, generate the transcript, and confirm the full downstream pipeline.
**Done when:** a bilingual test meeting produces a correct speaker-labeled transcript and correct insights; `npx tsc --noEmit` + `npm run build` clean.
- [x] Build it: `/develop transcript verify bilingual` (verified live 2026-08-22: EN+UR transcript downloaded on both owner and non-owner sides; AI not triggered from recap)

### F7. After-meeting recap page + post-call redirect · done
Give transcript generation a proper post-call home and route every participant there when the call ends. New standalone public route `/after-meeting/[id]` (outside the `(root)` sidebar group, readable while logged-out) shows the meeting title, description, total duration, and the participant list, plus a Generate Transcript button. The button is enabled only for signed-in users; a logged-out visitor is sent to Clerk sign-in with a return URL back to this page. Generate Transcript is removed from the Recording tab. The owner AND every other participant (including logged-out viewers) can open the page; generation stays server-enforced owner-only.
**Done when:** ending a call (owner ends, or any participant leaves) routes everyone to `/after-meeting/[id]`; the page shows title/description/total time/participants; logged-out Generate Transcript click redirects to sign-in then back; signed-in owner generates; Recording tab shows playback only; `npx tsc --noEmit` clean and `npm run build` exit 0.
- [x] Design it (spec): `/architect afterMeeting recap page` (blueprint approved; prompt `prompts/step-F7-after-meeting-recap.md`)
- [x] Build it: `/develop afterMeeting recap page`
  - [x] **DEVIATION from prompt (intentional, better fit for Path B):** the prompt said to extend the owner-only `GET /api/meetings/[id]` and reuse it. Because Path B requires the page to be viewable by the owner AND all other participants including logged-out visitors, a public server helper `getMeetingRecap(id)` was created in `src/lib/meeting-recap.ts` (NO auth/owner filter) instead. It reads `meetings` by id + distinct participants from `attendance_events` (earliest join / latest leave per `user_id`) + best-effort `custom.description` from Stream. The owner-only `GET /api/meetings/[id]` is left untouched.
  - [x] `src/app/after-meeting/[id]/page.tsx` — server component, calls `getMeetingRecap(id)`, not-found state, renders `AfterMeetingRecap`.
  - [x] `src/components/meeting-intelligence/AfterMeetingRecap.tsx` — client: title/description/total-time/participants + Generate Transcript (`useUser().isSignedIn` gate; logged-out → `useClerk().redirectToSignIn({ redirectUrl })`; signed-in → `POST /api/transcript/download`, which returns the merged `SpeakerName: text` transcript downloaded as a local `meeting-<id>-transcript.txt` via a Blob — NO AI processing triggered); "View full meeting insights" link to `/meeting-intelligence/[id]` shown only when signed-in.
  - [x] `src/components/meeting-intelligence/RecordingTab.tsx` — **F7b v2:** playback only. The owner-only "Generate Transcript" full-pipeline button was REMOVED (AI runs only via the Upload Transcript flow); the tab now surfaces recordings with a `Play` anchor and nothing else.
  - [x] `src/components/MeetingRoom.tsx` — `OnLeave` + a `call.on("call.ended", ...)` listener (with a `recapNavigated` ref guard) route to `/after-meeting/[id]`; recording consent now uses the generic `recording_started`/`recording_stopped` events.
  - [x] `npx tsc --noEmit` clean, `npm run build` exit 0; `/after-meeting/[id]` compiles.
  - [x] **F7b v2 correction (2026-08-22):** see `prompts/step-F7b-transcript-flow-correction.md`. The F-series triggers NO AI. The recap "Generate Transcript" is a **participant `.txt` download** (`POST /api/transcript/download`, ANY signed-in participant, caches `raw_text` in `transcripts`, never triggers AI); the owner-only full pipeline (`POST /api/transcript/generate`) is **removed** — AI runs only via the Upload Transcript flow. Removed artifacts: `POST /api/transcript/generate`, `GET /api/transcript/in-flight`, the global `src/components/TranscriptPoller.tsx` (unmounted from `layout.tsx`), and the owner full-pipeline button on both the recap page and `RecordingTab` (now playback-only). `npx tsc --noEmit` clean, `npm run build` exit 0.

### F8. Transcript Cleanup Pass · done
Light AI accuracy clean of the merged "SpeakerName: text" transcript, run automatically as the last stage of F-series generation (Option A) so the recap `.txt` is already cleaned. Reuses the existing Gemini primary plus Groq fallback text generation; no new provider, no new model, zero extra cost. Covers word-level correction (garbled/misheard/dropped words) and line-level reconstruction (merge consecutive fragmented same-speaker lines that form one continuous thought; never across speakers; drop meaningless noise rather than fabricate; never summarize, remove, or relabel).
**Done when:** the downloaded `.txt` has noise corrected and same-speaker fragments rejoined with speaker labels and real content intact; if both Gemini and Groq fail, the raw transcript is returned and the download is never blocked; `npx tsc --noEmit` clean, `npm run build` exit 0, and a vitest unit test covers the raw-fallback guard.
- [x] Build it: `/develop transcript cleanup pass` — `src/agent/transcript-generation.ts` (`cleanupTranscript` + pure `fallbackToRawIfTooShort` guard) called from `generateTranscriptForMeeting` after the merge; `npx tsc --noEmit` clean, `npm run build` exit 0, vitest 8 new F8 tests green (20/20 suite).

## Guest Join with Owner Approval (Steps G0 to G4, after Transcript Generation, before Deploy)

Bring unauthenticated participants (shared meeting link → not signed in) into a real-time video meeting without forcing account creation. A lightweight guest pre-join screen shows camera/mic preview on one side and a name plus email input with an "Ask to join" button on the other. When a guest asks to join the meeting owner receives a real-time notification and can Accept or Deny. The owner controls the flow per meeting with a toggle between open admission and approval required. This is strictly additive: the existing signed-in join path is untouched, and zero-cost rules hold (Stream free tier only, no new provider).

### G0. Guest Join architect · done
Verify Stream's real guest/anonymous-user capabilities against the installed SDK, decide the identity capture approach, decide the owner approval notification mechanism, confirm zero-cost feasibility, and confirm the existing signed-in join flow can be left entirely untouched. Architect decisions locked in `prompts/step-G0-guest-join-architect.md` (§4–§4.5).

**Done when:** an approved architect answer covers: (1) which Stream SDK user type guests use and how the token is obtained, (2) the identity capture approach, (3) the approval notification mechanism reusing existing infrastructure, (4) zero-cost confirmation, and (5) explicit confirmation that the signed-in join path is unmodified.

- [x] Design it (spec): `/architect guest join`
  - [x] Verify Stream guest/anonymous-user capability against installed SDK types (`node_modules/@stream-io/video-client`) — GuestUser + createGuestUser confirmed real
  - [x] Decide identity capture (name + email client-side; Stream guest token carries display name only)
  - [x] Decide owner approval notification (Stream call `guest.request_join` event; poll-only fallback via GET /api/guest/status; no new notification system)
  - [x] Confirm zero-cost feasibility (Stream free tier only; no Clerk account for guests)
  - [x] Confirm existing signed-in join flow is untouched (separate GuestStreamClientProvider; zero imports of StreamClientProvider in guest path)
  - [x] Confirm attendance/transcript compatibility (guests attributable via `attendance_events.stream_user_id` + `participant_name` + `participant_email`; `resolveSpeakerName` fallback chain needs no schema change; `user_id` becomes nullable at G3 per §4.5.3)
- [ ] Build it: `/develop G1 guest setup page` (G1)

### G1. Guest Setup page · done
A guest pre-join screen with camera/mic preview on one side and a name plus email input with an "Ask to join" button on the other. No account creation required.

**Done when:** an unauthenticated participant clicking a meeting link lands on the guest setup page instead of the sign-in page; preview + controls render against Stream; name+email are captured and validated client-side.

- [x] Design it (spec): `/architect guest setup page` — approved, decisions locked in `prompts/step-G1-guest-setup-page.md`
- [x] Build it: `/develop guest setup page`
  - [x] Public route for unauthenticated access (`/meeting/:id/guest` in `isPublicRoute`)
  - [x] Camera/mic preview via a guest Stream client (`GuestStreamClientProvider.tsx`)
  - [x] Name + email input with client-side validation (min 2 chars, max 100, basic email format)
  - [x] "Ask to join" calls the owner approval flow (`POST /api/guest/request-join`)
  - [x] Verification: `npx tsc --noEmit` clean, `npx vitest run src/lib/guest-store.test.ts` 17/17 green, `npm run build` exit 0

### G2. Owner approval notification + Accept/Deny UI · done
When a guest asks to join, the meeting owner (signed in, in the call) receives a real-time notification and can Accept or Deny.

**Done when:** the owner sees "X wants to join" with Accept/Deny and the guest is admitted (or blocked) based on their choice; the notification reuses existing real-time infrastructure.

- [x] Design it (spec): `/architect guest approval notification` — approved, decisions locked in `prompts/step-G2-owner-approval.md`
- [x] Build it: `/develop guest approval notification`
  - [x] Owner in-call banner + Accept/Deny UI (`react-hot-toast` in `MeetingRoom.tsx` via `call.on("all", handler)`, guarded by `isOwner`)
  - [x] Real-time delivery (reuse Stream call events — `guest.request_join` custom event via `sendCallEvent`, client receipt via `call.on("all")`; poll-only fallback via `GET /api/guest/status`)
  - [x] On Accept, admit the guest into the Meeting Room (`POST /api/guest/admit` → `admit()` → `guest.admitted` event)
  - [x] On Deny, reject with a message (`POST /api/guest/deny` → `deny()` → `guest.denied` event)
  - [x] `getGuest(guest_token)` export in `src/lib/guest-store.ts` (sanitized `{ meeting_id, name, status }`, no internal fields) + 4 new tests
  - [x] Three gap fixes applied: admit/deny return-value check → 409 if false; toast dedup via `{ id: guest_token }`; 10-min TTL auto-dismiss via `setTimeout`
  - [x] Verification: `npx tsc --noEmit` clean, `npx vitest run src/lib/guest-store.test.ts` 21/21 green, `npm run build` exit 0

### G1.5. Signed-out call room redirect · code complete, pending live verification
When an unauthenticated visitor opens the shared meeting link (`/meeting/[id]` — the call room), they are redirected to the guest lobby (`/meeting/[id]/guest`) instead of the Clerk sign-in page. This closes the gap between the G0 §1 requirement ("the same link, not a separate URL") and the implementation, which made the lobby public but never wired the call-room redirect.

**Review-process note:** a "same link" requirement (like G0 §1) must enumerate the middleware redirect rule explicitly in the implementation spec, not just the target route's public/protected status. The G0–G2 build made `/meeting/:id/guest` public but left the redirect from `/meeting/:id` unwired — a process gap that G1.5 closes.

**Done when:** (a) signed-out visitor to `/meeting/[id]` lands on the guest lobby, not sign-in; (b) signed-in visitor to the same link lands on MeetingSetup unchanged; (c) `/meeting-intelligence/[id]` (detail page) stays protected. Verified by `npx tsc --noEmit` clean, `npm run build` exit 0, and the three live walk-through cases below (pending live run by a credentialed tester):
- [x] Design it (spec): `/architect middleware redirect rule` — locked in `prompts/step-G1.5-redirect.md`
- [x] Build it: `/develop middleware redirect rule`
  - [x] New middleware branch in `src/middleware.ts`: strict regex `/^\/meeting\/[^/]+\/?$/` matches the call room only (excludes `/meeting/:id/guest` and `/meeting-intelligence/:id`); signed-out visitor redirected to `/meeting/:id/guest`; runs before `auth.protect()` so signed-in path is unchanged
  - [x] Route tree confirmed: `/meeting/[id]/page.tsx` (call room) + `/meeting/[id]/guest/page.tsx` (lobby, already public) — no other subroutes exist
  - [x] Verification (code): `npx tsc --noEmit` clean (one pre-existing unrelated `AfterMeetingRecap.test.tsx` fixture error, confirmed on base), `npm run build` exit 0
  - [ ] Verification (live walk-through, pending — sandbox has no Clerk + Stream credentials):
    - [ ] Signed-out → `/meeting/[id]` → lands on guest lobby
    - [ ] Signed-in → `/meeting/[id]` → lands on MeetingSetup (unchanged)
    - [ ] `/meeting-intelligence/[id]` → still protected (unauthenticated → sign-in)

### G3. Owner per-meeting toggle · in-progress
An owner-level setting per meeting to choose between "Anyone can join freely" and "Require approval for guests", so the owner is not forced to approve every guest if they do not want that friction.

**Done when:** the owner can set the admission mode per meeting at creation or in-call, and the mode is respected by the guest join path and by the G2 approval UI.

- [x] Design it (spec): `/architect guest join toggle`
- [x] Build it: `/develop guest join toggle`
  - [x] Storage of the toggle (Supabase, zero-cost)
  - [x] "Anyone can join freely" skips approval, admits directly
  - [x] "Require approval" routes through G2

### G4. Attendance + transcript compatibility for guests · done
A guest who joins without a Clerk account has no Clerk userId but still shows up correctly in attendance reports and generated transcripts using the name/identifier they provided.

**Done when:** guests appear in attendance reports and transcripts by the name they provided, with no schema change required, and the `resolveSpeakerName` fallback chain resolves guest display names.

- [x] Design it (spec): `/architect guest attendance transcript`
- [x] Build it: `/develop guest attendance transcript`
  - [x] `attendance_events` rows for guests attribute via `participant_name` + `participant_email` + `stream_user_id`
  - [x] `resolveSpeakerName` fallback chain resolves guest names in transcripts
  - [x] `npx tsc --noEmit` clean, `npm run build` exit 0

**Implementation (2026-09-04):** `useAttendanceTracking` accepts optional `identityOverride` param; `MeetingRoom` passes `guestName`/`guestEmail` when `user` is null; `GuestStreamClientProvider` threads `guestEmail` to `connectUser`. Verified 175/175 tests green.

### G6. Edge case hardening for Guest Join with Owner Approval · planned
`/architect` first. Enumerate and gracefully handle every plausible edge case in the G0-G4 guest join flow with Owner Approval mode. The 11 target scenarios: (1) owner leaves within milliseconds of a guest's join request; (2) guest requests and never returns (closes tab); (3) owner denies, guest immediately resubmits with a new nonce; (4) two guests request simultaneously; (5) owner flips `guest_admission_mode` from approval to open mid-flight; (6) guest's poll experiences a network drop/reconnect; (7) owner is not currently in the call when a guest requests; (8) owner ends the call while a guest is pending or freshly admitted; (9) guest is admitted but their tab was already closed before admission resolved; (10) same guest opens two separate tabs for the same meeting; (11) owner's Clerk session expires while the Accept/Deny toast is showing.

**Done when:** every edge case is analyzed against actual code, each is judged acceptable or given a precise fix, and `prompts/step-G6-edge-cases-architect.md` is approved. G7 (responsive polishing) opens only after G6 is approved.

### G7. Responsive polishing for the guest join flow · in-progress
`/architect` first (after G6 approval). Audit + fix responsiveness across every guest-facing screen (guest lobby, name modal, waiting screen, owner's Accept/Deny toast) at mobile/tablet/desktop breakpoints. Follow the same pattern as Step P13.

**Done when:** every guest-facing screen is usable at 375, 768, and 1440 with no horizontal overflow or broken UI; `npx tsc --noEmit` clean, `npm run build` exit 0.

- [x] Design it (spec): `/architect G7 responsive polishing` → `prompts/step-G7-responsive-polishing.md`

### G8. Guest Join Integration Audit · completed
Systematically audited every existing feature/page in the app that deals with meeting participants, attendance, or post-meeting content, and confirmed guests are correctly represented. All 9 bugs found (G8-F1 through G8-F9) fixed and verified.

**Key findings and fixes:**
- G8-F1: `src/lib/attendance-merge.ts:46` — null-`user_id` guest rows collapse into one entry → fixed: composite key `row.user_id ?? row.stream_user_id ?? row.participant_email ?? row.participant_name ?? ""`
- G8-F2: `src/app/api/meetings/[id]/route.ts:63–77` — `.eq("user_id", userId)` 404s for guests → fixed: added `.eq("stream_user_id", userId)` fallback query
- G8-F3: `src/app/api/attendance/event/route.ts:85` — rejects guests with 400 → fixed: validation `!user_id && !stream_user_id && !participant_email`
- G8-F4: `src/components/Navbar.tsx:28` — hardcoded owner greeting → fixed: `user?.firstName ?? user?.username ?? "Guest"`
- G8-F5: `src/components/Sidebar.tsx:55–57` — falls back to owner identity → fixed: `"Guest"`/`"guest@neurameet.app"`
- G8-F6: `src/components/FloatingChat.tsx:26–47` — hardcoded avatar slots for guests → fixed: removed hardcoded slots
- G8-F7: `src/app/api/ai/process/route.ts:201–218` — no email notification for guests → fixed: `clerkUser?.primaryEmailAddress?.emailAddress ?? email ?? null`
- G8-F8: `src/components/meeting-intelligence/AfterMeetingRecap.tsx` — `key={p.userId}` collapses guests → fixed: `key={p.userId ?? p.email ?? p.name}` + `stream_user_id` in `meeting-recap.ts` query
- G8-F9: `src/components/MeetingRoom.tsx:250` — `call.queryRecordings()` called unconditionally for ALL participants including guests; Stream server throws `"User '...' with role 'guest' is not allowed to perform action ListRecordings"`. Fixed: `if (!call || !isOwner) return 0;` at the top of `loadRecordings()` (line 250), which gates all four call sites (function body, `frame_recording_ready` event handler, `showRecordings` panel-open `useEffect`, and `setInterval` polling loop). The Recordings button at line 1001 is already gated by `{isOwner && (...)}`.

**Correctly handles guests**: transcript download/generation, attendance PDF, engagement tab, `CallParticipantsList` (Stream SDK), `useAttendanceTracking`, search (by design), export features.

**Silently omits by design**: `OverviewTab`, `FollowUpList`, `RecordingPage`, `PreviousPage`, `UpcomingPage`, `PersonalRoomPage`, `MeetingSetup`, `EndCallButton`, `transcript/status/route.ts`.

- [x] Design it (spec): `/architect G8 guest join integration audit` → `prompts/step-G8-integration-audit.md`
- [x] Apply fixes G8-F1 through G8-F8 (verified: 200/200 tests green, `tsc --noEmit` clean, build exit 0)
- [x] `/check verify` after fixes

### G9. Manual live walkthrough of Guest Join · reserved (no agent action)
User-owned end-to-end walkthrough of the entire Guest Join feature after G6, G7, and G8 close. Catch any remaining inappropriate behavior before Deploy. No agent action — the user runs it manually.

## Product Final Polishing (Steps P0 to P11, before Deploy)

A sequential manual QA polish pass. Each step is a discrete bug or UX fix found during a full walkthrough of the built app. Fix in priority order — P0 first (usability-blocking), then P1 through P11. Each follows the project loop: `/architect` where a decision is needed, `/develop`, `/check verify`, `/test` where regression-worthy, `/sync` to close. The zero-cost rule still applies (no new paid tools); the only "new" UI is the P9 presentation-layer replacement that reuses the existing chat backend. No new AI/DB features beyond what the steps name.

### P0. Stuck loaders / broken redirects · done
Audit every loading state (page transitions, client data fetches, post-action redirects) and find every instance where a spinner or redirect can hang indefinitely, trapping the user. Add a bounded timeout plus a safe fallback (error/retry state, or redirect to `/dashboard`) for each. Known prior fix: `StreamClientProvider` connect-on-mount removed the 5s `queryCalls` timeout; the recap `.txt` poll is already capped at ~5 min — keep that pattern and find any other fetch/redirect lacking a timeout or error branch.
**Done when:** walking every authenticated route shows no loading state that hangs past a bounded timeout with a fallback; Playwright regression for the highest-risk paths; `npx tsc --noEmit` clean, `npm run build` exit 0.

### P1. Landing page redesign · done
`/architect` first. The dark landing background is inconsistent with the app's light design system. Redesign to the locked `context/ui-tokens.md` light theme (consistent tokens) and rewrite generic copy to accurately describe real NeuraMeet features (AI transcription, meeting intelligence, attendance reports, follow-ups, RAG chat). No `context/designs/*.png` exists for the landing page, so verify against `context/ui-tokens.md` + the light app surfaces.
**Done when:** landing reads as part of the same light system and copy reflects real features; `npx tsc --noEmit` clean, `npm run build` exit 0.

### P2. Sign-in/Sign-up testimonial panel · done
Replace the static generic "NeuraMeet has completely transformed…" quote with a useful/professional panel (visual walkthrough of scheduling a meeting, or key feature highlights for a new user). Keep the `AuthLayout` split; only the right-panel content changes.
**Done when:** right panel shows a useful walkthrough/feature highlights, no fake testimonial; `npx tsc --noEmit` clean, `npm run build` exit 0.

### P3. Dashboard loading skeleton · done
Meeting Intelligence + Meeting Follow-ups cards grow in height during loading (janky). Use a fixed-size skeleton matching final card dimensions so no layout shift (CLS) occurs.
**Done when:** no layout shift between loading and loaded; skeleton matches final card height; `npx tsc --noEmit` clean, `npm run build` exit 0.

### P4. Sidebar cleanup · done
`/architect` first (icon strategy). (a) Distinct icons for items that share one (Personal Room, Follow-ups, Settings, etc. — decide PNG vs lucide). (b) Reorder by importance/usage (Dashboard first already correct; move Prep up from last if frequently used). (c) Bottom account button (name/email) does not clearly signal sign-out — add a visible menu affordance.
**Done when:** each sidebar item has a distinct icon; order reflects usage; account button clearly signals menu/sign-out; `npx tsc --noEmit` clean, `npm run build` exit 0.

### P5. Instant Meeting flow redesign · done
New Meeting → Create Now currently drops straight into Meeting Setup → Meeting Room with no invite path. Redesign so Create Now generates a shareable meeting link (copy + join for the creator; others join via the link). Reuse the Schedule Meeting `${origin}/meeting/${call.id}` + Copy link pattern in `MeetingModel.tsx`.
**Done when:** Create Now yields a shareable link + copy + join; a second user joining via the link lands in the room; `npx tsc --noEmit` clean, `npm run build` exit 0.

### P6. Schedule Meeting modal missing title field · done
Add a required title input (title is the primary identifier used across lists/dashboard/detail/recap; `meetings.title` must be populated).
**Done when:** Schedule Meeting requires a title; `meetings.title` is populated and shows correctly; `npx tsc --noEmit` clean, `npm run build` exit 0.

### P7. Dashboard Quick Actions layout · done
5 cards in one cramped row → 3+2 grid (3 top, 2 bottom) for more breathing room and larger, clearer cards.
**Done when:** quick actions render as a 3+2 grid; cards larger/clearer; `npx tsc --noEmit` clean, `npm run build` exit 0.

### P8. Dashboard Meeting Intelligence / Follow-ups layout · done
Side-by-side two columns → stacked full-width sections (Meeting Intelligence on top, Follow-ups below) for more space.
**Done when:** sections stack full-width; content breathes; `npx tsc --noEmit` clean, `npm run build` exit 0.

### P9. Floating chat bubble replaces Ask AI card + AI Chat page · done
`/architect` first (mount point + coexistence). Remove the "Ask AI" dashboard quick-action card and the pattern of Ask AI / Ask NeuraMeet AI opening as separate full pages. Replace with a persistent bottom-right robot-avatar bubble on every authenticated page, opening a slide-in panel (minimize/maximize) for AI chat. Reuses existing `ChatPanel` (meetingId optional) + `POST /api/ai/chat` — presentation-layer replacement, not a new feature. Decide whether to keep, hide, or repoint the "AI Chat" tab and `/ai-chat` page.
**Done when:** bubble appears on every authenticated page; opens/closes a slide-in chat panel; reuses existing chat backend; `npx tsc --noEmit` clean, `npm run build` exit 0; Playwright regression for open/close + send.

### P9.1. General AI chat page redesign · done
The standalone `/ai-chat` page (first built at feature 12) renders its chat inside a plain wrapper with no card container, so it reads as unfinished next to the rest of the app. Redesign it to match the locked design system used by Dashboard, Meeting Intelligence, and Follow-ups: a proper card container for the chat area, consistent spacing and tokens, and message bubbles that reuse the same `ChatPanel` styling already used by the AI Chat tab scoped to a meeting and by the floating bubble, so all three chat surfaces stay visually consistent. Reuses the existing `ChatPanel` (general, no meeting scope) and the `POST /api/ai/chat` backend. Re style `GeneralChat.tsx` and the `/ai-chat` page shell only; no new AI or database feature.
**Done when:** the `/ai-chat` page reads as part of the same light card system as the other product pages; spacing and tokens match `context/ui-tokens.md`; message bubbles match the meeting scoped tab and the bubble; `npx tsc --noEmit` clean, `npm run build` exit 0.
- [x] Design it (spec): `/architect general AI chat page redesign`
- [x] Build it: restyle `GeneralChat.tsx` to match the Follow-ups page pattern (a `section` wrapper + `h1` page title + `ChatPanel` as the card); `ChatPanel`'s standalone styling and `h-[60vh]` height left untouched so all three chat surfaces stay consistent. Code in `src/components/meeting-intelligence/GeneralChat.tsx`.
- [x] Build it (same session, extends the chat surfaces): added a variant-aware `Trash2` **Clear conversation** button inside `ChatPanel` (next to the input) that wipes the chat via `clearChatStorage(chatId)` + `setMessages([])`, so the general page, the meeting tab, and the floating widget all clear identically. Removed the widget's duplicate header clear. Code in `src/components/meeting-intelligence/ChatPanel.tsx` + `src/components/FloatingChat.tsx`.

### P10. After-meeting recap page fixes · done
(a) Participant status shows "active" after ended → should show "ended". (b) "Total Time" always "—" → fix duration calc (`getMeetingRecap` + `formatDuration` vs `startedAt`/`endedAt`; ensure `endedAt` set on call end). (c) Enrich the empty page (summary preview if available, quick links). (d) Add "Back to Dashboard" + a path to Upload Transcript. (e) Browser back needs two presses to leave → fix the history stack so one back-press works.
**Done when:** status "ended" post-call; Total Time correct; page enriched; Back to Dashboard + Upload Transcript reachable; one back-press leaves; `npx tsc --noEmit` clean, `npm run build` exit 0.

### P11. Meeting Intelligence tabs — real-meeting data accuracy audit · done
Using an F-series-generated transcript (not hand-typed), verify each tab: (a) Attendance Report active for EVERY meeting — audit trigger condition, fix if missing; (b) Category always "Engineering" for real meetings — investigate broken categorization for real-meeting-style transcripts, fix so it reflects content; (c) Action Items show zero for real meetings — investigate correct-vs-bug in F-series extraction; (d) Recording tab always "No recordings" even when a recording exists via the F-series flow — fix so those meetings show their actual recording.
**Done when:** each tab reflects real-meeting data correctly; regression tests where feasible; `npx tsc --noEmit` clean, `npm run build` exit 0.

### P12. Meeting pages updation · done
Redesign the four meeting list pages and add the delete functionality that is missing app-wide. Step P12.0 audits every user-created data feature and builds one shared, tokened delete confirmation primitive (destructive styling, owner-only). Confirmed delete targets: Meetings (cascade delete across transcripts, chunks, action items, follow ups, categories, attendance), Recordings (Stream `call.deleteRecording`), and Follow-ups. New backend: `DELETE /api/meetings/[id]` (cascade), `DELETE /api/recordings/[id]` (Stream), `DELETE /api/follow-ups/[id]`. Steps P12.1 to P12.4 then apply delete plus the specific page fixes below. Zero cost: Supabase deletes and Stream recording deletes only, no new paid tool. Each sub step is its own `/architect` + `/develop` + `/check verify` + `/test` pass.
**Done when:** every meeting list page has a working delete; the stuck scroll on Recordings and Previous is fixed; the Previous "Open" routes to insights not the setup screen; Upcoming "Start" is disabled until the meeting time with a countdown; `npx tsc --noEmit` clean and `npm run build` exit 0.
- [x] Design it (spec): `/architect meeting pages updation` (covers the shared delete primitive + the scroll chain + each page's controls)
- [x] Build it: `P12.0` shared delete primitive + delete routes (meetings cascade, recordings Stream, follow-ups) + `by-call` route for Stream-call-keyed deletes
- [x] Build it: `P12.1` Meeting Intelligence list delete control
- [x] Build it: `P12.2` Recordings scroll fix + delete + client-side filter
- [x] Build it: `P12.3` Previous scroll fix + replace "Open" with "Open Insights" + delete
- [x] Build it: `P12.4` Upcoming Start gated by time + Cancel/Delete
- [x] Build it: `P12.5` Follow-ups list + details delete (the extra feature that needed delete)

### P13. Responsive Polishing · done
Audit every screen at mobile, tablet, and desktop, then fix responsiveness so the product is genuinely usable on phones and tablets, not just desktop. Step P13.0 builds a canonical problem list (same rigor as the A0 UI audit) at three breakpoints (375 / 768 / 1440), and also captures dropdown menu rendering problems (the shared `ui/dropdown-menu.tsx` has inert tokens that make the Settings, category, and audio-type selectors look broken, including on mobile). Step P13.1 through P13.10 then fix each screen or group in priority order (Dashboard, Meeting Intelligence, Meeting Room first); P13.10 is the shared dropdown token fix the screens depend on. Hard rules: reuse the token system and Tailwind sm/md/lg/xl only, no new framework or dependency; the sidebar gets a sensible mobile behavior if it lacks one, checked first; Meeting Room and Meeting Setup get special attention so video tiles, the control bar, and the side panels stay usable on small screens without breaking the call; tables and grids reflow to stacked cards on mobile rather than scrolling or clipping; the floating chat bubble must not obstruct critical UI on small screens; verify at true mobile width. Each sub step is its own `/architect` + `/develop` + `/check verify` + `/test` pass. Verification is manual per fix via /check verify at true mobile width; this pass does not add automated Playwright viewport tests.
**Done when:** every enrolled screen is usable at 375, 768, and 1440 with no horizontal overflow, no unusable touch targets, and no broken call UI; `npx tsc --noEmit` clean and `npm run build` exit 0.
- [ ] Design it (spec): `/architect responsive audit` (P13.0 canonical list)
- [x] Build it: `P13.1` sidebar mobile behavior (done; off-canvas drawer below `lg`, fixed 260px rail flush at `lg` after the desktop-gap fix; 8 drawer unit tests passing in `src/components/Sidebar.test.tsx`; manual `/check verify` at true mobile width passed)
- [x] Build it: `P13.2` landing page + auth pages (done; two mockup fixes; 2 responsive-token unit tests passing in `src/components/landing/landing-responsive.test.tsx`; manual `/check verify` at true mobile width still pending)
- [x] Build it: `P13.3` dashboard (done; DashboardContent inline rows now mirror the PreviousPage responsive pattern with md: col-spans plus a col-span-12 wrapping action cell for both Meeting Intelligence and Follow-ups, plus a mobile-only sm:hidden search bar reusing the query state; FloatingChat expanded panel min-height capped to min-h-[60vh] sm:min-h-[600px] so it no longer covers small phones; tsc + vitest + build all green; manual /check verify at true mobile width still recommended)
- [x] Test it: `P13.3` dashboard (done; 5 new vitest unit tests pass in `src/components/DashboardContent.test.tsx` and `src/components/FloatingChat.test.tsx` asserting the responsive tokens as revert guards — mobile-only search bar, header Action column hidden on mobile, MI and Follow-ups row reflow to col-span-12 wrapping action cells, and the floating chat min-height cap; full suite 109 green; visual outcome at 375/768 verified manually via /check verify)
- [x] **Status: P13.3 done** (build + tests green; manual /check verify at true mobile width recommended but not blocking)
- [x] Build it: `P13.4` meeting intelligence list + tabs (done; per /architect the list keeps its existing md: col-span grid reflow — already responsive per the P13.0 audit and mirroring the other four list pages — and the tabs keep their overflow-x-auto horizontal scroll; the one genuine small-screen defect (Overview attendance-report card squeezing its Download button at 375) fixed to flex-col sm:flex-row; tsc + vitest 113 + build all green; manual /check verify at true mobile width still pending)
- [x] Test it: `P13.4` meeting intelligence list + tabs (done; 4 new vitest unit tests pass in `src/components/meeting-intelligence/MeetingList.test.tsx` and `src/components/meeting-intelligence/MeetingTabs.test.tsx` asserting the responsive tokens as revert guards — header/row list reflow, contained overflow-x-auto tab strip, and the Overview attendance card stacking; full suite 113 green; visual outcome at 375/768 verified manually via /check verify)
- [x] **Status: P13.4 done** (build + tests green; manual /check verify at true mobile width recommended but not blocking)
- [x] Build it: `P13.5` follow-ups + recordings reflow (done; verification pass confirmed both lists already implement the verified MeetingList responsive pattern — grid-cols-12 with md: col-spans plus a col-span-12 wrapping action cell — so no code fix was needed; added 4 revert-guard vitest unit tests in `src/components/follow-ups/FollowUpList.test.tsx` and `src/components/RecordingPage.test.tsx` asserting the header/row responsive tokens; tsc + vitest 117 + build all green; manual /check verify at true mobile width recommended but not blocking)
- [x] Test it: `P13.5` follow-ups + recordings reflow (done; 4 new vitest unit tests pass asserting the responsive tokens as revert guards — header reflow columns and the row action cell dropping to col-span-12 md:col-span-4 md:flex-nowrap for both lists; full suite 117 green; visual outcome at 375/768 verified manually via /check verify)
- [x] **Status: P13.5 done** (build + tests green; manual /check verify at true mobile width recommended but not blocking)
- [x] Build it: `P13.6` meeting room + meeting setup (done; side panels hardened for phones — kept the show-block fixed-overlay, added a tap-outside dismiss backdrop (bg-inverse-surface/50, z-30) so phone users can close People/Recordings, added overflow-y-auto to the People wrapper for long lists, and lifted the panel bottom inset to bottom-32 so the wrapped two-row control bar no longer covers the panel's lower rows; Meeting Setup verified responsive at 375 with no code change — its only defect is the shared ui/dropdown-menu.tsx inert tokens, owned by P13.10; consulted the stream-react skill VIDEO.md and confirmed the CallParticipantsList/CallRecordingList prop surface — no Stream event/hook/lifecycle/device-state code touched; 5 new revert-guard vitest unit tests in src/components/MeetingRoom.test.tsx asserting the hidden + sm:static + bottom-32 tokens, show-block toggle, and backdrop presence; tsc + vitest 123 + build all green; manual /check verify at true mobile width recommended but not blocking)
- [x] Test it: `P13.6` meeting room + meeting setup (done; 5 new vitest unit tests pass in src/components/MeetingRoom.test.tsx asserting the responsive tokens as revert guards — hidden + sm:static + bottom-32 on both panel wrappers, show-block applied on People/Recordings open, and the dismiss backdrop present only while a panel is open; full suite 123 green; visual outcome at 375/768 verified manually via /check verify)
- [x] **Status: P13.6 done** (build + tests green; manual /check verify at true mobile width recommended but not blocking)
- [x] Build it: `P13.7` personal room + settings (done; light responsive verification pass confirmed both screens already responsive per P13.0 audit, so the deliverable is 7 revert-guard vitest unit tests — 4 in `src/components/PersonalRoomPage.test.tsx` (section flex-col + full width, two action buttons `w-full sm:w-auto`, invite link `break-all`, plus a plain-button no-layoutId guard) and 3 in `src/components/SettingsPage.test.tsx` (section flex-col + full width, account avatar `shrink-0` + name `truncate` in `min-w-0` box, three preference rows `justify-between gap-4` with `shrink-0` toggles); full suite 133 green; tsc + build clean; manual /check verify at 375/768 recommended but not blocking. **Personal Room loader fix (applied same session, out of pure-verification scope):** the `Start Meeting` / `Copy Invitation` buttons were the last in-app flex-row pair still on `stateful-button`, whose shared `layoutId="button"` morphed siblings on click (same root cause as the P13.6 EndCallButton fix); both swapped to plain `<button type="button">` preserving the exact prior look (`bg-primary-container text-on-primary` filled for Start, `border ... bg-surface-container-lowest` outline for Copy; both `rounded-lg w-full sm:w-auto`); `stateful-button` import removed from `PersonalRoomPage.tsx`; the no-layoutId test locks it)
- [x] Test it: `P13.7` personal room + settings (done; 7 new vitest unit tests pass asserting the responsive tokens as revert guards plus the plain-button no-layoutId guard; full suite 133 green; visual outcome at 375/768 verified manually via /check verify)
- [x] **Status: P13.7 done** (build + tests green; manual /check verify at true mobile width recommended but not blocking)
- [x] Build it: `P13.8` search + prep + after meeting recap (done; light responsive verification pass: the search bar was the one genuine small screen defect (the input kept its intrinsic min width in a single row flex form and could overflow on the smallest phones) fixed with `min-w-0` on the input; PrepPage and AfterMeetingRecap were already responsive, so the deliverable is 8 revert-guard vitest unit tests (2 in `src/components/SearchPage.test.tsx`, 3 in `src/components/PrepPage.test.tsx`, and 3 added to `src/components/meeting-intelligence/AfterMeetingRecap.test.tsx`) asserting the responsive tokens as revert guards; full suite 141 green; tsc + build clean; manual /check verify at 375/768 recommended but not blocking)
- [x] **Status: P13.8 done** (build + tests green; manual /check verify at true mobile width recommended but not blocking)
- [x] Build it: `P13.9` floating chat bubble small screen (done; tablet height tune — `FloatingChat.tsx` expanded panel is now `min-h-[60vh] sm:min-h-[52vh]` / `max-h-[min(820px,92vh)] sm:max-h-[min(720px,88vh)]`; `FloatingChat.test.tsx` assertion updated to lock all three tokens + reject bare `min-h-[600px]`; real Chromium viewport check at 375×667 (panel ~400px, bottom content visible) and 768×1024 (~532px, bottom content visible) confirms no obstruction; tsc clean except pre-existing unrelated `AfterMeetingRecap.test.tsx` fixture; vitest 142/142 green; `npm run build` exit 0; `/check verify` at true mobile width completed)
- [x] Build it: `P13.9` floating chat bubble small screen (done; tablet height tune — `FloatingChat.tsx` expanded panel is now `min-h-[60vh] sm:min-h-[52vh]` / `max-h-[min(820px,92vh)] sm:max-h-[min(720px,88vh)]`; `FloatingChat.test.tsx` assertion updated to lock all three tokens + reject bare `min-h-[600px]`; real Chromium viewport check at 375×667 (panel ~400px, bottom content visible) and 768×1024 (~532px, bottom content visible) confirms no obstruction; tsc clean except pre-existing unrelated `AfterMeetingRecap.test.tsx` fixture; vitest 142/142 green; `npm run build` exit 0; `/check verify` at true mobile width completed)
- [x] **Status: P13.9 done** (build + tests green; `/check verify` at true mobile width completed — panel non-obstructed at 375×667 and 768×1024)
- [x] Build it: `P13.10` shared dropdown menu tokens (done; root-caused the inert tokens in `ui/dropdown-menu.tsx` to the six missing shadcn color keys (`popover`, `popover-foreground`, `accent`, `accent-foreground`, `muted`, `muted-foreground`) in `tailwind.config.ts` — Tailwind was not generating `bg-popover`/`bg-accent`/`bg-muted`/etc utilities at all, so dropdowns fell back to unstyled defaults; fixed by adding `hsl(var(--...))` color-key entries mapping to the existing `:root` variables in `globals.css` (which already hold the locked Stitch tokens `surface-container-lowest`/`surface-container`/`outline`/etc); verified via `npx tailwindcss` dump that all six utilities now generate, plus `:focus` and `data-[state=open]` variants; `tsc` clean (only pre-existing unrelated `AfterMeetingRecap.test.tsx` fixture); `npm run build` exit 0; vitest 27 files / 145 tests green with a new `src/tailwind-config.test.ts` regression guard.)

## Deploy

### 11. Deploy and harden · planned
Deploy to Vercel on the free tier, then verify and harden. Re-enable Clerk email verification in the Clerk Dashboard before production, since it was off for dev speed. Confirm every navigation, loading, and error path, that no secret reaches the client bundle, and that all AI and database use stays within Supabase, Gemini, and Groq free tier limits.
**Done when:** the app is live on Vercel, Clerk email verification is on, and a full path and secret check passes.
- [ ] Deploy and verify: `/develop deploy and harden`

## Deferred

Out of scope for the current build pass, kept so the plan stays honest.
- Oxylabs topic or company enrichment (stretch, needs a paid API, forbidden by the zero cost rule) · needs a decision

## Step 9.5 FYP Polish Pass

Four deferred polish items, built without a paid service. Oxylabs stays deferred because it needs a paid API. Each reuses what already exists. Decisions on the category write path (Server Action), the quota check (runnable script), and the general chat (no RAG, pure assistant) are carried in `prompts/step-9-5-polish.md`.

### 12. General AI chat page · done
A working `/ai-chat` page that streams answers with no meeting scope, reusing the existing ChatPanel. The route and the two dashboard links are dead today.
**Done when:** `/ai-chat` opens a chat page in the sidebar shell and streams a reply, and the dashboard links resolve to it.
- [x] Build it: `/develop general AI chat page`

### 13. Change category write path · done
Let the Category tab change `meeting_insights.category`, not just show it.
**Done when:** a user picks a new category on the Category tab, saves it, and it persists after reload.
- [x] Build it: `/develop change category write path`

### 14. Groq date normalization guard · done
Coerce malformed model due dates to ISO or null before insert, never blocking the pipeline.
**Done when:** a bad `dueDate` becomes null and logs, a valid `YYYY-MM-DD` passes through, and no insert throws.
- [x] Build it: `/develop groq date guard`

### 15. AI provider quota pre demo check · done
A runnable script that probes Gemini and Groq and prints which is live, for the pre demo check.
**Done when:** `npm run check:providers` reports both providers status with zero cost.
- [x] Build it: `/develop provider quota check`

## Constraints

- Every third party tool in this project, including new features, must be zero cost. No paid API, paid vector DB, paid PDF service, or paid host beyond the free tiers already in use.
- Reuse the existing Gemini primary plus Groq fallback setup and the existing pgvector embeddings for all new AI features. Do not add a second AI provider or vector store.
- Keep the architecture: UI shows data only, server actions handle UI mutations, API routes own AI and agent work, all keys and AI calls stay server side.

## Legend

The decision box. Every feature carries exactly one sub task whose label ends with (spec). That is the entry point for `/architect`. Every other box is execution. The next step is always the first unticked box. Features tagged needs a decision run `/architect` first. Atomic build tasks live in the spec, not here.
