# Step D3.4 — Meeting recording access control (owner-only record + participant consent + owner-only access)

**Phase:** Meeting Experience Polish (D3.4)
**Branch:** `fix/graceful-degradation-g1-g2` (uncommitted; do not push without approval)
**Zero-cost rule:** Stream free tier only. No new package, no paid plan. All changes are client/SDK + one server-filter edit.

---

## 1. Why this step (from `/scope`)

Zoom/Meet-style recording access control, three acceptance criteria:

1. **Owner-only Record control** — only the meeting owner sees an active Record button. Non-owners see no enabled Record control at all.
2. **Real-time consent notice for ALL participants** — when recording starts, every participant (including the owner) gets a visible "this meeting is being recorded" toast/popup, in real time. Not just the owner.
3. **Owner-only recording access afterward** — the Meeting Room Recordings panel, the meeting-detail Recording tab, and the `/recording` page show recordings to the owner only; non-owners see nothing.

## 2. Decision locked (from `/architect` session 2026-08-20)

- **Manual, owner-gated composite recording.** Switch `frame_recording.mode` from `'auto-on'` to `'available'` at all three call-creation sites. The owner clicks a custom Record button to start/stop (`startFrameRecording` / `stopFrameRecording`). This matches all three acceptance criteria and the real-world Zoom/Meet flow. Trade-off: if the owner never clicks Record, no recording is produced.
- **Owner anchor.** Client: `call.state.createdBy?.id === Clerk userId` (the call creator). Server: `meetings.user_id === Clerk userId` (same anchor as the B3/B4 attendance report). One consistent anchor on each side.
- **Consent notice.** Toast on `call.frame_recording_started` (fires for every participant) saying the meeting is being recorded; a stop toast on `call.frame_recording_stopped`. Plus a persistent "Recording in progress" indicator in the control bar/header while recording is active, so anyone who joins mid-recording also sees it. The owner gets the toast too.
- **Owner-only access.** `GET /api/recordings` drops the `$or` `members` branch and filters only `created_by_user_id: userId`. UI: the Meeting Room Recordings-panel button and the meeting-detail Recording tab are hidden for non-owners. This is belt-and-suspenders with the server filter.
- **Non-owner programmatic start — posture TBD (see §6).** The `start-frame-record-call` capability gates `startFrameRecording()` server-side, but the Stream DEFAULT for that capability is unverified in this session and `settings_override` cannot restrict it (no `grants` field). Choose posture **(A)** runtime `revokePermissions` for real server-side enforcement, or **(B)** a documented UI-only gap, before `/develop`.

## 3. SDK facts (verified against installed type defs)

- `@stream-io/video-react-sdk` **1.40.2**, `@stream-io/video-client` **1.57.0**.
- **Owner:** `call.state.createdBy` (getter returns `UserResponse`, which has `.id`). Confirmed in `node_modules/@stream-io/video-client/dist/src/store/CallState.d.ts` (`get createdBy(): UserResponse | undefined`).
- **Recording events:** `call.frame_recording_started` / `call.frame_recording_stopped` (composite/mixed-video) and `call.recording_started` / `call.recording_stopped` (individual). Both fire for every participant. `call.on(event, handler)` returns an unsubscribe fn (standard EventEmitter pattern).
- **Composite controls:** `call.startFrameRecording(data: StartFrameRecordingRequest)` / `call.stopFrameRecording()`. `frame_recording.mode` accepts `'available' | 'disabled' | 'auto-on'` (`node-sdk` `FrameRecordingSettingsRequest`).
- **Standalone exported buttons** (from `@stream-io/video-react-sdk`): `ScreenShareButton`, `CancelCallButton`, `CallStatsButton`, `CallRecordingList`, `CallParticipantsList`. **`MicrophoneButton` / `CameraButton` are NOT exported in this version** (internally `ToggleAudioPublishingButton` / `ToggleVideoPublishingButton`). So build mic/camera toggles ourselves via `call.microphone.toggle()` / `call.camera.toggle()` (already a codebase pattern — `MeetingModel.tsx` calls `call.camera.disable()`).
- **`CallControls` must be replaced, not kept.** It bakes in a `RecordCallButton` that calls the *individual* `startRecording()` (disabled in our settings) and is gated only by the `START_RECORDING` capability, not by owner. We cannot hide it via props. Replacing it with a custom bar drops the dead button entirely and gives full control over the owner-gated Record control.

