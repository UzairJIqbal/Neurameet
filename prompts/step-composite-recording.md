# Step — Composite (mixed-video) call recording

**Phase:** Meeting Experience Polish — fix for `/review` Issue 1 (recordings were audio-only; user expects "screen recording" = mixed video).
**Branch:** `fix/graceful-degradation-g1-g2` (uncommitted; do not push without approval)
**Zero-cost rule:** Stream free tier only. Composite video recording confirmed free on the user's Stream plan during the `/architect` session — zero-cost rule preserved.

---

## 1. Why (from the `/review` + `/architect` sessions)

- `/review` Issue 1: recordings played back as **audio-only** ("progress bar running only audio, no screen"). User expected Record to capture the meeting as **video** (participants + shared screen), like Zoom/Meet.
- Root cause: NeuraMeet has **no `startRecording` call** — recordings are Stream-driven (built-in `CallControls` record button and/or the "default" call-type config). The call-type default was producing `individual`/audio recordings (audio-only because no video/screen was published).
- `/architect` decisions (all confirmed by the user):
  - Desired output = **composite** (one mixed/transcoded video of the whole call).
  - Composite video is **free** on the user's Stream plan → zero-cost intact.
  - Trigger = **auto-record composite via code** at call creation (not a manual dashboard step).
  - Disable `individual_recording` so the call-type's individual audio recording is not produced alongside the composite (otherwise the audio-only file the user complained about would keep appearing).

## 2. SDK facts (verified against installed type defs)

- `@stream-io/video-react-sdk` 1.40.2 / `@stream-io/video-client` 1.57.0.
- `Call.getOrCreate(data?: GetOrCreateCallRequest)` — `data` is `CallRequest`, which has `settings_override?: CallSettingsRequest`.
- `CallSettingsRequest` has `frame_recording?: FrameRecordingSettingsRequest` and `individual_recording?: IndividualRecordingSettingsRequest`.
- `FrameRecordingSettingsRequest`: `mode: "available" | "disabled" | "auto-on"` (`FrameRecordingSettingsRequestModeEnum`), `quality?: "360p" | "480p" | "720p" | "1080p" | "1440p"`.
- `IndividualRecordingSettingsRequest`: `mode: "available" | "disabled" | "auto-on"`.
- `call.startRecording(type?: CallRecordingType)` where `CallRecordingType = "composite" | "individual" | "raw"` — confirmed to exist, but NOT used here (we set the mode at creation via `settings_override`, which is repo-owned and verifiable, rather than relying on the built-in `CallControls` record button whose type we cannot force).
- `CallControls` (used in `MeetingRoom`) renders its own Record button and exposes only `onLeave` — we cannot hide just that button without replacing the whole control bar, so auto-on is the deterministic path.

## 3. Files touched

- `src/components/MeetingModel.tsx` — two `getOrCreate` call sites (`createMeeting` instant, `ScheduleMeeting`).
- `src/components/PersonalRoomPage.tsx` — one `getOrCreate` call site (`createMeeting` personal room).

## 4. Implementation

In each `getOrCreate({ data: { ... } })` `data` object, add:

```ts
settings_override: {
  frame_recording: { mode: "auto-on", quality: "720p", capture_interval_in_seconds: 2 },
  individual_recording: { mode: "disabled" },
},
```

Exactly at:
- `MeetingModel.tsx` `createMeeting` — inside `await call.getOrCreate({ data: { starts_at, members, custom, /* + settings_override */ } })`.
- `MeetingModel.tsx` `ScheduleMeeting` — same shape.
- `PersonalRoomPage.tsx` `createMeeting` — same shape (the `data` currently has `starts_at`, `members`, `custom`).

No other logic changes. `prepareCallDevices(call)` (MeetingModel) and the device-disable-before-create (PersonalRoomPage) stay as-is — `settings_override` is independent of device setup.

## 5. Out of scope

- New control-bar Record button (keep Stream's built-in; auto-on makes it correct).
- Changing the D3.3 Recordings panel or the `/recording` page Play button (that's `/review` Issue 2 — separate task).
- Any new backend table, AI feature, or paid Stream add-on.

## 6. Verify

- `npx tsc --noEmit` → clean (EXIT 0).
- `npm run build` → exit 0.
- Manual live (sandbox can't drive a real Clerk+Stream call): create/join a call with camera on or a screen-share; let it record; open the recording from the Meeting Room Recordings panel (D3.3) or `/recording` page → confirm it is a **playable video** (participants + screen), not audio-only. Already-created calls keep their old audio recordings; only newly created calls record composite.

## 7. Records to update

- `context/progress-tracker.md`: add a closed entry noting composite auto-recording enabled at call creation (resolves `/review` Issue 1).
- `context/ui-registry.md`: add a short note under the Meeting Room / call-creation entry that calls auto-record composite video.
- This file is the authoritative prompt: `prompts/step-composite-recording.md`.
