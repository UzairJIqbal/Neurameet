# Memory — A3 done + MeetingSetup camera/audio permission-denied fixes

Last updated: 2026-08-16

## What was built

- **Step A3 — Desktop reminders (implemented, `tsc`+`build` pass, manual verify pending).**
  - `src/components/ReminderManager.tsx` (new, "use client"): polls `upcomingCalls` every 30s, fires a `Notification` when a scheduled meeting enters the ~2-min lead window (GRACE_MS 15min), dedup via `sessionStorage` set keyed by `call.id`, clears set when pref OFF, `onclick` focuses tab + routes to `/meeting/[id]`. Renders `null`.
  - `src/app/(root)/layout.tsx`: `<ReminderManager />` mounted inside `StreamVideoProvider`.
  - `src/components/SettingsPage.tsx`: on `desktopReminders` toggled ON, `requestReminderPermission()` requests `Notification.permission` (toast if unsupported/denied); pref still writes.
- **Resilience bugfix — camera (`[devices]: Failed to get video stream`).** `src/components/MeetingSetup.tsx`: `camera.enable()`/`microphone.enable()` (and matching `disable()`) gated on `hasCameraPermission`/`hasMicrophonePermissions`; `<VideoPreview />` only mounts when `hasCameraPermission`, placeholder otherwise.
- **Resilience bugfix — audio, join-path (`[devices]: Failed to get audio stream`).** `src/components/MeetingSetup.tsx` `handleClick`: before AND after `call.join()`, explicitly `disable()` mic/camera (`.catch`-guarded) when permission denied; friendly toast "Joined without camera or microphone…". Root cause traced into SDK: `MicrophoneManager.setup()` auto-enables when `status === undefined && settings.mic_default_on`, and `resume()` re-enables because default `prevStatus === 'enabled'`.
- **`context/progress-tracker.md`**: added two `✅` bugfix bullets under the G1/G2 Resilience Pass entry (no renumbering).

## Decisions made

- A3 mechanism locked: Web Notification API + global client `ReminderManager` polling `upcomingCalls` (~30s); Stream call-start webhook rejected (needs server endpoint, violates "pure client-side"). Tab-open-only limitation accepted (no service-worker push). `desktopReminders` localStorage pref = source of truth for "enabled"; `Notification.permission` = source of truth for "have permission".
- For permissions-denied fixes: graceful degradation = join/show with media OFF + friendly toast, never force a doomed `getUserMedia`. Permission-guidance toast + `DeviceSettings` grant path kept intact.
- Lint (`npm run lint`) hangs in this sandbox (FlatCompat + prettier-plugin init) — rely on `tsc --noEmit` + `next build` (build "Skips linting", passes). Re-run lint in the user's real environment.

## Problems solved

- Traced the audio error to the SDK's **join-time** auto-enable (`MicrophoneManager.setup()` `mic_default_on` branch + `resume()` re-enable), NOT the setup-page path — so the fix had to live at the `call.join()` boundary, not just the mount effect. Don't re-debug by gating `microphone.enable()` alone; the SDK re-enables on join/resume.
- `useMicrophoneState`/`useCameraState` hooks are passive (read-only); `CallControls` mic button only toggles on click; `call.join()` does NOT auto-enable — the enable comes from `MicrophoneManager.setup()` + `resume()`.

## Current state

- Core Pipeline (Steps 0–9) + 9.5: green.
- A0/A1/A2 + G1/G2: done. A3: implemented (tsc+build clean), awaiting manual browser verification.
- Both MeetingSetup permission-denied fixes: implemented (tsc+build clean), awaiting manual verification.
- **All of the above is uncommitted on `main`** (large working tree). Branch `fix/graceful-degradation-g1-g2` exists, unpushed (user said "don't push yet").
- Advanced remaining after A3: A4 (View All links), A5 (dashboard dead buttons), A6 (global search), A7 (landing footer), then B0–B5 (Auto Attendance), C1–C3 (AI engagement). Deploy = Step 11.

## Next session starts with

- Get the user to manually verify in a browser: (1) A3 — toggle ON → grant → scheduled-meeting notification fires once + dedup; toggle OFF → silent + set cleared; denied → warning toast. (2) MeetingSetup — with camera+mic DENIED, no `[devices]: Failed to get video/audio stream` errors; setup shows placeholder, Join lands in room with one friendly toast, media off, granting+toggle still works.
- After verification, commit per A-step/bugfix (pattern: commit per close). Decide whether to push `fix/graceful-degradation-g1-g2`.

## Open questions

- Whether to commit the large uncommitted working tree (Core + 9.5 + A0/A1/A2 + G1/G2 + A3 + bugfixes) before continuing, or keep per-step commits.
- Whether to push `fix/graceful-degradation-g1-g2` (currently unpushed).
- Resend `from` domain still `onboarding@resend.dev` for testing; a verified domain is needed before production (Step 11).
- A0 assumed Dashboard meetings are still hardcoded sample data — A5's routing target depends on whether Dashboard gets live data first.
- Oxylabs enrichment stays deferred (paid API → violates zero-cost rule).
- Confidence note: the audio join-path fix covers both SDK re-enable triggers (initial `status === undefined` and `resume()`), but was not browser-verified in this sandbox.