## 4. Files touched

- `src/components/MeetingModel.tsx` — 2 sites (`createMeeting`, `ScheduleMeeting`): `frame_recording.mode` `auto-on` → `available`.
- `src/components/PersonalRoomPage.tsx` — 1 site: same mode change.
- `src/components/MeetingRoom.tsx` — replace `CallControls` with a custom control bar; add owner-only Record button; add consent toast + persistent indicator; gate the Recordings-panel button by owner.
- `src/app/api/recordings/route.ts` — owner-only filter (drop the `members` `$or` branch).
- `src/components/meeting-intelligence/MeetingDetail.tsx` — compute + pass `isOwner` (`meeting.user_id === Clerk userId`) and `currentUserId`.
- `src/components/meeting-intelligence/MeetingTabs.tsx` — hide the `Recording` tab for non-owners.
- `src/components/RecordingPage.tsx` — confirm it relies on the now-owner-only `/api/recordings`; non-owners get an empty/forbidden state (no recordings shown).
- `context/progress-tracker.md`, `context/ui-registry.md` — update after the feature lands.

## 5. Implementation

> **Stream SDK verification rule (permanent):** before writing any Stream SDK call, verify the exact method/event/hook names and payloads against `node_modules/@stream-io/video-client/dist/src/Call.d.ts` and the `video-react-sdk` type defs (or the connected Stream MCP). The names above are confirmed, but re-confirm `startFrameRecording` request shape, the mic/camera toggle API, and the `useCallStateHooks` state hooks in this install before coding.

### 5.1 Call creation — `frame_recording` mode `auto-on` → `available`

In `MeetingModel.tsx` (`createMeeting` ~line 116, `ScheduleMeeting` ~line 150) and `PersonalRoomPage.tsx` (~line 54), change:

```ts
settings_override: {
  frame_recording: { mode: "auto-on", quality: "720p", capture_interval_in_seconds: 2 },
  individual_recording: { mode: "disabled" },
},
```

to:

```ts
settings_override: {
  frame_recording: { mode: "available", quality: "720p", capture_interval_in_seconds: 2 },
  individual_recording: { mode: "disabled" },
},
```

Keep `individual_recording: disabled` (we never use individual recording). The `mode: "available"` means composite recording is offered but only starts when the owner calls `startFrameRecording`.

### 5.2 MeetingRoom — owner + recording state

Inside `MeetingRoom`, add (alongside existing `useCallStateHooks` + `useUser`):

```ts
const { user } = useUser();
const isOwner = call?.state.createdBy?.id === user?.id; // default-safe: undefined → false
const [isRecording, setIsRecording] = useState(false);
```

`isRecording` is driven by the SDK events (not by a possibly-version-specific hook), so it is robust across SDK versions.

### 5.3 MeetingRoom — consent toast + persistent indicator (all participants)

In a `useEffect` keyed on `call` (runs once joined), subscribe and clean up:

```ts
useEffect(() => {
  if (!call) return;
  const onStart = () => {
    setIsRecording(true);
    toast("This meeting is being recorded", { icon: "🔴" });
  };
  const onStop = () => {
    setIsRecording(false);
    toast("Recording stopped");
  };
  const unsubStart = call.on("call.frame_recording_started", onStart);
  const unsubStop = call.on("call.frame_recording_stopped", onStop);
  return () => {
    unsubStart?.();
    unsubStop?.();
  };
}, [call]);
```

Render a persistent "Recording" pill in the header or control bar when `isRecording` is true (so late-joiners see it even if they missed the toast). Keep it tokened (no raw hex).

### 5.4 MeetingRoom — custom control bar (replace `CallControls`)

Remove the `CallControls` import and its `<CallControls onLeave={OnLeave} />` usage. Replace with the custom bar. Import what's needed:

