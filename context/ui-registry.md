# UI Registry — Updated for Step G3 (Guest Admission Toggle) + G1 display-name fix (2026-08-31)

Living record of every UI component and the pattern it establishes. Updated after every feature via `/imprint`. Read before building any new component to avoid duplicating an existing pattern.

---

## Existing Components (from current codebase — do not duplicate)

| Component | Path | Pattern it establishes |
| --- | --- | --- |
| `Sidebar` | `components/Sidebar.tsx` | Always-expanded 260px left nav (`bg-inverse-surface` #2D303D), brand + "AI Intelligence" subtitle, labeled nav with active route via `usePathname()` → `border-l-4 border-primary-container bg-on-secondary-fixed-variant text-on-primary` filled state; user profile + account menu at bottom. Nav items come from `constants/index.tsx` `sidebarLinks`, each a distinct `lucide-react` icon (PNG `/icons/sidebar/*` dropped): Dashboard (`/dashboard`, `LayoutDashboard`), Meeting Intelligence (`/meeting-intelligence`, `Brain`), AI Chat (`/ai-chat`, `MessageSquare`), Recordings (`/recording`, `PlayCircle`), Follow-ups (`/follow-ups`, `ListTodo`), Previous Meetings (`/previous`, `History`), Upcoming Meetings (`/upcoming`, `CalendarClock`), Personal Room (`/personal-room`, `Video`), Search (`/search`, `Search`), Prep (`/prep`, `ListChecks`), Settings (`/settings`, `Settings`, behind a `border-outline/30` divider). The bottom account control is a Radix `DropdownMenu` (reuses `ui/dropdown-menu.tsx`) triggered by the avatar/name/chevron button, opening upward (`side="top"`) with **Manage account** (`openUserProfile`) + **Sign out** (`signOut`) items — not a direct sign-out button. `Sidebar_Com` renders the fixed sidebar + `ml-0 flex min-h-full flex-col bg-surface lg:ml-[260px]` content area; **navbar clearance is owned solely by `HomeLayout`'s `<section className="...pt-16...">`** (set to the real ~60px navbar height so content starts flush below the navbar and the `flex-1` Join card centers in the true remaining space) — `Sidebar_Com` does NOT add its own top padding. `Sidebar_Com` is nested inside `HomeLayout`'s `flex-1` chain so `min-h-full` resolves to the real remaining height (no over-scroll). Home/Dashboard renders its own TopAppBar and no Navbar |
| `FloatingChat` | `components/FloatingChat.tsx` | Support chat widget (P9, **redesigned + rebuilt 2026-08-26**): `fixed bottom-6 right-6 z-50` trigger (collapsed FAB) that opens a panel `w-[380px] max-w-[calc(100vw-3rem)] rounded-2xl` dark theme with drop shadow. **Header:** brand logo/name left, row of overlapping `rounded-full` team-member avatars right, `X` close far right. **Greeting:** `Hi {userName} 👋` large bold heading + `How can we help?` subheading. **Body (Home tab)** — stacked cards w/ subtle dividers: (1) **Recent message** = icon/avatar left, title bold, 1-line truncated preview, right-aligned relative timestamp (`"6d"`); (2) **Ask a question** static CTA card, subtext `"AI Agent and team can help"`, small avatar cluster right; (3) text link row w/ `ExternalLink` icon, no avatar. **Footer:** 2-tab nav (Home, Messages), icon above label, active tab bold/highlighted. **Messages tab:** swaps body to a flat list of past conversations (icon, title, preview, timestamp), header/footer unchanged; a floating pill **"Ask a question"** appears bottom-right in this view. White text, sans-serif bold headings, icons from `lucide-react`. Mounted once in `Sidebar_Com` (every authenticated nav page, excludes live `/meeting/[id]` call), hides on `/ai-chat`; auto-scopes `meetingId` on meeting detail routes. `Escape` closes. Presentation-only — reuses `ChatPanel` + `POST /api/ai/chat`; no new AI/DB logic. Dark bg mapped to nearest design token (spec `#0e0e10` target) — **no hardcoded hex** per global rule. |
| `Navbar` | `components/Navbar.tsx` | `fixed top-0 z-50 left-0 w-full border-b border-outline-variant bg-surface px-6 py-3 lg:left-[260px] lg:w-[calc(100%-260px)] lg:px-10` top bar (~60px tall), greeting + `UserButton`; `top-0` keeps it flush at the viewport top (a fixed element without `top` inherits its static-flow position, which would be pushed down by `HomeLayout`'s top padding); rendered inside `Sidebar_Com` for non-dashboard pages |
| `DashboardContent` | `components/DashboardContent.tsx` | Dashboard page matched to `context/designs/dashboard.png`: `bg-surface` content area, sticky TopAppBar (dynamic greeting via Clerk `useUser()` first name + time-of-day, live "N meetings today / M follow-ups" counts, search input — **A6: controlled, live-filters BOTH panels by title/source meeting over the already-fetched data (no route/backend, zero cost); the 3-cap is dropped while a query is active, each panel shows "No results for '<query>'" on no match vs "No meetings/follow-ups yet." when empty, "View All" hides while searching, and an ✕ clear button resets** —, "Ask NeuraMeet AI", notifications bell), Quick Actions ×4 (New/Join/Upload/Schedule Meeting — the "Ask AI" card was removed in P9 and replaced by the global floating chat bubble) with `.card-shadow` cards. **Data is LIVE** — `useEffect` client fetch of `/api/meetings` + `/api/follow-ups` (user-scoped), shared `isLoading` + `<LoaderOne />` + empty states ("No meetings yet." + Upload CTA; "No follow-ups yet."). Both panels capped at latest **3** items; "View All" → `/meeting-intelligence` / `/follow-ups`. Meeting Intelligence rows: `FileText` icon chip + title + date (`startedAt ?? createdAt` → `toLocaleDateString()`, or "—") + "Open Insights" → `router.push("/meeting-intelligence/[id]")`. Meeting Follow-ups panel unified to the SAME 12-col row style (icon chip `ListChecks` + `actionTitle`/`meetingTitle` source + due-date meta + "Open" → `router.push("/follow-ups/[id]")`). All white cards (`bg-surface-container-lowest`) + `border-outline-variant`. **P8 (2026-08-26, done):** the two panels now STACK full-width at ALL breakpoints — the wrapper is `grid grid-cols-1 gap-8` (the `lg:grid-cols-12` split removed) and each panel is `flex flex-col gap-4` (the `lg:col-span-8`/`lg:col-span-4` spans removed), so Meeting Intelligence sits on top and Meeting Follow-ups below, each full-width; no other change to rows/behavior. |
| `HomeCard` | `components/HomeCard.tsx` | **DELETED** — orphaned quick-action card; removed in the A4/A5 dead-control cleanup (commit `1b4e867`, branch `fix/graceful-degradation-g1-g2`). Its only consumer `MeetingTypeLists` was also deleted; the Schedule Meeting entry now lives on the Dashboard quick actions (A3 review fix). Do not recreate without a new consumer. |
| `MeetingTypeLists` | `components/MeetingTypeLists.tsx` | **DELETED** — orphaned component that rendered four Quick Action `HomeCard`s; removed in the A4/A5 dead-control cleanup (commit `1b4e867`). It was never imported/rendered anywhere and imported a non-existent `../../constants` `meetingCardDetails`. The Schedule Meeting entry now lives on the Dashboard quick actions (A3 review fix). |
| `MeetingModel` | `components/MeetingModel.tsx` | Modal for New/Join/Schedule meeting flows — **light card** (`bg-surface-container-lowest`/`text-on-surface`/`border-outline-variant`); badge = `bg-primary-container text-on-primary`; inputs `bg-surface-container-lowest border-outline-variant text-on-surface`; Cancel `bg-surface-container-lowest text-on-surface hover:bg-surface-container-low`; primary `bg-primary-container text-on-primary hover:bg-primary`. **Composite recording (fix for `/review` Issue 1):** both `getOrCreate` call sites (`createMeeting` instant + `ScheduleMeeting`) pass `settings_override: { frame_recording: { mode: "auto-on", quality: "720p", capture_interval_in_seconds: 2 }, individual_recording: { mode: "auto-on" } }` in the `data` object — calls auto-start a composite recording at creation (the only mode that reliably stores a file on this Stream account; `available` stored zero files even on manual start, proven 2026-08-21). **Mode history (PROVEN 2026-08-21):** original Composite fix used `auto-on`; D3.4 switched to `available`. The `available` mode produced ZERO stored recordings on this Stream account (every `available` call since the switch stored 0, including a live joined test `e0b58307`). All 6 Aug 20 stored recordings were `auto-on` (verified via `listRecordings` on the live calls). On 2026-08-21 the user chose option (a) to revert all sites back to `auto-on` so recordings appear again. Calls are now auto-recorded; the D3.4 on-demand owner Record control design is abandoned. Owner-only VIEW access remains. `individual_recording: auto-on` enables per-participant audio capture for F1 speaker-attributed transcript generation. The `EndCallButton` stop + ~2.5s grace before `endCall()` is hygiene (the earlier stop-then-end race theory was disproven — the real boundary was the `auto-on` vs `available` mode, not the end path). `prepareCallDevices(call)` stays unchanged (device-disable runs before create; `settings_override` is independent). **P5 (2026-08-26, done):** the "Create Now" (instant) flow no longer drops straight into the room — `createMeeting` now sets `callDetails` and auto-copies the link with a toast (`Meeting ready. Link copied to clipboard`), leaving the creator on the link screen. `isCreated` (call created AND type is instant or schedule) drives the heading + success-view body + Join/Copy-link footer buttons; the success view reuses the Schedule Meeting markup (`bg-surface-container-lowest` bordered card, link input read-only + Copy pill). Post-creation primary button copies the link for BOTH instant and schedule (creator can re-copy; "Join" navigates into `/meeting/[id]`). Preview photos are gated to pre-creation (`type === "isInstantMeeting" && !callDetails`). Others join via the link (the `/meeting/[id]` route already allows link access). `copyMeetingLink(call, message?)` takes an optional toast message; `creating` guards the primary button (`disabled` + `aria-busy`). |
| `MeetingSetup` | `components/MeetingSetup.tsx` | Pre-call device/mic setup screen — dark in-call shell (`text-white`), audio-type trigger is a `bg-inverse-surface` pill (`hover:bg-inverse-on-surface/10`); "Join Meeting" uses locked `bg-primary-container` CTA |
| `MeetingRoom` | `components/MeetingRoom.tsx` | In-call layout, controls, participant list. **D2 redesign (done, `/check verify` live):** top bar = meeting title from `call.state.custom.description` + elapsed timer (started on JOINED) + participant count from `useParticipantCount()`, all `text-inverse-on-surface` (no `text-white`); bottom control bar is an icon+label **pill** (`bg-inverse-surface`/`text-inverse-on-surface`) keeping `CallControls` for real mute/camera/share/leave signaling plus `People`/`Layout` labels; `CallStatsButton` rendered **standalone** (never wrapped in a Radix `DropdownMenu` — nesting its popover broke the stats panel); participant panel tokened `surface-container-lowest` + `outline-variant`; `CallLayout` defined **outside the component** (camera-loop fix); stage given breathing room. **Auto Attendance (B2):** calls `useAttendanceTracking()` (background hook, no UI) before the JOINED early-return so hooks stay unconditional; `OnLeave` calls `reportLocalLeave()` (keepalive POST) before routing home. See `hooks/useAttendanceTracking.ts` + `POST /api/attendance/event`. **D3.1 Reactions (built, `/check verify` + `npm run build` green):** tokened "Reactions" control in the D2 control pill opens an emoji picker (Stream `defaultEmojiReactionMap`, `:code:` set) → `call.sendReaction({ type: "emoji", emoji_code })`; a per-participant `<Reaction>` layer in the stage shows floating, auto-hidden emojis. Free-tier (core SDK, no new dependency). **D3.2 in-call Search (done, no new code):** the participant panel's `CallParticipantsList` already ships search built in — `SearchInput` box + default normalized name filter over `useParticipants({ sortBy: name })` as `activeUsersSearchFn` + debounced `useSearch` + `EmptyParticipantSearchList` empty state. No custom search was added (that would duplicate SDK behavior, over-build). Free-tier, zero-cost. **D3.3 CallRecordings surfacing (built, `/check verify` + `npm run build` green):** a tokened "Recordings" control (icon `ListVideo` + label) in the D2 control pill toggles a right-side panel hosting Stream's free `CallRecordingList` (fed by `call.queryRecordings()`, loaded on open + `onRefresh`). Stream's light-themed default rows are replaced with custom **dark** tokened sub-components (`RecordingsPanelItem`/`RecordingsPanelHeader`/`RecordingsPanelEmpty`/`RecordingsPanelLoading`) that use the room's dark tokens (`bg-inverse-surface` panel, `text-inverse-on-surface` text, `border-outline-variant/20`), keeping the component's built-in refresh/empty/loading orchestration; each item links `recording.url` to a new tab. The People/Recordings toggles are mutually exclusive (single side-panel slot, same `show-block` pattern as the participants panel). The meeting-detail `RecordingTab.tsx` is unchanged (already surfaces recordings on-brand). Free-tier (core SDK, no new dependency). `RingingCall` (the original D3.3) was re-scoped out — it needs a ring-out-to-members flow NeuraMeet lacks. **Composite recording (fix for `/review` Issue 1):** newly created calls (via `MeetingModel`/`PersonalRoomPage` `getOrCreate` `settings_override`) are configured to support a mixed composite VIDEO (participants + screen), so recordings surfaced here and on `/recordings` are playable VIDEO, not audio-only. The `frame_recording.mode` is `auto-on`, so a composite recording auto-starts at call creation and reliably stores on this Stream account (see D3.4 correction below). **D3.4 — recording access control (Posture A, server-enforced):** `CallControls` was replaced with a **custom control bar** — tokened mic toggle (`call.microphone.toggle()` from `useMicrophoneState()`) + camera toggle (`call.camera.toggle()` from `useCameraState()`) + SDK `ScreenShareButton` + `CancelCallButton onLeave={OnLeave}` + the existing `People`/`Reactions`/`Layout`/`CallStats` controls. The **Record control is rendered only when `isOwner`** (`call.state.createdBy?.id === Clerk userId`) and calls `call.startFrameRecording({})` / `call.stopFrameRecording()`; a persistent **REC pill** (`bg-error text-on-error`, pulsing `Circle`) shows in the top bar while `isRecording`. Native Stream `call.frame_recording_started` / `call.frame_recording_stopped` events (broadcast to ALL participants) drive a `react-hot-toast` consent notice + set `isRecording` — no custom signaling. The in-room **Recordings panel button is gated by `isOwner`** (non-owners never see it). A `useEffect` calling `call.revokePermissions(userId, [OwnCapability.START_FRAME_RECORD_CALL])` for non-owners was added then **removed** (see /debug fix below): the SDK only allows revoking `send-audio`/`send-video`/`screenshare`, so it error-flooded and never enforced. Owner-only recording now rests on UI gating (owner-only Record control + gated Recordings panel) plus the call-type role grant for `start-frame-record-call` (server-enforced; the `default` call type's capability default still needs live verification — if a non-owner's `call.state.ownCapabilities` shows `start-frame-record-call`, a Stream call-type grant change restricting it to host/owner is still required). **Note:** with `frame_recording.mode` reverted to `auto-on` (see correction below), the on-demand owner Record control is now redundant — auto-on records the call regardless of whether the owner clicks it. The control bar and owner-only gating remain as built. **`EndCallButton` (owner "End call for everyone", self-guards to owner-only, `call.endCall()` + router push) is restored** in the control bar — the control pill is otherwise unchanged from the D2 redesign (mic/cam toggle + `ScreenShareButton` + `CancelCallButton onLeave` + `People`/`Reactions`/`Layout`/`CallStats`) so the Room UI/UX stays consistent. **`frame_recording.mode` is now `auto-on` (calls auto-start a composite recording at creation).** **Correction (2026-08-21, /develop Option A):** D3.4 had set it to `available` (on-demand owner Record control). On this Stream account `available`-mode calls stored ZERO recordings even when the owner manually called `startFrameRecording({})` (proven live via the Stream API: every Aug-21 `available` call, including the user's real joined test `e0b58307`, stored no file; the call-type grant for `start-frame-recording` was verified present for `user`/`call_member`, so permission was NOT the cause). Only `auto-on` reliably stores a composite on this account (every Aug-20 stored recording is `auto-on`, with real URLs). Option A reverted all four `getOrCreate`/`update` sites (`MeetingModel` x2, `PersonalRoomPage` x2) back to `auto-on`, abandoning the D3.4 on-demand owner Record design. The custom Record control in the control bar is now redundant (auto-on records regardless of it) but left in place. `EndCallButton` still awaits a stop + ~2.5s grace before `endCall()` as hygiene, NOT the root cause (auto-on calls stored fine on Aug 20 regardless of end path). **/recover (2026-08-29, UI-only):** EndCallButton was the only control-bar button routed through the `stateful-button` loader; its `motion.button` carries `layout` + a hard-coded `layoutId="button"` (shared across every `Button`), so on click the spinner/success animation morphed the EndCall button and shoved its neighbours ("abnormal UI after clicking"). Functionality was always correct. Reverted to a plain `<button>` (`rounded-xl py-2`, matching the other controls) — the click handler is byte-for-byte unchanged, only the wrapper animation is gone, so nothing moves on click. Three revert-guard tests in `EndCallButton.test.tsx`. tsc + 126 tests + `npm run build` green. (Heads-up: the shared `layoutId="button"` in `stateful-button.tsx` is still a latent bug for any other `Button` that shares the bar — out of scope here, flag if another button misbehaves.) **/debug (2026-08-20):** `handleRecordToggle`'s `catch` now surfaces the real `err.message` in the toast (`Recording failed: …`, truncated to 160 chars) instead of a silent generic `Failed to toggle recording.` + console-only error, so a `startFrameRecording`/`stopFrameRecording` failure is diagnosable rather than a mystery console error. **/debug recordings-list (2026-08-20, two passes):** the in-room `CallRecordingList` loaded `queryRecordings()` once on open; a composite recording is only queryable AFTER Stream finishes processing the file, signaled by the native `call.frame_recording_ready` event (separate from `started`/`stopped`) — and composite processing routinely takes minutes, longer than the first-pass ~2 min silent poll, so the panel read empty. Fixed: `loadRecordings` takes a `silent` flag and returns the count; the events `useEffect` now also listens for `call.frame_recording_ready` and reloads immediately when the file is ready; a `didRecordRef`-gated effect polls `queryRecordings` every 10s while recording AND after you stop, with a ~5 min ceiling (30 ticks) and early stop once a recording appears; `RecordingsPanelEmpty` says recordings show a minute or two after you stop. `useRef` re-added for `didRecordRef`. `tsc` + `npm run build` green. Verified the retrieval path is correct: `queryRecordings()` → `listRecordings` → `GET /api/v2/video/call/{type}/{id}/recordings` (identical and the server-side `/api/recordings`), so an empty list means not finalized yet, not a code defect. **D3 status (2026-08-21):** D3.1 (Reactions), D3.2 (in-call Search, no new code), and D3.3 (CallRecordingList surfacing) are built and verified; D3 is concluded here. D3+ (screen-share prominence + layout option + `Tooltip`/`StreamTheme` polish, and `RingingCall`) is deferred and not built in this pass. D3.4 (recording access control) remains parked as look-after. **P13.6 (responsive, 2026-08-29, `/check verify` manual at 375 recommended):** the People/Recordings side panels are kept as the show-block fixed-overlay; a tap-outside dismiss backdrop (`bg-inverse-surface/50`, `z-30`, below the `z-50` control bar and `z-40` panel) now closes either panel on a phone (People's Stream close button stays, Recordings only had a toggle); the People wrapper gained `overflow-y-auto` for long lists; both panels' bottom inset lifted to `bottom-32` so the wrapped two-row control bar no longer covers their lower rows. No Stream event/hook/lifecycle/device-state code touched (stream-react skill VIDEO.md consulted). Meeting Setup verified responsive at 375 with no change — its only defect is the shared `ui/dropdown-menu.tsx` inert tokens (P13.10). **P13.6 /debug (control-bar responsive, 2026-08-29):** the pill wrapped awkwardly on phones because Stream captions (`ScreenShareButton` "Share", `CancelCallButton` "Leave") render in `str-video__composite-button__caption` divs that ignore our `hidden sm:inline` pattern, and `EndCallButton` showed the long "End call for everyone" at every width with a fixed `min-w-[120px]`. Fix: globals.css `@media (max-width:640px)` now `display:none`s `.str-video__composite-button__caption` (Stream controls go icon-only on mobile, matching the custom buttons); `EndCallButton` now renders a `PhoneOff` icon + `hidden sm:inline` label and drops the fixed min-width on mobile (`min-w-[44px] sm:min-w-[120px]`). All controls are now uniform icon-only squares below `sm`, so flex-wrap packs evenly into two rows with no overlap/float. Two revert-guard tests in `EndCallButton.test.tsx`. tsc + 125 tests + `npm run build` green. **P13.6 /debug follow-up (2026-08-29):** the fixed 8px gaps + `justify-center` were correct, but the pill still showed large *side* gaps on phones. Root cause: `w-fit` (= fit-content) sized the pill to its single-row content (~484px) and **overflowed** the 375px screen instead of shrinking to wrap, so `justify-center` centered each wrapped line inside the oversized pill → empty side gutters ("big empty gaps / unfinished"). Fix: capped the pill with `max-w-[calc(100vw-1rem)]` (hugs content on desktop, caps to the screen on mobile so it wraps into tight, even rows) and tightened padding `px-3`→`px-2`. `gap-2` (8px fixed) and `justify-center` (NOT space-between) are kept. CSS/token-only, no Stream event/hook/lifecycle code (stream-react VIDEO.md consulted). tsc + 125 tests + `npm run build` green. |
| GuestAdmissionToast | `components/MeetingRoom.tsx` (`showGuestToast` / `ToastContent`) | **Owner guest-approval toast (G2, single-click fix 2026-08-31).** Durable `react-hot-toast` with inline Accept/Deny buttons — deduped by `id: guest_token`, `duration: Infinity` (auto-dismissed after 10 min via `setTimeout` matching the guest-store TTL, `useRef`-tracked for cleanup). `ToastContent` tracks a local `outcome: "idle" | "pending" | "success" | "error"` state: while `pending` the buttons show a spinner; on `success`/`error` an inline label renders on the SAME toast ("Alice admitted" / "Admit failed: …") instead of replacing the toast, and `finally` delays `toast.dismiss(guest_token)` by 1500ms so the owner sees the result before it auto-dismisses. A `admitCalled`/`denyCalled` `useRef` guards against duplicate API clicks. This pattern fixes the double-click-accept bug (root cause: synchronous `toast.dismiss` in `finally` deleted the interactive toast before the owner could see the outcome). Regression test in `MeetingRoom.test.tsx` asserts `toast.dismiss` is NOT called synchronously after the admit API resolves. |
| `EndCallButton` | `components/EndCallButton.tsx` | Owner "End call for everyone" — self-guards to owner-only (`call.state.createdBy?.id === currentUser.userId`); `bg-error text-on-primary hover:bg-error/90`. **/debug (2026-08-20):** the click handler is now async and, when `call.state.recording` is truthy (true while a composite frame recording runs — `call.recording || composite_recording?.status === 'running'`), awaits `call.stopFrameRecording()` (best-effort, wrapped in try/catch) **before** `call.endCall()` + `router.push("/")`. Reason: `endCall()` is just `POST /mark_ended` and does NOT stop a running recording, so ending a call while recording left the file un-finalized and it never surfaced in the recordings list — this was the real link to "recordings disappeared after the button was added." **/debug (2026-08-21):** a `setTimeout(2500)` grace now runs after `stopFrameRecording()` and before `endCall()`, so the asynchronous composite processing has time to commit the file (Aug 21 tests ended via this button and discarded the in-progress file; the grace mirrors the natural browser-close finalization that worked on Aug 20). **Root cause of "no recordings" (2026-08-21, live Stream introspection, PROVEN):** D3.4 switched `frame_recording.mode` from `auto-on` to `available`. On this Stream account ONLY `auto-on` reliably stores a composite file. Proof: all 6 Aug 20 stored recordings were `auto-on` calls (read directly via `listRecordings` on the live calls); every `available` call since — joined or not — stored 0, including the user's live joined test `e0b58307` (joined, cam+mic, manual `startFrameRecording`, ended) which still showed `recordings=0` 10+ min later. The call-type grant (`start-frame-recording` for `call_member`/`user`) is correctly applied and is NOT the cause; the EndCallButton stop/end grace is hygiene, not the cause. **Fix (option a, user decision 2026-08-21):** reverted all four `getOrCreate`/`update` sites in `MeetingModel.tsx` + `PersonalRoomPage.tsx` back to `frame_recording.mode: "auto-on"`. Recordings now auto-start at call creation and appear again (matching Aug 20). This ABANDONS the D3.4 on-demand owner Record control: calls are auto-recorded. Owner-only VIEW access (`GET /api/recordings` owner filter + gated Recordings panel) remains. **/recover (2026-08-29):** now a plain `<button>` (NOT the `stateful-button` loader) so the click animation can't morph it or its neighbours. Establishes the **control-bar button pattern** every in-call control should follow: `flex cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-2` (icon + `hidden sm:inline` label), `rounded-xl` + `py-2` (NOT the `stateful-button`'s `rounded-full`); mobile is icon-only with `min-w-[44px]`, label/width restored at `sm:` (`sm:min-w-[120px] sm:px-4`). The neutral variant is `bg-inverse-surface text-inverse-on-surface hover:bg-inverse-on-surface/10`; the danger variant (EndCall) is `bg-error text-on-primary hover:bg-error/90`. **No framer-motion `layout`/`layoutId` on any control-bar button** — use a plain `<button>` so clicks don't animate the row. Three revert-guard tests in `EndCallButton.test.tsx`; tsc + 126 tests + `npm run build` green. |
| `ControlBarButton` | `components/MeetingRoom.tsx` (control-bar pill) + `components/EndCallButton.tsx` | **Reusable in-call control button pattern** (extracted via /imprint 2026-08-29). Every button in the Meeting Room control-bar pill must match this so the row stays uniform and clicks don't animate neighbours. **Neutral (mic/cam/People/Recordings/Reactions/Layout):** `flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-inverse-surface px-3 py-2 text-inverse-on-surface hover:bg-inverse-on-surface/10 sm:px-4` with an icon + `<span className="hidden sm:inline">label</span>`. **Danger (EndCall only):** `flex min-w-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl bg-error px-3 py-2 text-on-primary hover:bg-error/90 sm:min-w-[120px] sm:px-4`. **Shared rules:** `rounded-xl` + `py-2` (never `rounded-full` from `stateful-button`); icon-only below `sm` (`min-w-[44px]`, label `hidden sm:inline`), full label + width at `sm+`; **plain `<button>`, never the `stateful-button` loader** (its `layout`/`layoutId="button"` morphed the button and shoved siblings on click — see EndCallButton /recover). Stream SDK buttons (`ScreenShareButton`, `CancelCallButton`) are used directly and go icon-only on mobile via the globals.css `@media (max-width:640px) .str-video__composite-button__caption { display:none }` rule. The pill that hosts them: `flex w-fit max-w-[calc(100vw-1rem)] flex-wrap items-center justify-center gap-2 rounded-2xl border border-outline-variant/20 bg-inverse-surface/95 px-2 py-2 backdrop-blur`. |
| `PreviousPage`, `UpcomingPage`, `RecordingPage` | `components/*.tsx` | Meeting-list pages (Stream-data / `/api/recordings`) — light list card per `meeting-intelligence-list.html`: section `flex w-full flex-col gap-6 px-6 py-8` (renders inside `Sidebar_Com`'s `bg-surface` shell — do NOT add own `bg-surface`/`min-h-screen`); heading `text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg` + `text-body-md text-on-surface-variant` count; card `overflow-hidden rounded-xl border border-surface-variant bg-surface-container-lowest shadow-[0_4px_20px_rgba(0,0,0,0.04)]`; header row `grid grid-cols-12 gap-4 border-b border-surface-variant bg-surface-container-low/50 px-6 py-4 text-label-caps uppercase tracking-wider text-on-surface-variant`; body `divide-y divide-surface-variant`; row `grid grid-cols-12 items-center gap-4 px-6 py-4 transition-colors hover:bg-surface-container-low`; title cell = lucide icon chip `flex h-8 w-8 items-center justify-center rounded-lg bg-surface-container text-primary` + `font-body-md font-medium text-on-surface`; date cell `text-body-md text-on-surface-variant`; primary action = `inline-flex items-center gap-2 rounded-lg bg-primary-container px-4 py-2 text-body-md font-body-md font-semibold text-on-primary transition-colors hover:bg-primary`; secondary action = `inline-flex items-center gap-2 rounded-lg border border-surface-variant px-4 py-2 text-body-md font-body-md font-medium text-primary transition-colors hover:border-primary hover:bg-primary/5`. Empty state: centered `rounded-xl border border-surface-variant bg-surface-container-lowest` + lucide icon + `text-body-lg text-on-surface-variant`. Loading → `LoaderOne`. **Action column (2026-08-29 correction):** the header + body Action cell must be `md:col-span-4` (Date `md:col-span-3`, title `md:col-span-5`, sum 12) with the body cell `md:flex-nowrap` and `whitespace-nowrap` on every button — NEVER `md:col-span-3`, which is too narrow for Play + Delete + View-insights and wraps the three buttons onto two lines. `md:flex-nowrap` + `whitespace-nowrap` keeps them on ONE right-aligned row. **List-row action-cell consistency (2026-08-29):** the primary action (Insights in `MeetingList`, Open in `FollowUpList`) sits BEFORE `ConfirmDelete`, on a single `md:flex-nowrap` row so it never wraps under the armed Delete/Cancel pair (the exact bug that surfaced on a Galaxy S20 Ultra). The label was deliberately shortened to "Insights" (from "Open Insights") to fit all three controls on one row — KEEP list-row primary-action labels short. **Responsive revert-guard test pattern:** jsdom has no layout engine, so responsive reflow is locked by unit tests that assert the responsive class tokens (`col-span-12 md:col-span-4 md:flex-nowrap`) and the child order (primary action precedes Delete) — NOT visual reflow; manual `/check verify` at 375/768 is the visual gate. Tests: `MeetingList.test.tsx`, `FollowUpList.test.tsx`, `RecordingPage.test.tsx`. **Page-wrapper scroll rule (2026-08-29):** the `recording`, `previous`, `upcoming`, and `personal-room` route files must render `<Sidebar_Com/>` DIRECTLY — never wrapped in a plain `<div>`, which breaks `HomeLayout`'s flex height chain (`h-screen` → `section flex-1` → `div flex-1`) so `Sidebar_Com`'s `flex-1 min-h-0 overflow-y-auto` content div never gets a bounded height and the list never scrolls. `meeting-intelligence` + `follow-ups` are correct (direct render). |
| `PersonalRoomPage` | `components/PersonalRoomPage.tsx` | Personal-room detail page (light): heading `text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg`; info `Table` cards `rounded-xl border border-surface-variant bg-surface-container-lowest p-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)]` (label `text-label-caps uppercase text-on-surface-variant`, value `text-body-lg text-on-surface break-all`); `Start Meeting` uses `Button` (default `bg-primary-container`/hover `bg-primary`), `Copy Invitation` overrides `Button` to outline `border border-surface-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-low` + `rounded-lg`. **Composite recording:** `createMeeting`'s `getOrCreate` passes the same `settings_override` (`frame_recording: { mode: "auto-on", quality: "720p", capture_interval_in_seconds: 2 }` + `individual_recording: { mode: "auto-on" }`) as `MeetingModel` — calls auto-start a composite recording at creation (the only mode that reliably stores on this Stream account; `available` stored zero files even on manual start). Mode history: D3.4 changed `auto-on` → `available`; a 2026-08-21 /debug briefly reverted to `auto-on` then back to `available` after /review mis-concluded auto-start stored no files for the Aug 21 tests — but that conclusion was WRONG (the Aug 21 `available` failures were a mode problem, not auto-on). /develop Option A (2026-08-21) reverted all sites back to `auto-on` permanently. camera/mic are disabled on `newCall` before create (device setup), independent of the recording override. **/debug (2026-08-20):** `createMeeting` no longer early-returns when the call already exists — it always `getOrCreate`s (reusing the existing `call` if present) and then best-effort `call.update({ settings_override: { frame_recording: { mode: "auto-on", quality: "720p", capture_interval_in_seconds: 2 }, individual_recording: { mode: "auto-on" } } })`. Reason: the personal room reuses a STABLE call id (`user.id`), and `getOrCreate` applies `settings_override` only at creation — so a call first created before the recording setting existed kept stale settings and `startFrameRecording` failed with a console error. The `update` re-applies the setting on every entry (idempotent, best-effort, wrapped so a failure never blocks entering the room). |
| `JoinMeetingPage` | `components/JoinMeetingPage.tsx` | Standalone Join Meeting page — centered light card per `join-meeting.png`: `rounded-xl border border-surface-variant bg-surface-container-lowest shadow-[0_4px_20px_rgba(0,0,0,0.04)]`, icon circle `bg-surface-container-low text-primary-container`, heading `text-display-lg-mobile md:text-display-lg font-display-lg`, input `bg-surface-container-lowest border border-surface-variant` + `focus:border-primary-container focus:ring-2 focus:ring-primary-container/20`, primary button `bg-primary-container text-on-primary hover:bg-primary`, divider `bg-surface-variant`, Personal Room dashed box `border-dashed border-surface-variant bg-surface-container-low` + `text-label-mono` link + `text-primary-container` copy. Reached via `Sidebar_Com type="joinMeeting"` and `/join-meeting` route. Reuses `getMeetingIdFromLink` for join; personal-room link = `${baseUrl}/meeting/${user.id}` (baseUrl = `NEXT_PUBLIC_BASE_URL` or `window.location.origin`, SSR-safe). Vertically centered via `flex flex-1 min-h-0 items-center justify-center` — fills the real remaining height from `Sidebar_Com`'s `min-h-full` (no hardcoded `calc(100dvh-*)`, so it tracks the single `HomeLayout` navbar clearance) |
| `Loader`, `ui/loader.tsx` (`LoaderOne`) | — | Loading states. Also used as the in-flight connect spinner in `GuestStreamClientProvider` (replaces the premature `LoadError` flash). |
| `GuestStreamClientProvider` | `components/GuestStreamClientProvider.tsx` | Two-step guest connection (`new StreamVideoClient({ apiKey })` then `connectUser(guestUser, accessToken)`). `StrictMode`-safe via `clientRef` guard. **Bug fix (2026-09-04):** guard refactored from `timedOut || !client || !connected` (flashed `LoadError` during the ~1s in-flight `connectUser` window) to separate `timedOut` (LoadError) / `!client || !connected` (`<LoaderOne />`) branches — the in-flight connect now shows a spinner instead of `LoadError`. `connectError` is cleared at the top of the effect on every new credential set so a fresh attempt starts clean. |
| `ConfirmDelete`, `ui/confirm-delete.tsx` | — | **Shared two-step destructive confirm control (Step P12.0).** `use client`. Props: `onConfirm: () => void \| Promise<void>`, `label?` (a11y + tooltip), `confirmLabel?` (default "Delete"), `cancelLabel?` (default "Cancel"), `disabled?`, `className?`, `size?: "sm" \| "md"`. Resting state = neutral ghost trash button (`border border-surface-variant text-on-surface-variant hover:border-error hover:text-error`); one click reveals an armed `bg-error text-on-primary` Confirm + neutral Cancel. `busy` disables both during the awaited `onConfirm`. NEVER wrap in an `<a>`/`<Link>` — pair it with a sibling link/button (used in `MeetingList`, `RecordingPage`, `PreviousPage`, `UpcomingPage`, `FollowUpList`, `FollowUpDetails`). Uses only `error` tokens when armed. |
| `ui/stateful-button.tsx` | — | Primary button with async pending state — locked `bg-primary-container`/`text-on-primary` + `hover:bg-primary` — reuse for all AI action buttons (replaced retired `bg-green-1`) |
| `ui/dropdown-menu.tsx`, `ui/popover.tsx` | Radix wrappers | Reuse for layout/audio-type/category dropdowns |
| `ui/animated-modal.tsx` | — | Modal shell (`ModalBody`/`ModalContent`/`ModalFooter`/`useModal`) — **light card**: `bg-surface-container-lowest border-outline-variant text-on-surface`, footer `bg-surface-container-low border-t border-outline-variant`, close icon `text-on-surface-variant`. Overlay scrim `bg-black bg-opacity-50` (dimming only). `ModalBody` takes optional `onClose` (fired on outside-click + `setOpen(false)`). `MeetingModel` + `UploadTranscriptModal` open via `setOpen(true)` on mount. Reuse for new modals |
| `ui/sidebar.tsx` | `components/ui/sidebar.tsx` | Aceternity sidebar primitives: `DesktopSidebar`, `MobileSidebar`, `SidebarLink` with active route detection |
| `ui/card-hover-effect.tsx` | `components/ui/card-hover-effect.tsx` | Card grid with hover animation, `bg-surface-container-lowest`, `border-outline-variant` |
| `ui/flip-words.tsx`, `ui/container-text-flip.tsx` | — | Decorative text animation, marketing/empty-state use only |
| `ui/3d-card.tsx`, `ui/wobble-card.tsx`, `ui/background-lines.tsx`, `ui/lamp.tsx` | — | Landing/decorative components, not for data-dense screens |
| `ui/placeholders-and-vanish-input.tsx` | — | Animated input, used for Join Meeting code field |
| `ui/sonner.tsx` | — | **Deprecated** — migrate toasts to `react-hot-toast`, remove usage as encountered |
| `LandingNav` | `components/landing/LandingNav.tsx` | Fixed light nav: `bg-surface`, three in-page links (`Features` `#features`, `How it works` `#how-it-works`, `Stack` `#stack`) in `text-on-surface-variant`, `bg-primary-container`/`text-on-primary` CTA, `IconWorld` logo |
| `LandingHero` | `components/landing/LandingHero.tsx` | Light hero: gradient text `from-primary-container to-primary`, light browser-chrome dashboard mockup with abstract content |
| `FeatureGrid` | `components/landing/FeatureGrid.tsx` | 3-column cards: `bg-surface-container-lowest border-outline-variant`, `bg-primary-container/10` icon circles |
| `SocialProof` | `components/landing/SocialProof.tsx` | "How it works" 3-step walkthrough (icon + numbered step + description), `bg-surface-container-lowest border-outline-variant` card pattern |
| `AiArchitecture` | `components/landing/AiArchitecture.tsx` | Split layout: check items left, stat card right with "Powered by" chips (Gemini/Groq/Supabase pgvector/Stream/Clerk) |
| `EnterpriseGrid` | `components/landing/EnterpriseGrid.tsx` | 3×2 grid, icon + title + description per item (`bg-surface-container-lowest border-outline-variant`) |
| `MeetingHistory` | `components/landing/MeetingHistory.tsx` | Split layout: feature bullets left, light-themed browser mockup right (uses `surface-container-lowest`) |
| `LandingCTA` | `components/landing/LandingCTA.tsx` | Light CTA: `bg-primary-container`/`text-on-primary` button, decorative glow (opacity only, NO blur) |
| `LandingFooter` | `components/landing/LandingFooter.tsx` | 5-col grid: logo+desc+social (col-span-2), 3 link columns, bottom copyright row. Links carry an `active` flag: `Features` (`#features`), `How it works` (`#how-it-works`), and `Stack` (`#stack`) are real in-page links; `Pricing` + all Resources/Company items + social icons + legal links render as muted, non-clickable "Coming soon" text (no `href="#"`, no new pages) |
| `AuthLayout` | `components/auth/AuthLayout.tsx` | Split-screen: form LEFT 40% (`bg-surface-container-lowest`) + 3-step walkthrough RIGHT 60% (`bg-inverse-surface`), decorative blurs, grid overlay |
| `SignInForm` | `components/auth/SignInForm.tsx` | Auth form: logo, heading, OAuth buttons, divider, email/password fields, submit, footer link. `useAuth()` redirect |
| `SignUpForm` | `components/auth/SignUpForm.tsx` | Auth form: logo, heading, OAuth buttons, divider, full-name/email/password/confirm/terms, submit. `useAuth()` redirect |
| `VerifyEmailForm` | `components/auth/VerifyEmailForm.tsx` | Auth form: logo, heading, code input (mono font, letter-spaced), verify button, resend link, back-to-sign-in link. Handles `attemptEmailAddressVerification` + `setActive` |

---

## Landing Page Patterns (shared across all landing components)

> **Redesigned 2026-08-25 (Step P1):** the whole landing moved from the old dark `inverse-surface` shell to the locked light theme (`context/ui-tokens.md`). Section backgrounds are `bg-surface`; cards/contrast blocks use `bg-surface-container-lowest` with `border-outline-variant`; text is `on-surface` (headings) / `on-surface-variant` (body); CTAs are `bg-primary-container text-on-primary`. The per-component tables below reflect the new light tokens.

| Pattern | Classes | Used by |
| --- | --- | --- |
| Light section background | `bg-surface` (main) / `bg-surface-container-lowest` (cards, contrast blocks) | All 9 components |
| Card (light) | `bg-surface-container-lowest border border-outline-variant rounded-xl` | FeatureGrid, SocialProof, AiArchitecture, EnterpriseGrid, MeetingHistory mockup |
| Icon circle (purple) | `bg-primary-container/10 border border-primary-container/20 rounded-lg` | FeatureGrid |
| Avatar circle (purple) | `bg-primary-container/20 rounded-full` | SocialProof |
| Section separator | `border-t border-outline-variant` | SocialProof, AiArchitecture, EnterpriseGrid, MeetingHistory, LandingCTA, LandingFooter |
| Decorative glow (NO blur) | `bg-primary-container/10 or /15 rounded-full` — opacity only | LandingHero, AiArchitecture, LandingCTA |
| CTA primary button | `bg-primary-container text-on-primary rounded-xl` hover:`bg-primary` | LandingNav, LandingHero, LandingCTA |
| Text — primary | `text-on-surface` | All headings |
| Text — secondary | `text-on-surface-variant` | All body/description text |
| Traffic light dots | `bg-error/80`, `bg-outline-variant`, `bg-secondary-container` | LandingHero, MeetingHistory |
| "Powered by" chip | `bg-surface-container-low border border-outline-variant text-on-surface-variant`, badge `bg-primary-container/15 text-primary-container` | AiArchitecture |
| Section spacing | `py-24` (standard), `py-32` (CTA) | All sections |

**Critical rule:** NO `blur-*`, `backdrop-blur-*`, or `backdrop-filter` on any background/parent element. Decorative glows use opacity only.

---

## Landing Component Details

### LandingNav

File: `components/landing/LandingNav.tsx`
Last updated: 2026-08-25

| Property | Class |
| --- | --- |
| Background | `bg-surface` (solid, no opacity/blur) |
| Border | `border-b border-outline-variant` |
| Border radius | none (fixed bar) |
| Text — logo | `text-on-surface font-bold text-lg tracking-tight` |
| Text — nav links | `text-on-surface-variant` hover:`text-on-surface` `text-sm font-medium` |
| Text — sign in | `text-on-surface-variant` hover:`text-on-surface` `text-sm font-medium` |
| CTA button | `bg-primary-container text-on-primary rounded-xl px-5 py-2.5 text-sm font-medium` hover:`bg-primary` |
| Spacing | `px-6 py-4` nav bar, `gap-8` between nav links, `gap-4` between sign-in + CTA |
| Mobile menu | `bg-surface border-t border-outline-variant`, `px-6 py-4 flex flex-col gap-4` |
| Shadow | none |

**Pattern notes:**
- Fixed position: `fixed top-0 left-0 right-0 z-50`
- NO `backdrop-blur` or opacity on the nav background — solid `bg-surface` only
- Logo uses `IconWorld` from Tabler with `text-primary-container`

---

### LandingHero

File: `components/landing/LandingHero.tsx`
Last updated: 2026-08-25

| Property | Class |
| --- | --- |
| Background | `bg-surface` |
| Border | none on section; `border border-outline-variant` on mockup |
| Border radius | `rounded-xl` on CTAs, `rounded-xl p-2` on mockup wrapper |
| Text — headline | `text-5xl md:text-6xl lg:text-7xl font-bold text-on-surface` |
| Text — gradient | `bg-gradient-to-r from-primary-container to-primary bg-clip-text text-transparent` |
| Text — subtitle | `text-on-surface-variant text-lg md:text-xl` |
| CTA primary | `bg-primary-container text-on-primary rounded-xl px-8 py-3.5 font-medium text-base` hover:`bg-primary` |
| CTA secondary | `border border-outline-variant text-on-surface rounded-xl px-8 py-3.5 font-medium text-base` hover:`bg-surface-container-low` |
| Decorative glow | `bg-primary-container/15 rounded-full` — opacity only, NO blur |
| Spacing | `pt-32 pb-24` section, `mb-6` headline, `mb-10` subtitle, `mt-20` mockup |
| Shadow | none |
| Accent usage | `from-primary-container to-primary` gradient on headline span |

**Pattern notes:**
- `overflow-hidden` on section clips the decorative glow
- Mockup uses `bg-surface-container-lowest` wrapper, `bg-surface-container` chrome, `bg-surface-container-lowest` content area
- Dashboard mockup is abstract divs, not a real screenshot
- NO `blur-*` or `backdrop-blur-*` anywhere in this component

---

### FeatureGrid

File: `components/landing/FeatureGrid.tsx`
Last updated: 2026-08-25

| Property | Class |
| --- | --- |
| Background (section) | `bg-surface` |
| Background (card) | `bg-surface-container-lowest` |
| Border (card) | `border border-outline-variant` |
| Border radius | `rounded-xl` card, `rounded-lg` icon container |
| Text — heading | `text-on-surface font-semibold text-lg` |
| Text — description | `text-on-surface-variant text-sm leading-relaxed` |
| Text — section title | `text-3xl md:text-4xl font-bold text-on-surface` |
| Text — section subtitle | `text-on-surface-variant text-base` |
| Icon circle | `w-12 h-12 rounded-lg bg-primary-container/10 flex items-center justify-center border border-primary-container/20` |
| Icon color | `text-primary-container` |
| Spacing | `py-24` section, `p-8` card, `mb-6` icon-to-heading, `mb-3` heading-to-desc, `gap-6` grid |
| Hover state | `hover:-translate-y-1 transition-transform duration-300` |
| Shadow | none |
| Accent usage | `bg-primary-container/10` icon circles, `border-primary-container/20` icon borders |

**Pattern notes:**
- 3-column grid: `grid grid-cols-1 md:grid-cols-3 gap-6`
- Card pattern: `bg-surface-container-lowest border border-outline-variant` — reuse for all landing light-theme cards
- `id="features"` on section for nav anchor link

---

### SocialProof

File: `components/landing/SocialProof.tsx`
Last updated: 2026-08-25

| Property | Class |
| --- | --- |
| Background (section) | `bg-surface` |
| Background (card) | `bg-surface-container-lowest` |
| Border (card) | `border border-outline-variant` |
| Border radius | `rounded-xl` card, `rounded-full` avatar |
| Text — quote | `text-on-surface-variant text-sm leading-relaxed` |
| Text — name | `text-on-surface text-sm font-semibold` |
| Text — role | `text-on-surface-variant text-xs` |
| Text — section title | `text-3xl md:text-4xl font-bold text-on-surface` |
| Avatar circle | `w-10 h-10 rounded-full bg-primary-container/20` |
| Spacing | `py-24` section, `p-6` card, `mb-6` quote-to-avatar, `gap-3` avatar-to-text, `gap-6` grid |
| Hover state | none |
| Shadow | none |

**Pattern notes:**
- 4-column grid: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6`
- Uses same light card pattern as FeatureGrid (`bg-surface-container-lowest border border-outline-variant`)
- Quote uses `&ldquo;` and `&rdquo;` HTML entities for curly quotes

---

### AiArchitecture

File: `components/landing/AiArchitecture.tsx`
Last updated: 2026-08-25

| Property | Class |
| --- | --- |
| Background (section) | `bg-surface` |
| Background (stat card) | `bg-surface-container-lowest` |
| Border (stat card) | `border border-outline-variant` |
| Border radius | `rounded-xl` stat card, `rounded-full` decorative glow, `rounded-full` progress bar |
| Text — heading | `text-3xl md:text-4xl font-bold text-on-surface` |
| Text — body | `text-on-surface-variant text-lg leading-relaxed` |
| Text — stat number | `text-6xl font-bold text-on-surface` |
| Text — stat label | `text-on-surface-variant text-sm` |
| Text — check items | `text-on-surface-variant text-sm` |
| Check icon | `IconCheck` size=20 `text-primary-container` |
| "Powered by" chip | `bg-surface-container-low border border-outline-variant text-on-surface-variant`, badge `bg-primary-container/15 text-primary-container` |
| Decorative glow | `bg-primary-container/15 rounded-full` — opacity only, NO blur |
| Progress bar track | `bg-surface-container-low rounded-full` |
| Progress bar fill | `bg-primary-container w-[75%] rounded-full` |
| Spacing | `py-24` section, `p-8` stat card, `gap-12` split layout, `space-y-4` check list |
| Shadow | none |

**Pattern notes:**
- Split layout: `flex flex-col lg:flex-row items-center gap-12`
- Stat card has `relative overflow-hidden` to clip decorative glow
- Decorative glow positioned `absolute top-0 right-0`
- "Powered by" chips list the real stack: Gemini, Groq, Supabase pgvector, Stream, Clerk
- NO blur on decorative elements

---

### EnterpriseGrid

File: `components/landing/EnterpriseGrid.tsx`
Last updated: 2026-08-25

| Property | Class |
| --- | --- |
| Background (section) | `bg-surface` |
| Background (item) | `bg-surface-container-lowest` |
| Border (item) | `border border-outline-variant` |
| Border radius | `rounded-xl` item card |
| Text — heading | `text-on-surface font-semibold text-base` |
| Text — description | `text-on-surface-variant text-sm` |
| Text — section title | `text-3xl md:text-4xl font-bold text-on-surface` |
| Text — section subtitle | `text-on-surface-variant text-base` |
| Icon | `text-primary-container` size=24 stroke=1.5 |
| Spacing | `py-24` section, `p-6` item, `mb-16` section heading, `gap-6` grid, `gap-4` icon-to-text |
| Hover state | none |
| Shadow | none |

**Pattern notes:**
- 3-column grid: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6`
- Uses same light card pattern as FeatureGrid/SocialProof
- Items are `flex items-start gap-4` (icon left, text right) — not centered

---

### MeetingHistory

File: `components/landing/MeetingHistory.tsx`
Last updated: 2026-08-10

| Property | Class |
| --- | --- |
| Background (section) | `bg-surface` |
| Background (browser wrapper) | `bg-surface-container-lowest` |
| Background (browser chrome) | `bg-surface-container` |
| Background (content area) | `bg-surface-container-lowest` (light theme) |
| Border (browser wrapper) | `border border-outline-variant` |
| Border (content area) | `border border-outline-variant` |
| Border radius | `rounded-xl` browser wrapper, `rounded-t-lg` chrome, `rounded-b-lg` content, `rounded-lg` rows |
| Text — heading | `text-on-surface font-bold text-3xl` (section), `text-xl font-bold text-on-surface` (mockup) |
| Text — body | `text-on-surface-variant text-lg` (section), `text-on-surface` (mockup rows) |
| Text — bullet title | `text-on-surface font-semibold` with `Icon` prefix |
| Text — bullet desc | `text-on-surface-variant text-sm` |
| Traffic light dots | `bg-error/80`, `bg-outline-variant`, `bg-secondary-container` |
| Category badge (mockup) | `bg-primary-container/20 text-primary-container`, `bg-secondary-container text-on-secondary-container`, `bg-primary-container/15 text-primary-container` |
| Spacing | `py-24` section, `p-6` mockup content, `gap-16` split layout, `space-y-6` bullet list, `space-y-4` rows |
| Hover state | `hover:bg-surface-container-low` on mockup rows |
| Shadow | `shadow-lg` on content area |
| Accent usage | `text-primary-container` for "Open Insights" action text |

**Pattern notes:**
- Split layout reversed on mobile: `flex flex-col-reverse lg:flex-row`
- Mockup uses light-theme tokens (`bg-surface-container-lowest`, `text-on-surface`, `border-outline-variant`) — consistent with the now-light landing page
- `IconSearch` used for both search bar and row icons (multipurpose)

---

### LandingCTA

File: `components/landing/LandingCTA.tsx`
Last updated: 2026-08-25

| Property | Class |
| --- | --- |
| Background (section) | `bg-surface` |
| Border | `border-t border-outline-variant` |
| Border radius | `rounded-xl` button |
| Text — heading | `text-4xl md:text-5xl font-bold text-on-surface` |
| Text — body | `text-on-surface-variant text-lg` |
| CTA button | `bg-primary-container text-on-primary rounded-xl px-10 py-4 font-bold text-lg` hover:`bg-primary` |
| Decorative glow | `bg-primary-container/10 rounded-full` — opacity only, NO blur |
| Spacing | `py-32` section, `mb-6` heading, `mb-10` body, `max-w-4xl mx-auto px-6` container |
| Shadow | none |

**Pattern notes:**
- `text-center` section alignment
- `overflow-hidden` clips decorative glow
- Decorative glow: `absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px]`
- NO blur on decorative elements

---

### LandingFooter

File: `components/landing/LandingFooter.tsx`
Last updated: 2026-08-16

| Property | Class |
| --- | --- |
| Background | `bg-surface` |
| Border | `border-t border-outline-variant` (section + bottom row) |
| Border radius | none |
| Text — logo | `text-on-surface font-bold text-lg tracking-tight` |
| Text — description | `text-on-surface-variant text-sm` |
| Text — column heading | `text-on-surface text-sm font-semibold` |
| Text — links (active) | `text-on-surface-variant` hover:`text-on-surface` `text-sm` |
| Text — links (inactive) | `text-on-surface-variant text-sm cursor-default` + `Soon` tag `text-[10px] uppercase tracking-wide text-on-surface-variant/60` (`aria-disabled`, `title="Coming soon"`) |
| Text — copyright | `text-on-surface-variant text-sm` |
| Social icons | inactive: `text-on-surface-variant cursor-default` size=18 (`aria-disabled`, `title="Coming soon"`, non-clickable) |
| Spacing | `pt-20 pb-10` section, `gap-8` grid, `mb-16` grid-to-bottom, `mb-6` logo-to-desc, `gap-4` social icons, `space-y-3` link list, `pt-8` bottom row |
| Shadow | none |

**Pattern notes:**
- 5-column grid: `grid grid-cols-2 md:grid-cols-5 gap-8`
- Logo+description spans 2 columns: `col-span-2`
- Bottom row: `flex flex-col md:flex-row justify-between items-center`
- Social icons use Tabler brand icons: `IconBrandTwitter`, `IconBrandLinkedin`, `IconBrandGithub`
- Links are data-driven (`footerColumns` / `legalLinks` carry an `active` flag + optional `href`); `active && href` renders a real `<a>`, otherwise a muted non-clickable `<span>` with a `Soon` tag. Active today: `Features` (`#features`), `How it works` (`#how-it-works`), and `Stack` (`#stack`) — all three point to live landing sections (the same anchors the top nav uses). `Pricing` and all Resources/Company items have no target section, so they stay inactive. No `href="#"` remains.

---

### AuthLayout

File: `components/auth/AuthLayout.tsx`
Last updated: 2026-08-10

| Property | Class |
| --- | --- |
| Background (form panel) | `bg-surface-container-lowest` |
| Background (testimonial panel) | `bg-inverse-surface` |
| Border | none on panels; `border-outline-variant/30` on avatar |
| Border radius | `rounded-full` avatar, `rounded-full` decorative blurs |
| Layout | `flex h-full w-full flex-col md:flex-row` — stacks mobile, side-by-side desktop |
| Panel widths | Form: `md:w-[40%]` (`flex-1 md:flex-none`), Testimonial: `md:w-[60%]` |
| Testimonial panel | `hidden md:flex` — hidden on mobile |
| Form panel content | `mx-auto w-full max-w-[400px]` |
| Quote text | `text-on-primary leading-tight font-semibold text-2xl md:text-3xl` |
| Quote icon | `h-12 w-12 text-on-primary opacity-40` |
| Attribution name | `text-on-primary font-semibold` |
| Attribution role | `text-secondary-fixed-dim text-sm` |
| Avatar | `h-12 w-12 rounded-full overflow-hidden border border-outline-variant/30 bg-surface-variant/10` |
| Decorative blurs | `bg-primary-container/20 rounded-full mix-blend-screen blur-[100px]` + `bg-secondary/20 rounded-full mix-blend-screen blur-[120px]` |
| Grid overlay | `radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)` at `24px 24px` |
| Panel shadow | `shadow-[4px_0_24px_rgba(0,0,0,0.02)]` on form panel |
| Spacing | `px-6 py-8 sm:px-10 md:px-10 md:py-8` form panel, `p-8 lg:p-10` testimonial |

**Pattern notes:**
- Requires `h-screen` on parent wrapper (`#root` in layout.tsx) — `h-full` on flex container resolves to parent height
- Mobile: form panel only (testimonial hidden). Desktop: side-by-side
- Decorative blurs on testimonial panel use `mix-blend-screen` + opacity, NOT `backdrop-blur`
- Content max-width `400px` centers form within the 40% panel

---

### SignInForm

File: `components/auth/SignInForm.tsx`
Last updated: 2026-08-10

| Property | Class |
| --- | --- |
| Logo | `text-xl font-black text-primary-container tracking-tight` |
| Heading | `text-3xl font-bold text-on-surface mb-2` |
| Subtitle | `text-on-surface-variant text-base` |
| OAuth button | `w-full flex items-center justify-center gap-3 bg-surface-container-lowest border border-surface-variant rounded-lg py-2.5 px-4` hover:`bg-surface-container-low` `transition-colors group disabled:opacity-50` |
| OAuth text | `text-sm font-semibold text-on-surface group-hover:text-primary transition-colors` |
| OAuth icon | `h-5 w-5` (Google SVG), `h-5 w-5 fill-on-surface` (GitHub SVG) |
| Divider | `border-t border-surface-variant`, label: `bg-surface-container-lowest px-2 text-xs text-outline uppercase tracking-wider` |
| Form label | `block text-xs text-on-surface mb-1.5 uppercase tracking-wider` |
| Input | `w-full bg-surface-container-lowest border border-surface-variant rounded-lg px-4 py-2.5 text-on-surface placeholder:text-outline-variant focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-container text-sm transition-shadow` |
| Password lock icon | `IconLock size={18} absolute left-3 top-1/2 -translate-y-1/2 text-outline` |
| Password toggle | `text-outline hover:text-primary transition-colors focus:outline-none` |
| Submit button | `flex w-full justify-center rounded-lg bg-primary-container px-3 py-2.5 text-sm font-semibold text-on-primary shadow-sm hover:bg-primary transition-colors disabled:opacity-50` |
| Footer link | `text-primary-container hover:text-primary transition-colors` |
| Forgot password link | `text-xs text-primary-container hover:text-primary transition-colors` |
| Spacing | `mb-8` logo, `mb-6` header, `space-y-3 mb-6` OAuth, `mb-6` divider, `space-y-4` form, `pt-1` submit, `mt-6` footer |

**Pattern notes:**
- Auth redirect: `useAuth()` + `useEffect` pushes to `/dashboard` if `isSignedIn`
- Form spacing: `space-y-4` between fields
- Loading state: `disabled:opacity-50` on buttons, text changes to "Please wait..."
- Toast: `react-hot-toast` only, positioned bottom-right

---

### SignUpForm

File: `components/auth/SignUpForm.tsx`
Last updated: 2026-08-10

| Property | Class |
| --- | --- |
| Logo | `text-xl font-black text-primary-container tracking-tight` |
| Heading | `text-3xl font-bold text-on-surface mb-2` |
| Subtitle | `text-on-surface-variant text-base` |
| OAuth button | `w-full flex items-center justify-center gap-3 bg-surface-container-lowest border border-surface-variant rounded-lg py-2.5 px-4` hover:`bg-surface-container-low` `transition-colors group disabled:opacity-50` |
| OAuth text | `text-sm font-semibold text-on-surface group-hover:text-primary transition-colors` |
| Divider | `border-t border-surface-variant`, label: `bg-surface-container-lowest px-2 text-xs text-outline uppercase tracking-wider` |
| Form label | `block text-xs text-on-surface mb-1.5 uppercase tracking-wider` |
| Input | `w-full bg-surface-container-lowest border border-surface-variant rounded-lg px-4 py-2.5 text-on-surface placeholder:text-outline-variant focus:outline-none focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 text-sm transition-all duration-200` |
| Password toggle | `text-outline hover:text-primary transition-colors` |
| Checkbox | `mt-1 h-4 w-4 rounded border-surface-variant text-primary-container focus:ring-primary-container` |
| Terms links | `text-primary-container hover:underline cursor-pointer` |
| Submit button | `w-full bg-primary-container text-on-primary rounded-lg py-2.5 text-base font-semibold mt-2 flex justify-center items-center gap-2 hover:bg-primary hover:shadow-[0_4px_14px_rgba(131,14,249,0.25)] transition-all duration-200 transform hover:scale-[1.01] active:scale-95 disabled:opacity-50` |
| Submit arrow icon | `h-5 w-5` SVG arrow-right |
| Footer link | `text-primary-container hover:underline underline-offset-4 transition-all` |
| Spacing | `mb-8` logo, `mb-6` header, `space-y-3 mb-6` OAuth, `mb-6` divider, `space-y-4` form, `pt-1` submit, `mt-6` footer |

**Pattern notes:**
- Same OAuth pattern as SignInForm — identical button classes
- Same divider pattern as SignInForm
- Same form label pattern as SignInForm
- Input focus differs slightly from SignIn: `focus:border-primary-container focus:ring-primary-container/20` vs SignIn's `focus:ring-inset focus:ring-primary-container` — prefer SignUp's pattern for new inputs (more visible focus state)
- Submit button has subtle micro-interactions: `hover:scale-[1.01] active:scale-95` + shadow on hover
- Auth redirect: same `useAuth()` pattern as SignInForm
- Form fields: Full Name, Email, Password, Confirm Password, Terms checkbox

---

### Auth Patterns (shared across SignIn/SignUp)

| Pattern | Classes | Used by |
| --- | --- | --- |
| Logo | `text-xl font-black text-primary-container tracking-tight` | SignIn, SignUp |
| Heading | `text-3xl font-bold text-on-surface mb-2` | SignIn, SignUp |
| Subtitle | `text-on-surface-variant text-base` | SignIn, SignUp |
| OAuth button | `bg-surface-container-lowest border border-surface-variant rounded-lg py-2.5 px-4 hover:bg-surface-container-low transition-colors` | SignIn, SignUp |
| OAuth text | `text-sm font-semibold text-on-surface group-hover:text-primary transition-colors` | SignIn, SignUp |
| Divider line | `border-t border-surface-variant` | SignIn, SignUp |
| Divider label | `bg-surface-container-lowest px-2 text-xs text-outline uppercase tracking-wider` | SignIn, SignUp |
| Form label | `block text-xs text-on-surface mb-1.5 uppercase tracking-wider` | SignIn, SignUp |
| Input (recommended) | `bg-surface-container-lowest border border-surface-variant rounded-lg px-4 py-2.5 text-on-surface placeholder:text-outline-variant focus:outline-none focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 text-sm transition-all duration-200` | SignUp (use this for new inputs) |
| Password toggle | `text-outline hover:text-primary transition-colors` | SignIn, SignUp |
| Primary CTA | `bg-primary-container text-on-primary rounded-lg py-2.5` | SignIn, SignUp |
| Footer link | `text-primary-container` | SignIn, SignUp |
| Auth redirect | `useAuth()` + `useEffect(() => { if (isSignedIn) router.push("/dashboard") }, [isSignedIn, router])` | SignIn, SignUp |
| Form spacing | `space-y-4` | SignIn, SignUp |
| Section spacing | `mb-6` between sections, `mb-8` after logo, `mt-6` for footer | SignIn, SignUp |

**Critical rule:** All auth forms must include the `useAuth()` redirect check. Authenticated users must never see sign-in or sign-up forms.

---

## Token System (Step 3.5 — locked)

Tailwind tokens in `tailwind.config.ts` under `theme.extend.colors`:
- **Primary**: `primary` (#6500C4), `primary-container` (#830EF9), `on-primary` (#FFFFFF), `on-primary-container` (#E9D5FF)
- **Secondary**: `secondary` (#525B8E), `secondary-container` (#BBC3FD), `on-secondary-container` (#464F81)
- **Surface**: `surface` (#FAF8FF), `surface-container-lowest` (#FFFFFF), `surface-container-low` (#F3F2FF), etc.
- **Text**: `on-surface` (#181B27), `on-surface-variant` (#4C4356)
- **Inverse (dark shell)**: `inverse-surface` (#2D303D), `inverse-on-surface` (#EFF0FF), `inverse-primary` (#D7BAFF)
- **Outline**: `outline` (#7D7388), `outline-variant` (#CEC2D9)
- **Error**: `error` (#BA1A1A), `error-container` (#FFDAD6)
- **Kept**: `green-1` (#00C48C) for small visual indicators only

Fonts: **Hanken Grotesk** (UI, `--font-hanken-grotesk`) + **JetBrains Mono** (mono labels, `--font-jetbrains-mono`) via `next/font/google`

---

## New Components — Meeting Intelligence (built through Step 6)

| Component | Path | Pattern |
| --- | --- | --- |
| `MeetingList` | `components/meeting-intelligence/MeetingList.tsx` | Client component fetching `GET /api/meetings`. Reuses the `RecordingPage` list-card treatment exactly: `section flex w-full flex-col gap-6 px-6 py-8` (renders inside `Sidebar_Com`'s `bg-surface` shell — no own bg), heading `text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg` + count, `overflow-hidden rounded-xl border border-surface-variant bg-surface-container-lowest shadow-[0_4px_20px_rgba(0,0,0,0.04)]`, 12-col header (`text-label-caps uppercase tracking-wider text-on-surface-variant`) + `divide-y divide-surface-variant` rows; title cell = `FileText` icon chip `bg-surface-container text-primary` + `font-body-md font-medium text-on-surface`; category chip `bg-primary-container/15 text-primary-container` or "Processing…" when `!hasInsights`; Category column cell is `hidden md:flex md:items-center md:col-span-2` on desktop — NEVER `hidden md:col-span-2` alone, because a `display:none` Category drops its 12-col grid track and shifts the Action column left of the card edge; the `md:flex` is required so it renders and holds the track. "Insights" action (label shortened 2026-08-29 from "Open Insights" to fit all three controls on one row; sits BEFORE `ConfirmDelete` to match the Follow-ups row, see the "List-row action-cell consistency" note above) `bg-primary-container text-on-primary hover:bg-primary` → `router.push('/meeting-intelligence/'+id)`. Empty state = centered `rounded-xl border border-surface-variant bg-surface-container-lowest` + `FileText` + "No meetings yet." + Upload Transcript button → `/dashboard`. Loading → `LoaderOne`. |
| `MeetingTabs` | `components/meeting-intelligence/MeetingTabs.tsx` | Tab bar from a `TABS` const array `["Overview","Summary","Action Items","Recording","Category","AI Chat","Engagement"]`. Bar: `flex gap-1 overflow-x-auto border-b border-surface-variant`; active tab `border-b-2 border-primary-container text-primary`, inactive `border-transparent text-on-surface-variant hover:text-on-surface`. Local `useState` for active tab; renders the matching tab component, passing `meeting`/`insights`/`actionItems`/`meetingId` down. `Engagement` renders `EngagementTab`. **D3.4:** accepts an `isOwner: boolean` prop; `VISIBLE_TABS(isOwner)` filters the `Recording` tab out for non-owners (rendered via `visibleTabs.map`), and the `RecordingTab` content is additionally guarded by `isOwner &&` (defense-in-depth). `isOwner` is threaded `MeetingDetail → MeetingTabs`. |
| `OverviewTab` | `components/meeting-intelligence/OverviewTab.tsx` | Synthesized landing view (not a DB table): top **Attendance Report card** (`bg-surface-container-lowest border border-surface-variant rounded-xl p-4 shadow-[…]`, `flex items-center justify-between`) — label `text-body-md font-medium text-on-surface` + helper `text-body-md text-on-surface-variant`; enabled state renders an `<a href="/api/attendance/report?meetingId={id}" download>` styled `bg-primary-container text-on-primary hover:bg-primary` (`Download` lucide icon), disabled state renders a `disabled` `bg-surface-container opacity-60 cursor-not-allowed` button (greyed, `aria-disabled`); enabled iff `attendanceCount > 0` (passed from the detail API). Below it: 4 `StatCard`s (`…`) for Category / Action Items / Date / Status, + a summary-preview card (`whitespace-pre-line text-body-md leading-relaxed text-on-surface-variant`, trimmed to 320 chars + "…"). **G3:** owner-only **Guest Admission toggle card** (`flex flex-col gap-3 rounded-xl border border-surface-variant bg-surface-container-lowest p-4 shadow-[…]`) with two `rounded-lg px-4 py-2` buttons — "Anyone can join" (`open`) and "Approval required" (`approval`) — styled `bg-primary-container text-on-primary` when active, `bg-surface-container text-on-surface-variant hover:bg-surface-container-high` when inactive, `disabled:opacity-60`; helper text shows current mode description; calls the `updateMeetingGuestAdmissionMode` Server Action with optimistic UI update + success/error `react-hot-toast`; gated by `isOwner` prop threaded from `MeetingDetail → MeetingTabs → OverviewTab`. |
| `SummaryTab` | `components/meeting-intelligence/SummaryTab.tsx` | `insights.summary` prose block + `keyPoints` list + `decisions` list, each in a `bg-surface-container-lowest` card; bullets `flex gap-2 text-body-md text-on-surface-variant` with `text-primary` "•". Empty state → `TabEmptyState`. |
| `ActionItemsTab` | `components/meeting-intelligence/ActionItemsTab.tsx` | `actionItems` as rows (dot `bg-primary-container` + `font-body-md font-medium text-on-surface`, meta row with `User`/`CalendarDays` icons for assignee/dueDate) in a `divide-y divide-surface-variant` card; also renders the `decisions` list. Empty → `TabEmptyState`. |
| `RecordingTab` | `components/meeting-intelligence/RecordingTab.tsx` | Owner-only tab (rendered only when `isOwner`; `MeetingTabs` filters it out for non-owners, defense-in-depth via `isOwner` computed from `useUser().id === meeting.user_id`). Client fetch of `GET /api/recordings`, filters by `recording.call_id === meeting.streamCallId` (upload-sourced meetings have `upload_*` ids → no match → `TabEmptyState` "No recording available for this meeting."). **F7b v2 (corrected): playback only.** The full-pipeline owner "Generate Transcript" button that previously lived here is REMOVED — AI processing is entered ONLY via the Upload Transcript flow. This tab now renders recordings with a `Play` anchor and nothing else: Play button `bg-primary-container text-on-primary hover:bg-primary` → `<a href={url} target="_blank" rel="noreferrer">`; when no playback URL exists yet it renders a disabled `Play` with a title explaining why. No state machine, no polling. |
| `transcript-generation.ts` (agent) | `src/agent/transcript-generation.ts` | Server-only (no React). `generateTranscriptForMeeting({ userId, meetingId, streamCallId, streamCallType })` → `{ status: "ok", transcript, language? } | { status: "too_short" } | { status: "failed", message }`. Loads `@ffmpeg/ffmpeg` wasm once (singleton; self-hosted via `scripts/copy-ffmpeg-core.mjs` → `public/ffmpeg/`, served from `/ffmpeg/*`; `postinstall`+`predev`+`prebuild` hooks, 32 MB wasm gitignored), extracts 16 kHz mono FLAC per `.mkv` individual recording (`-f segment -segment_time 600`), transcribes each chunk via Groq Whisper (raw `fetch`, `whisper-large-v3-turbo`, `verbose_json` + segment timestamps, EN/UR auto-detect, retry once), maps speaker via `attendance_events` (`user_<id>_` filename → `participant_email`), merges chronological `"Speaker: text"`. Edge cases: silent track skipped, track error → fail gracefully, all silent → `too_short`, any error → `failed` "try manual upload". `GROQ_API_KEY` stays server-side. |
| `POST /api/transcript/generate` | **REMOVED (F7b v2, 2026-08-22).** Deleted. The F-series triggers NO AI; the full pipeline (Summary/Action Items/Category/RAG) runs only through the Upload Transcript flow (`POST /api/transcript/upload` → `POST /api/ai/process`). The recap page's participant `.txt` download is `POST /api/transcript/download`. |
| `CategoryTab` | `components/meeting-intelligence/CategoryTab.tsx` | Read-only: category badge `bg-primary-container/15 text-primary-container` (uppercase `text-label-caps`) + `detectedTopics` as `bg-surface-container-low` chips. Empty → `TabEmptyState`. (Change-category dropdown deferred — needs a write path.) |
| `EmptyState` | `components/meeting-intelligence/EmptyState.tsx` | Shared `TabEmptyState({ message })` — centered `rounded-xl border border-surface-variant bg-surface-container-lowest` + `Inbox` icon + `text-body-lg text-on-surface-variant`. Reuse for all empty tabs. |
| `MeetingDetail` | `components/meeting-intelligence/MeetingDetail.tsx` | Client component (`useParams` page passes `meetingId`): fetches `GET /api/meetings/[id]`, loading → `LoaderOne`, 404/error → "Meeting not found" + back button. Header: title `text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg` + `status` chip (`bg-surface-container-low text-label-caps`) + `category` chip (`bg-primary-container/15 text-primary-container`), formatted date. Renders `MeetingTabs`. |
| `AiChatTab` | `components/meeting-intelligence/AiChatTab.tsx` | Step 6 — wraps `ChatPanel`, scoped to `meetingId`. Heading `text-headline-md font-semibold text-on-surface` + `text-body-md text-on-surface-variant` intro. |
| `EngagementTab` | `components/meeting-intelligence/EngagementTab.tsx` | Step C3 — per-speaker engagement. Client component (`use client`); on mount `POST /api/engagement` with `{ meetingId }`, loading → `LoaderOne`. Error → `border-error-container bg-error-container/40` card ("Engagement could not be generated." + `error`, no RPC-specific hint). Empty → `border-surface-variant bg-surface-container-lowest` card when `!hasTranscript && !hasAttendance` ("No engagement data yet." + "Upload a transcript and/or join the meeting to capture attendance."). Otherwise an `Engagement overview` card (`overallSummary`, `whitespace-pre-line text-body-md leading-relaxed text-on-surface-variant`) + a responsive `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` of `SpeakerCard`s. Each `SpeakerCard`: name `text-body-lg font-semibold text-on-surface`; `lowEngagement` → `bg-error-container text-on-error-container` pill ("Low engagement") with `lowEngagementReason` subline; `present` shows "Attended" + presence line ("N session(s) · spoke Xs of Ys (~R%) · mic M · cam C", `text-body-md text-on-surface-variant`); `contributions` as `•` bullets (`text-primary-container`); `keyTopics` as `rounded-full bg-primary-container/15 text-primary-container` chips. **Verified live (C3):** all 4 `chromium-engagement` Playwright tests pass; the `hasAttendance` flag in `POST /api/engagement` is now computed BEFORE the AI branch appends transcript-only speakers (so a transcript-only meeting correctly reports `hasAttendance: false`). Graceful degradation confirmed: transcript-only, attendance-only, and neither each render their own explanatory state. |
| `ChatPanel` | `components/meeting-intelligence/ChatPanel.tsx` | Streaming chat UI (AI SDK `useChat` + `DefaultChatTransport`). Card `flex h-[60vh] flex-col rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0_4px_20px_rgba(0,0,0,0.04)]`; scroll area `flex-1 space-y-4 overflow-y-auto p-6`; user bubble `bg-primary-container text-on-primary`, assistant bubble `bg-surface-container text-on-surface`; input row `border-t border-outline-variant p-4` with input `bg-surface border border-outline-variant text-on-surface focus:border-primary-container` + Send `bg-primary-container text-on-primary hover:bg-primary` / Stop `bg-surface-container text-on-surface hover:bg-surface-container-high`. Renders `message.parts` text; `react-hot-toast` on `error`. Reusable for the general `/ai-chat` page via `GeneralChat` (Step P9.1). The input row also carries a variant-aware `Trash2` **Clear conversation** button (Step P9.1-clear) that wipes the chat via `clearChatStorage(chatId)` + `setMessages([])`, so every surface (general page, meeting tab, floating widget) clears identically; the widget's old duplicate header clear was removed and now defers to this. |

| `GeneralChat` | `components/meeting-intelligence/GeneralChat.tsx` | The standalone `/ai-chat` page surface (Step P9.1, **redesigned 2026-08-26**): a `section` wrapper (`flex w-full flex-col gap-6 px-6 py-8`) holding an `h1` page title (`text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg`) + `text-body-md text-on-surface-variant` subtitle, then `ChatPanel` (no `meetingId`) as the chat card — reusing the exact standalone styling so it matches the meeting-scoped AI Chat tab and the floating bubble. Presentation-only; no new AI/DB. |

**Page wiring:** `src/app/(root)/(home)/meeting-intelligence/page.tsx` → `<Sidebar_Com type="meetingIntelligence" />`; `src/app/(root)/(home)/meeting-intelligence/[id]/page.tsx` → `<Sidebar_Com type="meetingIntelligence"><MeetingDetail meetingId={id} /></Sidebar_Com>` (client page using `useParams()`). `Sidebar_Com` now accepts optional `children` (renders children when provided, else the `type`-based page) and has `meetingIntelligence` added to `SidebarPagesTypes` → renders `MeetingList`. The upload success redirect now lands on `/meeting-intelligence/[id]` (`UploadTranscriptModal.tsx`).

**API:** `GET /api/meetings` (list, scoped by `user_id`, joins `meeting_insights(category, summary)`, normalizes to `MeetingListItem[]`) and `GET /api/meetings/[id]` (detail by `id`+`user_id`, parallel-fetches `meeting_insights` + `action_items`, returns `MeetingDetailResponse`). Shared types in `src/lib/meeting-types.ts`. Both routes use the upload/process route convention: `auth()` 401 → `supabaseServer()` → try/catch with `console.error` + 500.

---

## New Components — After-Meeting Recap (built Step F7)

| Component | Path | Pattern |
| --- | --- | --- |
| `getMeetingRecap` (server helper) | `src/lib/meeting-recap.ts` | **Public, server-only** (`import "server-only"`). `getMeetingRecap(id)` reads `meetings` by id (NO auth/owner filter — the page is viewable by every participant incl. logged-out visitors per Path B), plus distinct participants from `attendance_events` (one row per `user_id`, earliest `session_started_at` → `joinedAt`, latest `session_ended_at` → `leftAt`, `talk_time_seconds` summed per user → `talkTimeSeconds`, name fallback `participant_name` → `participant_email` → `"Unknown"`), plus best-effort `description` from the Stream call `custom.description` (constructed server-side `StreamClient(NEXT_PUBLIC_STREAM_API_KEY, STREAM_SECRET_KEY)`; try/catch → `""`). Returns `MeetingRecap` (`id, title, description, status, streamCallId, startedAt, endedAt, createdAt, user_id, participants[]` where each participant has `talkTimeSeconds`). **Created instead of extending the owner-only `GET /api/meetings/[id]`** because Path B requires the page to be public for all participants + logged-out viewers, while that route is owner-scoped. |
| `AfterMeetingRecap` page | `src/app/after-meeting/[id]/page.tsx` | Server component (standalone, **outside the `(root)` sidebar group** — post-call landing, readable while logged-out). `await params.id` → `getMeetingRecap(id)` → not-found state (`bg-surface` centered card + `FileText` + "Meeting not found.") else `<AfterMeetingRecap recap={recap} />`. No sidebar/navbar. |
| `TranscriptPoller` | **REMOVED (F7b v2, 2026-08-22).** Deleted (`src/components/TranscriptPoller.tsx`) and unmounted from `src/app/layout.tsx`. It existed to toast owners when an async full-pipeline generate finished; with the generate route gone there is no background job to notify about. The recap `.txt` download is synchronous (the client polls `GET /api/transcript/status` when Stream hasn't finalized recordings). |
| `AfterMeetingRecap` | `components/meeting-intelligence/AfterMeetingRecap.tsx` | Client (`"use client"`). Standalone centered layout (`min-h-screen bg-surface px-6 py-10 text-on-surface`, `max-w-3xl`). Header = title `text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg` + optional description `text-body-md text-on-surface-variant`. Three `grid grid-cols-2 sm:grid-cols-3` stat cards (`rounded-xl border border-surface-variant bg-surface-container-lowest px-4 py-4`): Total time (`Clock` chip, `formatDuration(startedAt, endedAt)` → `Xh Ym` / `Ym Zs` / `Zs` / `—`), Participants (count), Status. Header also shows a `rounded-full bg-surface-container` status badge (dot `bg-primary` + `statusLabel`) and the meeting date/time via `formatDateTime(startedAt)`. Below the stat cards: a **Call timeline** section — when both `startedAt`/`endedAt` exist it renders a `bg-surface-container` track with one `flex` row per participant, each a `bg-primary` presence segment positioned by inline `left`/`width` % computed from `joinedAt`/`leftAt` against the meeting window (graceful "Timeline will appear once…" message when the window is missing). Participant list = `divide-y divide-surface-variant rounded-xl border border-surface-variant bg-surface-container-lowest` rows (name `text-body-md font-medium text-on-surface` + email `text-body-md text-on-surface-variant`, plus a `formatDuration(joinedAt, leftAt ?? endedAt)` "present" line and `formatTalk(talkTimeSeconds)` "spoke" line, join–leave `formatTime`). **AI insights strip** (signed-in + `hasInsights` only): `border-primary-container` card with `Sparkles` + "AI insights ready" + a `router.push('/meeting-intelligence/'+id)` "View full meeting insights" link. **Next steps** = `sm:grid-cols-2` of two `bg-surface-container-lowest` cards: "Get your transcript" (hosts the Generate Transcript button + its state messages) and "Unlock AI insights" (signed-in → Upload Transcript button opening the modal; logged-out → sign-in note). **Generate Transcript button (F7b v2: participant `.txt` download, ANY signed-in participant, NOT AI):** `bg-primary-container text-on-primary hover:bg-primary disabled:opacity-60`, label `Generate Transcript` → `Generating…`/`Transcript ready`/`Transcript exists`/`Recordings processing`, icon `Sparkles` → `Loader2` (spin); enabled only when `useUser().isSignedIn`; logged-out click → `useClerk().redirectToSignIn({ redirectUrl: window.location.pathname })` (sign-in then returns to this page); signed-in click → `POST /api/transcript/download` with `{ meetingId: recap.id, streamCallId: recap.streamCallId, streamCallType: "default" }`, and on `ok` builds a `Blob([transcript], { type: "text/plain" })` downloaded as `meeting-<id>-transcript.txt` via an anchor (the merged `SpeakerName: text` content — names resolved server-side via `attendance_events.stream_user_id`, fallback `queryMembers`, see Bug 1 fix) — no AI processing is triggered from this page. The download is always auto-detect language (English + transliterated Urdu); there is no language selector. State machine: `idle/generating/pending/done/exists/no_recording/too_short/failed` + `react-hot-toast`. **Graceful-degradation (F7b v2, 2026-08-22):** on `no_recording` (Stream hasn't finalized recordings yet) the button enters `pending`, shows "Recordings are still being processed by Stream. We'll fetch your transcript automatically when it's ready" and polls `GET /api/transcript/status` every 15s, auto-downloading the `.txt` once `rawTextAvailable` flips true — so a participant who clicks right after a call still gets their file without a dead-end error. The poll is **capped at ~5 min (≈20×15s)**; if Stream never finalizes, it stops and shows a final "No recording was captured for this meeting. You can still upload a transcript from the Dashboard to get AI summaries and insights." `too_short` and `failed` keep the button enabled (retryable) and surface the real server `message` instead of a hardcoded generic. There is NO owner-only full-pipeline button here (removed in F7b v2) and NO global `TranscriptPoller`. Signed-in AND only when `meeting_insights` already exists (gated via `GET /api/transcript/status` `hasInsights`, fetched on mount): a `router.push('/meeting-intelligence/'+id)` "View full meeting insights" link. All tokens, no raw color classes. |
| Post-call redirect | `components/MeetingRoom.tsx` | `OnLeave` now routes to `router.push('/after-meeting/'+call.id)` instead of `/`; plus a `call.on("call.ended", ...)` listener (with a `recapNavigated` `useRef` guard) routes any remaining participant to the same page when the owner ends the call. Double-navigation is guarded. Consent notice now uses the generic `recording_started`/`recording_stopped` events (covers individual audio + composite). |

**DEVIATION from the F7 prompt (intentional):** the prompt said extend the owner-only `GET /api/meetings/[id]` and reuse it. Because Path B requires the recap page to be viewable by the owner AND all other participants (including logged-out visitors), a separate PUBLIC helper `getMeetingRecap` was created and the owner-only API was left untouched. The recap page is public (`getMeetingRecap` has no auth/owner filter) and any transcript action from it — `POST /api/transcript/download` (participant `.txt`, never AI) — is gated by Clerk auth at the route (401 if unauthenticated). The full AI pipeline runs only via the Upload Transcript flow.

---

## New Components — Cross-Meeting Search (built Step C1)

| Component | Path | Pattern |
| --- | --- | --- |
| `SearchPage` | `components/SearchPage.tsx` | Client component (`"use client"`), rendered by `<Sidebar_Com type="search" />` (the `/search` route). Search form: `flex w-full max-w-2xl items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-3`, `Search` icon `text-on-surface-variant`, controlled `input` (`bg-transparent text-body-lg text-on-surface outline-none placeholder:text-on-surface-variant`) + `Search` submit `inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary-container px-4 py-2 text-body-md font-semibold text-on-primary hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60` (shows `Loader2` spin while loading). States: `isLoading → LoaderOne`; `!searched →` explanatory hero text (`text-body-md text-on-surface-variant`); `error →` centered `rounded-xl border border-error-container bg-error-container/40 px-6 py-16 text-center` with `Search` `text-error` icon + message; if error includes `match_meeting_chunks_user`, shows the "run the RPC in Supabase SQL Editor" hint (surfaces a missing live RPC instead of masking it as "no matches"); `searched && groups.length === 0 →` centered `border border-surface-variant bg-surface-container-lowest` "No matches across your meetings." card. Results: `groupByMeeting()` groups `CrossMeetingHit[]` (imported from `@/agent/rag`) by `meetingId` → one `overflow-hidden rounded-xl border border-surface-variant bg-surface-container-lowest shadow-[0_4px_20px_rgba(0,0,0,0.04)]` card per meeting; header row (`border-b border-surface-variant bg-surface-container-low/50 px-6 py-4`) = `next/link` to `/meeting-intelligence/${meetingId}` (`font-body-md font-semibold text-primary-container hover:underline`, break-words) + `text-label-caps uppercase tracking-wider text-on-surface-variant` "{n} match(es)"; body `divide-y divide-surface-variant` shows up to `MAX_HITS_PER_MEETING=3` hits (`px-6 py-4`): snippet `text-body-md text-on-surface` trimmed to `SNIPPET_CHARS=280` + "…", plus `inline-flex items-center rounded-full bg-primary-container/15 px-2 py-0.5 text-xs font-medium text-primary-container` "X% match" (`Math.round(hit.similarity*100)`); if more hits, a `+N more from this meeting` `next/link` to `/meeting-intelligence/${meetingId}`. Renders inside `Sidebar_Com`'s `bg-surface` shell — no own bg. |

**Page wiring:** `src/app/(root)/(home)/search/page.tsx` → `<Sidebar_Com type="search" />`; `src/components/Sidebar.tsx` gained `"search"` in `SidebarPagesTypes` + case `{type === "search" && <SearchPage />}`; `constants/index.tsx` `sidebarLinks` gained `{ label: "Search", href: "/search", icon: <Search className="h-5 w-5" /> }`.

**API:** `POST /api/search` (`runtime="nodejs"`) — `auth()` 401 if no `userId`, parses `{ query }`, 400 if empty, calls `searchAcrossMeetings(userId, query)` (from `@/agent/rag`), returns `{ results: CrossMeetingHit[] }`; on catch returns 500 with the error message (so a missing/throwing `match_meeting_chunks_user` RPC is visible, not a silent `[]`). The agent function `searchAcrossMeetings` lives in `src/agent/rag.ts` (never imports React/components), embeds the query with the shared `gemini-embedding-001` 768-dim model, and calls the `match_meeting_chunks_user` Supabase RPC (user-scoped join `meeting_chunks → meetings`). All secrets stay server-side.

## New Components — Meeting Prep (built Step C2)

| Component | Path | Pattern |
| --- | --- | --- |
| `PrepPage` | `components/PrepPage.tsx` | Client component (`"use client"`), rendered by `<Sidebar_Com type="prep" />` (the `/prep` route). Form: title `input` (`bg-surface-container text-on-surface outline-none placeholder:text-on-surface-variant`) + optional notes `textarea` (3 rows) + "Generate prep" `bg-primary-container text-on-primary hover:bg-primary` button (shows `Loader2` spin while loading, disabled when title empty). Posts `{ title, notes }` to `POST /api/prep`. States: `isLoading → LoaderOne`; not-yet-generated → explanatory hero (`text-body-md text-on-surface-variant`); `error →` centered `rounded-xl border border-error-container bg-error-container/40 px-6 py-16 text-center` with `ListChecks` `text-error` icon + message, and if the error includes `match_meeting_chunks_user` shows the "apply the RPC in Supabase SQL Editor" hint (surfaces a missing live RPC instead of masking it); generated but empty (`hasAny === false`) → centered "No prep suggestions yet." card; success → four `overflow-hidden rounded-xl border border-surface-variant bg-surface-container-lowest shadow-[0_4px_20px_rgba(0,0,0,0.04)]` cards (Context to know / Open action items to follow up / Discussion points / Questions to ask) rendering only non-empty sections as `divide-y divide-surface-variant` bullet lists (`text-primary-container` "•" + `text-on-surface`). Renders inside `Sidebar_Com`'s `bg-surface` shell — no own bg. Uses `ListChecks`/`Loader2` icons. |

**Page wiring:** `src/app/(root)/(home)/prep/page.tsx` → `<Sidebar_Com type="prep" />`; `src/components/Sidebar.tsx` gained `"prep"` in `SidebarPagesTypes` + case `{type === "prep" && <PrepPage />}`; `constants/index.tsx` `sidebarLinks` gained `{ label: "Prep", href: "/prep", icon: <ListChecks className="h-5 w-5" /> }`.

**API:** `POST /api/prep` (`runtime="nodejs"`) — `auth()` 401 if no `userId`, parses `{ title, notes }`, 400 if title empty, calls `generatePrepSuggestions(userId, title.trim(), notes?.trim())` (from `@/agent/prep`), returns `{ suggestions }`; on catch returns 500 with the error message. The agent function lives in `src/agent/prep.ts` (never imports React/components): embeds with the shared `QUESTION_EMBEDDING` 768-dim model, calls the `match_meeting_chunks_user` Supabase RPC (user-scoped), enriches with related `meeting_insights` + open `follow_ups`, then `generateStructuredWithFallback` (Gemini→Groq). All secrets stay server-side.

**Status:** Step C2 (Meeting Prep Suggestions) is built and verified live end-to-end. The original `/api/prep` 500 came from a retired Groq fallback model; the fix sets `fallbackModel` to `groq("openai/gpt-oss-20b")` (json_schema path) in `src/agent/models.ts`. A live prep run with Gemini 503 fell back to Groq gpt-oss-20b and returned valid structured prep suggestions. No new UI pattern beyond the shared list-card treatment above.

## New Components — Follow-ups (built Step 7)

| Component | Path | Pattern |
| --- | --- | --- |
| `FollowUpList` | `components/follow-ups/FollowUpList.tsx` | Client component fetching `GET /api/follow-ups`. Reuses the `RecordingPage` list-card treatment exactly: `section flex w-full flex-col gap-6 px-6 py-8`, heading + count, `overflow-hidden rounded-xl border border-surface-variant bg-surface-container-lowest shadow-[0_4px_20px_rgba(0,0,0,0.04)]`, 12-col header (`text-label-caps uppercase tracking-wider text-on-surface-variant`) + `divide-y divide-surface-variant` rows. Each row is a `next/link` → `/follow-ups/${id}`. Title cell = `font-body-md font-medium text-on-surface` + status chip: `pending` → `bg-surface-container text-on-surface-variant`, `needs_attention` → `bg-primary-container/15 text-primary-container`, `completed` → `bg-primary-container text-on-primary` (all `inline-flex w-fit items-center rounded-full px-3 py-1 text-label-caps uppercase tracking-wider`). Due is rendered as a muted `text-body-sm text-on-surface-variant` sub-line under the title (`Due {toLocaleDateString}`), so the row keeps the SAME 3-column shape as the other list pages (no separate Due column). Columns: Action item `md:col-span-5` / Meeting (truncate `text-on-surface-variant`) `md:col-span-3` / Open `md:col-span-4`. Action cell = `col-span-12 mt-2 flex flex-wrap justify-end gap-2 md:col-span-4 md:mt-0 md:flex-nowrap` (MUST match `MeetingList`/`PreviousPage`/`UpcomingPage`/`RecordingPage` — the old `md:col-span-2`+`flex-wrap` stacked `Open` above the `[Delete][Cancel]` confirm, the inconsistency fixed 2026-08-29) and holds the `Open` link (`ArrowRight`, `border border-surface-variant text-primary hover:border-primary hover:bg-primary/5`, `whitespace-nowrap`) + `ConfirmDelete`. Empty → centered card + `ListChecks` + "No follow-ups yet." Loading → `LoaderOne`. |
| `FollowUpDetails` | `components/follow-ups/FollowUpDetails.tsx` | Client, `id` prop, fetches `GET /api/follow-ups/${id}`. Back link `ArrowLeft` → `/follow-ups`. Header = action title (`text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg`) + meeting title (`text-on-surface-variant`). Details card (`bg-surface-container-lowest p-6 shadow-[…]`): `dl` grid `sm:grid-cols-2` rows (Assignee / Due date / Priority / Meeting started) with `dt` `text-label-caps uppercase tracking-wider text-on-surface-variant` + `dd` `text-body-md text-on-surface`; Notes if present. Status card: 3-button segmented control (`pending` / `needs_attention` / `completed`) — active = `bg-primary-container text-on-primary hover:bg-primary`, inactive = `border border-surface-variant bg-surface-container-lowest text-on-surface hover:border-primary hover:bg-surface-container-low`; `completed` shows `CheckCircle2`. Click → `updateFollowUpStatus` via `useTransition` + refetch. 404/not-found → back link + `ListChecks` "Follow-up not found." card. |

**Page wiring:** `src/app/(root)/(home)/follow-ups/page.tsx` → `<Sidebar_Com type="followUps" />`; `src/app/(root)/(home)/follow-ups/[id]/page.tsx` → `<Sidebar_Com type="followUps"><FollowUpDetails id={id} /></Sidebar_Com>` (client page using `useParams()`). `Sidebar.tsx` gained `"followUps"` in `SidebarPagesTypes` + case `{type === "followUps" && <FollowUpList />}`. The `/follow-ups` sidebar link already existed in `constants/index.tsx`.

| Component | Path | Pattern |
| --- | --- | --- |
| `SettingsPage` | `components/SettingsPage.tsx` | Client (`useUser` from Clerk). Renders inside `Sidebar_Com`'s `bg-surface` shell — no own `bg-surface`/`min-h-screen`. `section flex w-full flex-col gap-6 px-6 py-8`; heading `text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg` + `text-body-md text-on-surface-variant` sub. **Account card:** `rounded-xl border border-surface-variant bg-surface-container-lowest p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]`, heading `text-headline-sm font-semibold text-on-surface`, avatar `h-12 w-12 rounded-full object-cover` + name `font-body-md font-medium text-on-surface` + email `text-body-md text-on-surface-variant` (read-only from Clerk). **Preferences card:** same card treatment, header `border-b border-surface-variant px-6 py-4` + `divide-y divide-surface-variant` rows `flex items-center justify-between gap-4 px-6 py-4`, label `font-body-md font-medium text-on-surface` + hint `text-body-md text-on-surface-variant`. Inline **Toggle** (local, not a shared component): `<button role="switch" aria-checked>` `h-6 w-11 rounded-full` → on `bg-primary-container` / off `bg-surface-container`, knob `h-5 w-5 rounded-full` → on `translate-x-5 bg-on-primary` / off `translate-x-0.5 bg-on-surface-variant`. State in `useState` seeded from `localStorage` (`neurameet:prefs`) on mount, written back on change (try/catch, no backend). 3 prefs: email notifications / AI auto-summary on upload / desktop reminders. |

**API + Action:** `GET /api/follow-ups` (list, scoped via the user's meeting ids `.in("meeting_id", ids)`, joins `meetings(title)` + `action_items(title, assignee, due_date)`, maps to `FollowUpItem[]`) and `GET /api/follow-ups/[id]` (detail, same scope, `maybeSingle` → 404, returns `FollowUpDetail`). Shared types `FollowUpItem` / `FollowUpDetail` / `FollowUpStatus` / `FollowUpPriority` in `src/lib/meeting-types.ts`. **Status write is a Server Action, NOT an API route** (user decision): `src/actions/follow-ups.ts` `updateFollowUpStatus(id, status)` (`"use server"` + `import "server-only"`) — validates enum, `auth()` 401, ownership via user's meeting ids, `supabaseServer()` update `status`+`updated_at`, `revalidatePath` both paths, try/catch → `{ ok, error }`. **Auto-generation:** `src/app/api/ai/process/route.ts` now inserts `follow_ups` (one per action item, `status:'pending'`, `priority:'medium'`) right after writing `action_items` (non-fatal past insights). One-time backfill SQL populates the 3 already-processed meetings.

> `ChatPanel` (AI Chat) is built at `components/meeting-intelligence/ChatPanel.tsx` — see the Meeting Intelligence section above. The general `/ai-chat` page that reuses it shipped at Step P9.1 (see `GeneralChat` above).

---

## Auto Attendance (B0–B5) — API surface + Overview-tab Download control

- `POST /api/attendance/event` (B2): Clerk `auth()` → resolve `stream_call_id` → `meetings.id` (lazily created on first join) → switch on `event_type` (join/leave/mic_on/mic_off/camera_on); idempotent open-row reuse, server-side talk-time accumulation. Service-role write. Captured client-side by `src/hooks/useAttendanceTracking.ts` wired into `MeetingRoom.tsx` (background hook, no UI).
- `GET /api/attendance/report` (B3): owner-only (`meetings.user_id === Clerk userId`) `?meetingId=` → returns `application/pdf` (`Content-Disposition: attachment; filename="attendance-report-{meetingId}.pdf"`); `401` unauth, `404` no rows, `500` on failure. One line per `attendance_events` row (one row per join session per participant) generated by `src/lib/attendance-pdf.ts` (`pdf-lib`, UTC timestamps). `AttendanceRow` type in `src/lib/meeting-types.ts`.
- **B4 (UI) SHIPPED + VERIFIED (end-to-end):** the Overview tab (`components/meeting-intelligence/OverviewTab.tsx`) has the "Download attendance report" control — an `<a download>` to `GET /api/attendance/report?meetingId=` (anchor, no fetch/Blob; same-origin GET sends the Clerk cookie, route returns `Content-Disposition: attachment`), disabled (greyed, `aria-disabled`) when `attendanceCount === 0`. `attendanceCount` is sourced from the detail API (`GET /api/meetings/[id]` gained an `attendanceCount` field via a parallel `attendance_events` exact-count query) and threaded `MeetingDetail → MeetingTabs → OverviewTab`. `MeetingDetailResponse` in `src/lib/meeting-types.ts` gained `attendanceCount: number`. **Verified live (user-driven):** meeting `cecc84d3-…` (4 sessions) downloaded a correct PDF via the control; a meeting with no rows showed the greyed `aria-disabled` button with exact text `No attendance recorded yet.` and fired no request.
- **B5 (end-to-end verify) DONE + VERIFIED (automated):** `tests/attendance.spec.ts` (`chromium-attendance` Playwright project, reuses the `auth.setup.ts` Clerk testing-token session) drives the full capture → report loop and asserts the PDF contents match the captured events (participant name/email, `Participant`/`Camera` headers, `Total sessions: 1`) plus the Overview-tab `a[download]` `href`. `npm run build` green. **Auto Attendance (B0–B5) is complete.**
- **Test harness fixes (`tests/auth.setup.ts`, shared Clerk session for ALL projects):** (1) the `window.Clerk?.loaded` wait was 30s — too short for the Clerk dev-browser handshake on a cold `npm run dev`; bumped to 60s. (2) `clerk.signIn`'s ticket `setActive` reloads `/dashboard`, racing the explicit `page.goto("/dashboard")` and aborting it with `net::ERR_ABORTED`; fixed with `page.goto("/dashboard", { waitUntil: "domcontentloaded" }).catch(() => {})` then `waitForURL(/\/dashboard/)`. Both fixes unblocked the whole suite (auth, attendance, engagement, unauth) — without them every project failed at setup.

---

## New Components — Guest Join Flow (built Step G1 final, 2026-08-31)

| Component | Path | Pattern |
| --- | --- | --- |
| `DeviceSetup` | `components/DeviceSetup.tsx` | **Shared device setup surface — reused by BOTH signed-in and guest flows.** Provider-agnostic: accepts `{ call: Call; onJoin: () => void; buttonLabel?: string }` and does NOT call `useCall()` (the parent resolves/wires the call from context). Establishes the canonical in-call device-setup pattern: `probeMedia` (one-shot `navigator.mediaDevices.getUserMedia` per device, tracks stopped immediately) gates the enable/disable; localStorage-persisted device selection + mic/camera on-off toggle state; `AudioDropdown` switches `SfuModels.AudioBitrateProfile` (mono-32k / mono-64k / stereo-64k, 16 kHz FLAC for Whisper). Renders: large centered `VideoPreview` (Stream SDK, with a permission-denied `border-error` fallback panel) + `DeviceDropdown` (camera/mic/Speaker) labels + selected checkmark + the parent's `buttonLabel` (passes through, e.g. "Join Meeting" for signed-in / "Ask to join" for guest). Does NOT call `call.join()` — that is the parent's job via `onJoin`. Imports `@stream-io/video-react-sdk` only (`useCameraState`, `useMicrophoneState`, `useDeviceList`, `VideoPreview`, `useCallStateHooks`). Re-exported `DeviceDropdown` + `DeviceItem` from `MeetingSetup` for backward compatibility. |
| `MeetingSetup` (refactored) | `components/MeetingSetup.tsx` | **Thin signed-in wrapper** over the shared `DeviceSetup`. `useCall()` → `useCameraState`/`useMicrophoneState` permission hooks → `handleClick` (`POST /api/meetings/:id/members` + `call.join({ create: false })` + pre/post re-disable of denied devices) → `<DeviceSetup call={call} onJoin={handleClick} buttonLabel="Join Meeting" />`. Re-exports `DeviceDropdown` / `DeviceItem`. ~50 lines (down from 477). Signed-in flow behavior is byte-for-byte identical to before the extraction (`call.join`, member POST, device-disable logic all unchanged). |
| Guest page (phase state machine) | `app/(root)/meeting/[id]/guest/page.tsx` | **Phase SM:** `lobby → waiting → admitted/denied/expired/not_found/error`. `lobby`: name/email modal (name required 2–100 chars, email optional format-validated) → POST `/api/guest/request-join` → on `waiting` set phase `waiting`, on non-waiting (G3 open-mode) `console.log("[guest] open-mode short-circuit → rendering MeetingRoom")` + set phase `admitted`. `waiting`: `GuestWaitingScreen` (spinner + "Waiting for host to admit you" + cancel), polls `GET /api/guest/status` every 5s. `admitted` / open short-circuit: `console.log("[guest] phase=admitted → rendering MeetingRoom")` then renders `<StreamCall call={call}><MeetingRoom /></StreamCall>` — **the same `MeetingRoom` component signed-in participants use** (Fix 6). `denied`/`expired`/`not_found`/`error`: `TerminalScreen` (icon + message + home link). `GuestStreamClientProvider` (two-step `connectUser` with `StrictMode` ghost-participant guard via `clientRef`) wraps `GuestCallFlow` which holds the call across phases so the Stream session is continuous from setup through the live room — no remount on admit. G3 short-circuit: `data.waiting ? setPhase("waiting") : setPhase("admitted")`. |
| `GuestStreamClientProvider` | `components/GuestStreamClientProvider.tsx` | Two-step guest connection (`new StreamVideoClient({ apiKey })` then `connectUser(guestUser, accessToken)`) bypassing the `StreamVideoClientOptionsWithGuestUser` type constraint (see G0 architect). `StrictMode`-safe via `clientRef` guard. **Bug fix (2026-09-04):** guard refactored from `timedOut || !client || !connected` (flashed `LoadError` during the ~1s in-flight `connectUser` window) to separate `timedOut` (`LoadError`) / `!client || !connected` (`<LoaderOne />`) branches — the in-flight connect now shows a spinner instead of `LoadError`. `connectError` is cleared at the top of the effect on every new credential set so a fresh attempt starts clean. Wraps the guest call flow; never imports `StreamClientProvider` (signed-in path is fully isolated). |
| `GuestWaitingScreen` | (in `app/(root)/meeting/[id]/guest/page.tsx`) | 5s poll + spinner + "Waiting for host to admit you" message. Uses `useLoadingTimeout` (12s) + `LoadError` per the code standards. |
| `TerminalScreen` | (in `app/(root)/meeting/[id]/guest/page.tsx`) | Unified terminal state for denied / expired / not_found / error. Icon + message + home link. |
| `guest-store.ts` (server lib) | `src/lib/guest-store.ts` | In-process Promise-cache dedup keyed by `meeting_id::request_nonce` (8s timeout race on reuse path), 10-min TTL cleanup, `resolveMint`/`rejectMint`/`getStatus`/`admit`/`deny`. NOT Supabase-backed at G1 (see G3 — the `guest_admission_mode` column + Supabase persistence are the G3 work item, not yet done). `vitest` 17/17 green. |
| `POST /api/guest/request-join` | `app/api/guest/request-join/route.ts` | POST, no auth. `createGuestUser` via `@stream-io/video-client` (NOT `@stream-io/node-sdk` — `createGuestUser` is a `StreamVideoClient` method, per G0 §4.5.1). `sendCallEvent` via `@stream-io/node-sdk` (only for the call-event emit, with `user_id` for server-side auth). G3 open-mode short-circuit: reads `guest_admission_mode` from `meetings` (defaults to `approval`/fail-safe if row missing), `admit()` in-store if open so the first poll sees `admitted`, else emit `guest.request_join`. |
| `GET /api/guest/status` | `app/api/guest/status/route.ts` | GET poll. Returns `{ status: "pending" \| "admitted" \| "denied" \| "expired" \| "not_found" }`. `vitest` 4/4 green (delegates to `getStatus`). |
| `POST /api/guest/admit` | `app/api/guest/admit/route.ts` | Owner-only. Clerk `auth()` → 401; cross-check `guest_token` matches `meeting_id` (async, DB-backed — fixes the in-memory 403 bug across serverless instances); owner check `meetings.user_id !== userId` → 403; `admit(guest_token)` is the single source of truth (check-and-set, returns false if already resolved → 409); best-effort `sendCallEvent` `guest.admitted` to the guest's WebSocket (no-op if not in-call, poll is primary). |

## Guest Join Flow — Deleted/Obsolote (G1 final cleanup, 2026-08-31)

| File | Status |
| --- | --- |
| `components/GuestCallView.tsx` | **DELETED** — was 239 lines of decorative non-functional lobby (static buttons, own VideoPreview, NOT the real MeetingRoom). Guest admitted state now renders the real `MeetingRoom`. |
| `app/(root)/meeting/[id]/guest/page.test.tsx` | **DELETED** — 6 tests against `GuestCallView`, now obsolete. |
| `components/ui/sidebar-demo.tsx` | **DELETED** — unused Stream sidebar copy, imported nowhere. |
| `components/ui/sidebar.tsx` | **DELETED** — unused Aceternity sidebar (kept `ui/dropdown-menu.tsx` + `ui/popover.tsx` which ARE used). |
| `prompts/step-G4-guest-lobby-redesign.md` | **SUPERSEDED** by `prompts/step-G1-guest-setup-page.md`. |
| `prompts/step-G4-screen-redesign.md` | **SUPERSEDED** by `prompts/step-G1-guest-setup-page.md`. |

## Guest Admission Toast

| Component | Path | Pattern |
| --- | --- | --- |
| `GuestAdmissionToast` | `components/MeetingRoom.tsx` (`showGuestToast` / `ToastContent`) | **Owner guest-approval toast (G2, single-click fix 2026-08-31).** Durable `react-hot-toast` with inline Accept/Deny buttons — deduped by `id: guest_token`, `duration: Infinity` (auto-dismissed after 10 min via `setTimeout` matching the guest-store TTL, `useRef`-tracked for cleanup). `ToastContent` tracks a local `outcome: "idle" \| "pending" \| "success" \| "error"` state: while `pending` the buttons show a spinner; on `success`/`error` an inline label renders on the SAME toast ("Alice admitted" / "Admit failed: …") instead of replacing the toast, and `finally` delays `toast.dismiss(guest_token)` by 1500ms so the owner sees the result before it auto-dismisses. A `admitCalled`/`denyCalled` `useRef` guards against duplicate API clicks. This pattern fixes the double-click-accept bug (root cause: synchronous `toast.dismiss` in `finally` deleted the interactive toast before the owner could see the outcome). Regression test in `MeetingRoom.test.tsx` asserts `toast.dismiss` is NOT called synchronously after the admit API resolves. |

---

## Registry Update Rule

Every new component gets a row here immediately after creation, with the pattern it establishes so the next session reuses it instead of inventing a variant. Run `/imprint` after any new UI component or page.
