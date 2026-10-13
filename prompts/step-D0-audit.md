# Step D0 — Meeting Experience Architect Audit

**Phase:** Meeting Experience Polish (between Advanced A0–C3 and Deploy)
**Status:** Audit complete — produces the authoritative D1/D2/D3+ step list below.
**Branch:** `fix/graceful-degradation-g1-g2` (uncommitted; do not push without approval)
**Zero-cost rule:** Stream free tier only. No paid plan, no paid design tool.

---

## 1. Audit inputs (what exists today)

### Code under review
- `src/components/MeetingSetup.tsx` — pre-join lobby: `VideoPreview`, "Join with mic and camera off" checkbox, `DeviceSettings` (hidden menu), audio-profile dropdown, Join button.
- `src/components/MeetingRoom.tsx` — in-call: `PaginatedGridLayout` / `SpeakerLayout` (grid / speaker-left / speaker-right), `CallControls`, layout dropdown, `CallStatsButton`, participants toggle, `EndCallButton`.
- `src/components/MeetingModel.tsx` — create/schedule/join modal (NOT the live call; has `join-meeting.png` / `new-meeting.png` design mirrors in `context/designs/`).

### Robust logic already in place (MUST be preserved through any redesign)
- MeetingSetup: `probeMedia()` stream probe before enabling devices; `localStorage` camera/mic preference persistence; audio-bitrate profile switching (`SfuModels.AudioBitrateProfile`) gated on `call.state.settings?.audio.hifi_audio_enabled`; graceful join-with-media-blocked path.
- MeetingRoom: `CallLayout` defined OUTSIDE the component (stable identity — avoids the "Maximum update depth exceeded" loop on camera toggle); attendance tracking via `useAttendanceTracking().reportLocalLeave()` on leave.

### Installed Stream SDK (verified)
- `@stream-io/video-react-sdk` **1.40.2**, `@stream-io/video-client` **1.57.0**.
- `@stream-io/video-filters-web` **installed** (Background Filters assets).
- `@stream-io/audio-filters-web` **NOT installed** (Noise Cancellation dependency).

### Stream SDK pieces available but NOT yet used
- `Reaction` (reactions), `RingingCall` (ringing/lobby UX), `Search` (in-call participant search), `CallRecordingList`, `Tooltip`, `StreamTheme` — all core SDK, no extra package/plan.

### Design references
- **No design image exists for the live Meeting Setup or Meeting Room.** Closest are `join-meeting.png` / `new-meeting.png`, which map to the `MeetingModel` modal, not the in-call screen.
- Per AGENTS.md, D1/D2 are designed from Zoom/Meet UX patterns + existing `ui-tokens` (`context/ui-tokens.md`). The Design Fidelity Rule does **not** apply (no image to match).

---

## 2. Zero-cost verification (premium features)

Verification path used: the `stream-docs` skill (available stand-in for the "Stream MCP/agent tool"; the live MCP server + `getstream` CLI are NOT connected this session).

Findings:
- **Background Filters** — doc states assets ship in `@stream-io/video-filters-web` and load at runtime from `unpkg.com/@stream-io/video-filters-web/.../mediapipe`. No explicit free/paid statement on the page. Requires the package (installed) + runtime CDN assets.
- **Noise Cancellation** — doc states "Enable noise cancellation by installing `@stream-io/audio-filters-web`" (NOT installed). SDK (`useNoiseCancellationLoader`) only loads it "if the server-side noise cancellation setting is enabled" — a gated backend setting. No explicit free/paid statement.

**Conclusion:** free-tier status could NOT be confirmed from available docs. Both require a runtime/package dependency and a server-side setting. They are therefore **excluded from the committed D3+ list** and held in a *verify-first backlog* — promote to a D-step only after the Stream MCP confirms zero-cost (or after the user confirms a plan that enables them).

---

## 3. Decisions locked
- D1/D2 aesthetic pass → **implement directly** from Zoom/Meet patterns + `ui-tokens` (no mockup step, no reference image).
- Premium FX → **verify-first backlog**, out of committed D3+.
- Architecture preserved: keep `MeetingSetup` (pre-join) and `MeetingRoom` (in-call) as separate components; keep all robust logic above.
- D3+ = one net-new Stream feature per step, clearly-free SDK only.

---

## 4. D1 — Meeting Setup redesign (aesthetic-first)

**Goal:** Bring the pre-join lobby to Zoom/Meet quality; keep every robust behavior.

- **D1a — Restructure lobby layout**
  - Large centered self-`VideoPreview` (already `hasCameraPermission`-gated with a fallback panel — keep).
  - Replace the hidden `DeviceSettings` menu + single checkbox with **explicit Camera and Mic device dropdowns** that show human-readable device labels (derive from `useCameraState().devices` / `useMicrophoneState().devices`, reuse `useDeviceList`). Selecting a device calls `camera.select(id)` / `microphone.select(id)` (the localStorage persistence logic already handles preference restore — keep it).
  - Replace "Join with mic and camera off" checkbox with **two mic/cam on-off toggle buttons** showing live enabled/disabled state (drive from `useCameraState().camera` / `useMicrophoneState().microphone` status). Keep `isMicCamToggleOn` behavior equivalent.
  - Prominent Join button (keep `handleClick` logic: members POST, media-blocked handling, `call.join({ create: false })`).
  - Restyle with `ui-tokens` (no raw hex / raw Tailwind color classes).