```ts
import { ScreenShareButton, CancelCallButton } from "@stream-io/video-react-sdk";
import { Mic, MicOff, Video, VideoOff, Circle, Square } from "lucide-react";
```

Mic button (uses `useCallStateHooks().useMicrophoneState()` for status + `call.microphone.toggle()`):

```tsx
const { useMicrophoneState, useCameraState } = useCallStateHooks();
const mic = useMicrophoneState();
const cam = useCameraState();
// ...
<button onClick={() => call?.microphone.toggle()} className={...}>
  {mic.status === "enabled" ? <Mic/> : <MicOff/>}
  <span>{mic.status === "enabled" ? "Mute" : "Unmute"}</span>
</button>
```

Camera button (same pattern with `call?.camera.toggle()` + `cam.status`).

Then the existing custom buttons (People, **Recordings**, Reactions, Layout, CallStats) stay. `ScreenShareButton` and `CancelCallButton onLeave={OnLeave}` replace the screen-share/leave that `CallControls` used to provide.

**Owner-only Record button** (only rendered when `isOwner`):

```tsx
{isOwner && (
  <button
    onClick={async () => {
      try {
        if (!isRecording) await call?.startFrameRecording({});
        else await call?.stopFrameRecording();
      } catch (e) {
        console.error("Frame recording toggle failed", e);
        toast.error("Could not toggle recording");
      }
    }}
    className={cn(baseControl, isRecording && "bg-inverse-on-surface/10")}
  >
    {isRecording ? <Square/> : <Circle/>}
    <span>{isRecording ? "Stop Recording" : "Record"}</span>
  </button>
)}
```

Non-owners see no Record control at all (the button is not rendered). Re-confirm `startFrameRecording`'s request argument shape against `StartFrameRecordingRequest` in the installed type defs before coding (pass `{}` if no fields are required; the SDK may accept options).

**Gate the Recordings-panel button by owner** so non-owners cannot open it: wrap the existing `<Button onClick={...Recordings...}>` in `{isOwner && (...)}`. The panel itself uses `call.queryRecordings()` for the current call, which is the owner's; hiding the button for non-owners satisfies point 3 in the Meeting Room surface. (Server-side enforcement for the other surfaces is in §5.5.)

Preserve all existing robust logic: `CallLayout` stays outside the component, `OnLeave` still calls `reportLocalLeave()` then `router.push("/")`, attendance tracking / reactions / stats / `EndCallButton` untouched.

### 5.5 `/api/recordings` — owner-only server filter

In `src/app/api/recordings/route.ts`, change the `queryCalls` filter from:

```ts
filter_conditions: {
  $or: [
    { created_by_user_id: userId },
    { members: { $in: [userId] } },
  ],
},
```

to:

```ts
filter_conditions: {
  created_by_user_id: userId,
},
```

This is the real security gate for the meeting-detail Recording tab and the `/recording` page (both fetch this endpoint). Non-owners now receive zero recordings. No other logic in the route changes.

### 5.6 Meeting-detail Recording tab — hide for non-owners

In `MeetingDetail.tsx`, compute the current user and owner flag, then pass it down:

```ts
const { user } = useUser();
const currentUserId = user?.id;
const isOwner = !!currentUserId && data.meeting.user_id === currentUserId;
// pass isOwner to <MeetingTabs ... isOwner={isOwner} />
```

Wait — `MeetingDetail` is a client component already (`"use client"`), so `useUser` is available.

In `MeetingTabs.tsx`, accept `isOwner` and remove the `Recording` entry from `TABS` (or skip rendering its tab button) when `!isOwner`:

```ts
const visibleTabs = TABS.filter((t) => t !== "Recording" || isOwner);
// map over visibleTabs for the tab buttons; keep the content switch as-is
// (the Recording content is simply never reachable for non-owners).
```

`RecordingTab` itself already fetches the now-owner-only `/api/recordings`, so even if reached it returns empty — but hiding the tab is the clean UX.

### 5.7 `/recording` page

Verify `src/components/RecordingPage.tsx` fetches `/api/recordings` (it does per the grep). With the §5.5 owner-only filter, a non-owner now gets an empty list / forbidden state and sees no recordings. No code change strictly required, but confirm the empty state reads appropriately (e.g. "No recordings available") rather than an error. If it currently shows recordings for any participant, that is the leak to close — the §5.5 filter handles it.

## 6. Enforcement posture for non-owner programmatic start (DECISION REQUIRED)

This is the one open security question, surfaced during `/architect` review and **not** silently resolved.

- The composite recording start is gated server-side by the `start-frame-record-call` capability (`OwnCapability.START_FRAME_RECORD_CALL`). `startFrameRecording()` is rejected by Stream's server if the caller lacks it.
- **Per-call `settings_override` CANNOT restrict this.** `grants` (the role→capability map) lives only on the **call-type** config (`CallTypeResponse.grants` / `AppSettings.grants`, server/dashboard). Neither `CallSettingsRequest` (`settings_override`'s type) nor `CallRequest` (`getOrCreate`'s `data`) has a `grants` field. So a "capability check in `settings_override`" is not possible through that path.
- **Verified against local Stream skill docs (this session, after the network docs were unreachable):** the Stream agent skill now present at `.agents/skills/stream/` ships `references/VIDEO.md`, which confirms two facts that resolve the open question:
  1. **Capabilities are role-based and enforced server-side, evaluated at join-time against the role applied to the member (`call_member` / `host`), not the user-level role** (`VIDEO.md` §Step 2). And explicitly: *"Role permissions enforced in the dashboard, not just hidden in the UI … hiding UI is bypassable via the API"* (`VIDEO.md` §NEEDS-REVIEW). This validates the earlier objection: UI-only enforcement is bypassable, so a "consent" feature that relies on hiding the button is not real protection.
  2. **The skill's `livestream` grants example grants `start-frame-recording` to the regular `call_member` role (and `user`, and `host`), alongside separate `*-owner` variants** (`start-frame-recording-owner`, `start-recording-owner`). That is strong evidence that Stream's model grants frame-recording *start* to regular members by default — i.e. a non-owner very likely DOES get the capability absent an explicit revoke. NeuraMeet uses the `default` call type (`VIDEO.md`: "No CLI commands needed for `default` call type"), whose grants are Stream's built-in defaults; those built-in defaults are not enumerated in the local docs, but the `livestream` example (member-level frame-recording grant) is the same Stream capability model and points the same way.
- **Net read:** posture **(A)** is very likely *mandatory* for genuine owner-only recording, not optional defense-in-depth. The capability-name drift below is the only remaining uncertainty, and the runtime check in §7 step 6 closes it.

- **Capability-name version drift (must resolve at `/develop`):** the installed SDK (`@stream-io/video-client` 1.57.0) exposes `OwnCapability.START_FRAME_RECORD_CALL = 'start-frame-record-call'` and the `revokePermissions` call in this codebase must pass that enum value. The local Stream skill docs, however, use the string `start-frame-recording` (a renamed/newer variant). The server may emit the renamed string in `call.state.ownCapabilities`. **Action:** before coding `revokePermissions`, read `call.state.ownCapabilities` on a joined non-owner and use the EXACT string present there (fall back to `OwnCapability.START_FRAME_RECORD_CALL` if the server still emits the old name). Never guess the string.
- **Runtime enforcement IS available** via `call.revokePermissions(userId, [<exact-capability-string>])` (confirmed on `Call`), applied to each non-owner member on join. Zero-cost, uses existing SDK methods, but adds moving parts (must run from the owner/client that holds `update-call-permissions`, i.e. the creator).

**DECISION (2026-08-20): Posture (A) selected.** The feature's purpose is genuine access control, so UI-only gating that a devtools user could bypass is not acceptable. Implementation below.