- **D1b — Permission & feedback polish**
  - When camera/mic permission is denied or `probeMedia` fails, show a **red-bordered preview / clear "allow access" hint** instead of silent degradation (the current `toast` stays as secondary).
  - Keep audio-profile dropdown ("voice calls" / "podcasts" / "music calls") and its `SfuModels.AudioBitrateProfile` switching.
  - Keep all `localStorage` preference persistence and `probeMedia` pre-join probe.

**Verify (D1):** `npx tsc --noEmit`, `npm run build`, manual: grant/deny camera+mic, switch devices, join with media off, refresh to confirm device persistence.

---

## 5. D2 — Meeting Room redesign (aesthetic-first)

**Goal:** Zoom/Meet-quality in-call layout; keep current Stream layout switching and attendance reporting.

- **D2a — Top bar + restyled control bar**
  - Add a **top bar**: meeting title (from `call.state`/`custom.description`), an **elapsed timer** (derive from `call.state.endedAt`/`startedAt` or a lightweight `useState`+interval started on `JOINED`), and **participant count** (from `useParticipants().length`).
  - Restyle the bottom control bar into **icon + label buttons** for mute, camera, share, participants, layout, leave — consistent with `ui-tokens`. The actual actions stay on Stream's `CallControls` where possible; wrap/extend rather than reimplement signaling.
  - Move `CallStatsButton` out of the primary bar into a settings/kebab menu.
  - Keep `EndCallButton` (hidden for personal rooms) and `OnLeave` → `reportLocalLeave()` + router push.

- **D2b — Panel & interaction polish**
  - Participant panel: integrate Stream **`Search`** for in-call participant search (replace/augment the plain `CallParticipantsList`).
  - Add a **reactions bar** using Stream **`Reaction`** (send + receive); surface incoming reactions as floating UI.
  - Cleaner gallery/spacing for `PaginatedGridLayout` / `SpeakerLayout`; keep the existing grid / speaker-left / speaker-right switching.

**Verify (D2):** `npx tsc --noEmit`, `npm run build`, manual: join a call, confirm timer + count + controls, open participants + search, send a reaction, toggle layouts, leave (attendance logged).

---

## 6. D3+ — New Stream functionality (one per step, clearly-free)

Each step: `/architect` (if non-trivial) → `/develop` → `/check` verify → `/test` where regression-worthy → `/sync`. Every Stream call verified against the installed SDK type defs (`node_modules/@stream-io/video-react-sdk/dist/**/*.d.ts`) or `stream-docs` before coding.

- **D3.1 — Reactions:** wire Stream `Reaction` component + reaction send/receive in `MeetingRoom` (D2b may stub the bar; D3.1 completes it). Core SDK, free.
- **D3.2 — In-call participant `Search`:** wire Stream `Search` into the participants panel (ties to D2b). Free. ✅ closed (delivered via `CallParticipantsList` built-in search, no new code).
- **D3.3 — `CallRecordingList` surfacing:** browse/view recordings in the Meeting Room. Recording itself already exists; this only surfaces the list. Free. ✅ closed (built in `MeetingRoom.tsx` via a Recordings control-bar button + panel; the meeting-detail `RecordingTab.tsx` already surfaced recordings, so left unchanged). The original D3.3 (`RingingCall`) was **re-scoped out** — see verify-first backlog.
- **D3.4/D3.5 — Screen-share prominence + layout option + `Tooltip`/`StreamTheme` polish:** make screen-share a first-class control-bar button; add an extra layout option if the SDK exposes one (verify in type defs); apply `StreamTheme` + `Tooltip` affordances. Free. (Now the leading D3+ candidate after D3.3 closed.)

### Verify-first backlog (NOT committed — confirm zero-cost via Stream MCP before promoting)
- **`RingingCall` lobby/ringing UX (originally D3.3, RE-SCOPED OUT):** Stream's `RingingCall` only renders meaningfully during `CallingState.RINGING`, which requires a ring-out-to-members flow (`call.call({ members })`). NeuraMeet joins by link/ID via `call.join()` only, so RINGING never occurs — wiring `RingingCall` would be dead UI (the exact thing the A0 audit exists to kill). Re-scoped out of the committed D3+ list during the D3.3 `/architect` session (2026-08-20). Promote only if a product-level "ring/invite members" flow is built.
- **Background Filters** (`@stream-io/video-filters-web`, installed; runtime CDN assets) — promote only if free-tier confirmed.
- **Noise Cancellation** (`@stream-io/audio-filters-web`, NOT installed; gated by server setting `audio.noise_cancellation`) — promote only if free-tier confirmed; would require installing the package + enabling the server setting.

---

## 7. Out of scope (do not build unless asked)
- New backend tables, new AI features, payments, mobile, calendar integrations.
- Premium FX until zero-cost is confirmed.
- Deploy (Step 11) — stays after D0–D3+ close.

---

## 8. Execution order
1. D1a → D1b (Meeting Setup) — verify
2. D2a → D2b (Meeting Room) — verify
3. D3.1 → D3.2 → D3.3 (CallRecordingList) closed; next D3+ = screen-share prominence + layout option + Tooltip/StreamTheme (the former D3.5). `RingingCall` re-scoped out. — verify each
4. After all close: update `progress-tracker.md` + `ui-registry.md`; then Deploy (Step 11).

## 9. Open items carried from prior sessions
- Push branch / open PR? (unpushed by request.)
- `meetings` rows still lazily created on first join (scheduled meetings invisible until someone joins) — known from B2.
- Groq fallback resilience: replace hardcoded `fallbackModel` id with an ordered candidate list (Step 11 pre-deploy item).