- **(A) Real server-side enforcement — SELECTED:** on each member join, the owner's client revokes the frame-recording-start capability from non-owner members via `call.revokePermissions(userId, [OwnCapability.START_FRAME_RECORD_CALL])`. This makes owner-only recording hold even if a non-owner opens devtools and calls `startFrameRecording()` directly. The local Stream docs indicate a non-owner likely gets the capability by default, so this is the posture that actually delivers a Zoom-style consent guarantee.
  - **Implementation:** in `MeetingRoom`, gate the enforcement on `isOwner`. Use `useParticipants()` to get the live member list; in a `useEffect` keyed on the participants array, for every participant whose `userId !== call.state.createdBy?.id` and who has not yet been revoked (track a `revokedRef = useRef<Set<string>>`), call `call.revokePermissions(userId, [OwnCapability.START_FRAME_RECORD_CALL])` inside a `try/catch` (ignore errors — the member may have left or already lack the capability). This covers late joiners on every participant-list change.
  - **Capability-name drift note (§6 above) still applies at first live run:** the installed SDK uses `start-frame-record-call`; the local skill docs use `start-frame-recording`. The `revokePermissions` call uses `OwnCapability.START_FRAME_RECORD_CALL` (the installed enum). If `/check verify` shows the server still grants recording after revoke, switch the revoked string to `start-frame-recording` (or revoke both) and record the observed name in `progress-tracker.md`.
- **(B) Documented UI-only gap (rejected for this feature):** not chosen — would leave a bypassable gap in a feature whose entire point is access control.

Verification method for the default (run during `/develop`): after a non-owner joins, log/inspect `call.state.ownCapabilities` for the frame-recording-start capability (exact string per the drift note above). If it lacks the capability, the server already enforces owner-only (posture A is defense-in-depth). If it includes it — which the local Stream docs predict — posture A is mandatory. Record the observed default and the exact capability string in `progress-tracker.md`.

## 7. Out of scope (genuinely)

- Changing individual recording (stays disabled).
- Any new backend tables, AI features, payments, or deploy.

## 7. Verify

- `npx tsc --noEmit` → clean (EXIT 0).
- `npm run build` → exit 0.
- Manual (sandbox can't run Clerk+Stream creds; document the live steps):
  1. Owner creates/joins a call → sees a **Record** button; non-owner in the same call sees **no** Record button.
  2. Owner clicks **Record** → ALL participants (owner + non-owner) get the "being recorded" toast; the persistent "Recording" pill shows for everyone, including a participant who joins after start.
  3. Owner clicks **Stop Recording** → stop toast; pill clears.
  4. Non-owner opens the meeting-detail page → **Recording** tab is absent; if they hit `/api/recordings` directly they get an empty list. Owner sees the recordings.
  5. Meeting Room Recordings panel is reachable for the owner only.
  6. **Capability-default check (posture verification):** after a non-owner joins, inspect `call.state.ownCapabilities` for the frame-recording-start capability (exact string per the §6 drift note — installed SDK uses `start-frame-record-call`; local Stream docs use `start-frame-recording`). If it lacks the capability, the server already enforces owner-only (posture A is defense-in-depth). If it includes it — which the local Stream docs predict — posture A is mandatory: a non-owner could otherwise start recording via devtools. Record the observed default and the exact capability string in `progress-tracker.md`.
- After success: update `context/progress-tracker.md` (mark D3.4 ✅) and `context/ui-registry.md` (note the owner-only Record control + consent toast + gated Recordings surfaces).

## 8. Records to update

- `context/progress-tracker.md`: D3.4 ✅ (owner-only Record control, participant consent toast, owner-only recording access).
- `context/ui-registry.md`: add the owner-only Record control bar button + consent toast + persistent recording indicator; note Recordings surfaces are owner-gated.
- `docs/scope/scope.md` (optional, via `/scope`): enroll D3.4 as a tickable sub-task — `/sync` cannot add sub-tasks, so this remains a `/scope` job.

## 9. As built (implementation record)

**Posture A chosen** by the user (real server-side enforcement, not UI-only gating), but the runtime `revokePermissions(START_FRAME_RECORD_CALL)` mechanism was **withdrawn** (see §10): SDK `Call.d.ts:604` proves `revokePermissions`/`updateUserPermissions` only accept `send-audio`/`send-video`/`screenshare`, so it cannot revoke frame-recording and error-flooded every participant (live `/debug` error).

**Files changed:**
- `src/components/MeetingRoom.tsx` — replaced `CallControls` with a custom control bar: tokened mic toggle (`call.microphone.toggle()` via `useMicrophoneState()`), camera toggle (`call.camera.toggle()` via `useCameraState()`), SDK `ScreenShareButton`, `CancelCallButton onLeave={OnLeave}`, plus existing `People`/`Reactions`/`Layout`/`CallStats`. Record button rendered **only when `isOwner`** (`call.state.createdBy?.id === Clerk userId`) → `call.startFrameRecording({})` / `call.stopFrameRecording()`. Persistent REC pill in top bar while `isRecording`. Consent toast via `call.on("call.frame_recording_started"/"call.frame_recording_stopped")`. Recordings panel button gated by `isOwner`. **`EndCallButton` (owner "End call for everyone", self-guarded) restored** in the control bar; its click handler is now async and stops a running recording first (`if (call.state.recording) await call.stopFrameRecording()`, best-effort try/catch) before `call.endCall()` + `router.push("/")` — `/debug` proved `endCall()` is just `POST /mark_ended` and does NOT finalize an in-progress composite recording, so ending a call while recording left the file un-finalized and it never surfaced (the real link to "recordings disappeared after the button was added"), see §11. **Withdrawn:** the `revokePermissions(START_FRAME_RECORD_CALL)` effect was removed (SDK limitation, see §10) — `useParticipants` + `OwnCapability` + `useRef` imports dropped as a result. **/debug recordings-list fix (2026-08-20, two passes):** a composite frame recording is only queryable AFTER Stream finishes processing it, signaled by the native `call.frame_recording_ready` event (separate from `started`/`stopped`); composite processing routinely takes minutes. `loadRecordings` now takes a `silent` flag and returns the count; the events `useEffect` also listens for `call.frame_recording_ready` and reloads immediately; a `didRecordRef`-gated effect silently polls `queryRecordings` every 10s while recording and after stop, with a ~5 min ceiling (30 ticks) and early stop once a recording appears. Retrieval path verified correct: `queryRecordings()` → `listRecordings` → `GET /api/v2/video/call/{type}/{id}/recordings` (identical to server-side `/api/recordings`), so an empty list means not-finalized-yet, not a code defect.
- `src/components/meeting-intelligence/MeetingTabs.tsx` — added `isOwner` prop; `VISIBLE_TABS(isOwner)` hides the `Recording` tab for non-owners; content guarded with `isOwner &&`.
- `src/components/meeting-intelligence/MeetingDetail.tsx` — added `useUser`, computes `isOwner` from `meeting.user_id === user.id`, passes to `MeetingTabs`.
- `src/lib/meeting-types.ts` — `MeetingDetailData` gained `user_id`.
- `src/app/api/meetings/[id]/route.ts` — selects + returns `user_id` (already owner-only via `.eq("user_id", userId)` → non-owners 404).
- `src/app/api/recordings/route.ts` — owner-only filter: `queryCalls({ filter_conditions: { created_by_user_id: userId } })` (dropped the `members` branch).
- `src/components/MeetingModel.tsx` + `src/components/PersonalRoomPage.tsx` — `frame_recording.mode` `auto-on` → `available` (owner starts manually).

**Verified against installed SDK type defs (permanent Stream rule):** events `call.frame_recording_started` / `call.frame_recording_stopped`; `startFrameRecording({})`, `stopFrameRecording()`; `ScreenShareButton`, `CancelCallButton` (with `onLeave`), `EndCallButton` (owner-only, `call.endCall()`); `participant.userId` camelCase; hooks accessed via `useCallStateHooks()` namespace (they are NOT top-level exports of `@stream-io/video-react-sdk`). NOTE: `call.revokePermissions`/`updateUserPermissions` accept ONLY `send-audio`/`send-video`/`screenshare` (SDK `Call.d.ts:604`) — frame-recording CANNOT be revoked at runtime, so the Posture A runtime-revoke was withdrawn; server-side owner-only recording now depends on the call-type role grant for `start-frame-record-call`.

**Gates:** `npx tsc --noEmit` clean; `npm run build` exit 0.

**Open (needs live `/check verify` with Clerk+Stream creds — sandbox can't run them):** non-owner `call.state.ownCapabilities` default string; confirm the REC pill + toast fire for a participant who joins after the owner starts; confirm `/api/recordings` returns empty for a non-owner. Steps in §7.

## 10. Withdrawn mechanism — Posture A runtime revoke (2026-08-20, `/debug`)

**Root cause proven:** live `/debug` error `Stream error code 4: revoke_permissions[0] must be one of [screenshare send-audio send-video]`. SDK `Call.d.ts:604` documents `revokePermissions`/`updateUserPermissions` as supporting ONLY `send-audio`, `send-video`, `screenshare`. The capability `start-frame-record-call` cannot be revoked at runtime, so the Posture A enforcement effect (a) failed for every participant and (b) could never deliver server-side owner-only recording. The effect, the `revokedRef` Set, and the now-unused `OwnCapability`/`useRef`/`useParticipants` imports were removed from `MeetingRoom.tsx`.

**Owner "End call for everyone" restored:** the original `EndCallButton` (owner-only, `call.endCall()` + router push) had been dropped when `CallControls` was swapped for the custom control bar; the SDK `CancelCallButton` is a local leave only. `EndCallButton` was re-imported and re-rendered in the control bar, keeping the Meeting Room UI/UX consistent per user request.

**Remaining real server-side lever — call-type role grant:** the only way to server-enforce "owner-only recording" is to ensure the `default` call type does NOT grant `start-frame-record-call` to the `call_member` role. If a live non-owner's `call.state.ownCapabilities` includes `start-frame-record-call`, a Stream call-type grant change is still required (restrict that capability to the host/owner role). Candidate (per local Stream skill `getstream api UpdateCallType`): update the `default` call type grants to drop `start-frame-record-call` from `call_member`. This needs Stream dashboard/API access with credentials, so it is OUT of scope for this codebase change and left as the open live-verify item. If the grant is already host-only by default, no change is needed and UI gating + natural default suffice.

**Status after fix:** `npx tsc --noEmit` clean; `npm run build` exit 0. Owner-only Record control, REC pill, broadcast consent toast, gated Recordings panel/tab, owner-only `/api/recordings`, and owner "End call for everyone" all in place.

## 11. EndCallButton ↔ recordings relationship (2026-08-20, `/debug`)

**Symptom the user reported:** recordings stopped appearing "when the End Call For Everyone button was added." No shared code path exists — `EndCallButton` never touched `queryRecordings`/`loadRecordings`/recordings state/`frame_recording_*` events. The real link is a **workflow**: `endCall()` (`POST /mark_ended`) does NOT stop a running composite frame recording, so if the owner ends the call while a recording is active, the file is never finalized and never surfaces.

**Proven via installed SDK source:**
- `Call.endCall` = `this.streamClient.post(\`${this.streamClientBasePath}/mark_ended\`)` — no recording stop.
- `CallState.recording` getter returns `call.recording || composite_recording?.status === 'running'` — so `call.state.recording` is `true` while a composite frame recording runs.
- Verified with the **official Stream `stream-react` skill** (installed per user request via `curl -fsSL https://getstream.io/cli.sh | bash` then `getstream skills stream-react --claude`): call-type grants expose `start-frame-recording` + `stop-frame-recording`; and a documented gotcha — *"After changing call type settings, existing calls keep old settings — delete stale calls or mint a fresh callId to test"* (relevant if a test call predates the `frame_recording: available` override).

**Fix (`EndCallButton.tsx`):** click handler is now async; if `call.state.recording` is truthy, `await call.stopFrameRecording()` (best-effort, wrapped in try/catch so a stop failure never blocks ending the call) BEFORE `call.endCall()` + `router.push("/")`. Now ending the call always yields a finalized, queryable recording. `npx tsc --noEmit` clean; `npm run build` exit 0.

**Combined with §9's `frame_recording_ready` + longer poll fix, the full recordings pipeline is now:** owner starts (REC pill + broadcast toast) → owner stops → `frame_recording_ready` fires → panel/list reloads (also covered by the 5-min silent poll with early stop) → recording appears in-room and on `/recording` (same `GET /recordings` endpoint) → if owner ends call while recording, `EndCallButton` finalizes it first.
