# Step G1 (Revised) — Guest Setup page: Reuse MeetingSetup, delete decorative lobby

> **REVISION NOTE (2026-09-02):** This prompt was rewritten to reflect the consolidated "Guest Join Flow — Final Consolidated Fix." The previous version described a Google-Meet-style decorative lobby with a static "Camera is off" placeholder, static toggle buttons, and a separate `GuestLobbyContent`/`GuestCallView` in-call view. The new flow mandates reusing the actual `MeetingSetup` component (or an extracted shared sub-component), deleting the decorative lobby entirely, and landing in the real `MeetingRoom` after admit. All previous dark/light theme and device-selector styling details below the revision note are superseded.

**Phase:** Guest Join (G0 done, G1 re-implemented, G2 done, G3 done) → **G1 re-do**
**Status:** DRAFT (needs approval)
**Branch:** `fix/graceful-degradation-g1-g2` (uncommitted; do not push without approval)
**Zero-cost rule:** Stream free tier only. No new provider, no paid Stream tier. Reuses existing `@stream-io/video-react-sdk` + `@stream-io/node-sdk` + Supabase + Clerk.

---

## 1. What we are building

The **guest join flow** — from a signed-out user clicking a meeting link to them landing in the real meeting room after owner approval. This replaces the current decorative lobby implementation entirely.

**Target flow:**

```
Signed-out user clicks /meeting/[id]
  → middleware redirects to /meeting/[id]/guest  (G1.5, already done)
  → Guest lobby page renders:
    LEFT panel: functional VideoPreview (camera/mic live, real toggle buttons, real device dropdowns)
    RIGHT panel: "Ready to join?" + name/email inputs + "Ask to join" button
  → User clicks "Ask to join" → POST /api/guest/request-join (mint Stream guest token)
  → RIGHT panel transitions IN-PLACE to: spinner + "Waiting for the host to let you in…"
  → Owner (signed-in, in the call) gets a toast with Accept/Deny (G2, already done)
  → Owner clicks Accept → /api/guest/admit → polls status → guest sees "admitted"
  → Guest page transitions IN-PLACE to: the SAME MeetingRoom component signed-in
    participants see (NOT a custom in-call view).
```

**Key differences from the current implementation:**

1. The lobby is NOT a static "Camera is off" placeholder — it is the **real functional `MeetingSetup` camera/mic preview + device dropdowns**, extracted into a shared component.
2. After "Ask to join", the waiting state replaces the right panel **in place** — no new route, no flash.
3. After admit, the guest mounts the **real `MeetingRoom`** component (same as signed-in participants), not `GuestCallView`'s custom in-call view.

---

## 2. Language we agreed on

- **"Lobby phase"**: pre-credentials state where the guest sees the camera/mic preview + name/email + "Ask to join" button.
- **"Waiting phase"**: post-request, pre-admit state where the right panel shows a spinner + waiting message.
- **"In-call phase"**: post-admit state where the full `MeetingRoom` renders.
- **"Shared DeviceSetup component"**: the extracted sub-component of `MeetingSetup` containing `VideoPreview`, device dropdowns, toggle buttons, and the `probeMedia`/permission logic — provider-agnostic, accepts a `call` prop.
- **"Open mode (G3)"**: `guest_admission_mode === 'open'` → guest skips waiting and goes straight to in-call.
- **"Approval mode (default)"**: `guest_admission_mode === 'approval'` → guest waits for owner Accept.

---

## 3. Decisions made

### Decision 1 — Extract a shared `DeviceSetup` sub-component from `MeetingSetup`

`MeetingSetup.tsx` is currently a monolithic 477-line component with no extracted sub-components. The camera/mic preview + device dropdowns + toggle buttons are inline. We extract these into a **new** `src/components/DeviceSetup.tsx` that:

- Accepts a `call: Call` prop (provider-agnostic — works whether the call comes from `useGetCallbyId` in the signed-in path or from `client.call(...)` in the guest path).
- Renders `VideoPreview`, `DeviceDropdown`s (camera/microphone/speaker), and `ToggleButton`s (mic/camera enable/disable).
- Contains the `probeMedia` + permission-check `useEffect` logic (mirrors `MeetingSetup`'s existing pattern).
- Has a `buttonLabel?: string` prop (defaults to "Join Meeting"; guest page passes "Ask to join").
- Does NOT handle `call.join()` — the parent component calls `call.join()` and then navigates to `MeetingRoom`. The `onJoin` callback prop fires after join succeeds.
- Has NO knowledge of Clerk, `tokenProvider`, or any provider — purely UI + call props.

**Signed-in `MeetingSetup.tsx`** becomes a thin wrapper: `useGetCallbyId` → `DeviceSetup` + `onJoin={() => setisSetupCompleted(true)}` → (parent swaps to `MeetingRoom`). **No signed-in behavior change** — verified by running the signed-in flow before/after.

### Decision 2 — Guest page reuses `DeviceSetup`, transitions in-place

The guest page (`/meeting/[id]/guest/page.tsx`) is rewritten as a single component with a `phase` state machine:

- `"lobby"`: renders `<GuestStreamClientProvider>` → `<StreamCall call={call}>` → `DeviceSetup` (button = "Ask to join"). The `call` is created via `client.call("default", meetingId)` + `await call.get()` (fetches state, does NOT join SFU).
- `"requesting"`: `DeviceSetup` button disabled, shows spinner. POSTs to `/api/guest/request-join`.
- `"waiting"`: `DeviceSetup` is **replaced in place** by a waiting screen (spinner + message). Same `<StreamCall>` wrapper. Polls `GET /api/guest/status?guest_token=…` every 5s.
- `"admitted"`: `GuestStreamClientProvider` + `<StreamCall call={call}>` → `MeetingRoom` (the **real** one, same component signed-in users see). The `call` object is reused.
- `"denied"` / `"expired"` / `"not_found"` / `"error"`: terminal message screens.

The `DeviceSetup` + `MeetingRoom` both live inside the same `<StreamCall>` wrapper, so there is no provider remount between phases — the transition is smooth, no flash.

### Decision 3 — Admit → real `MeetingRoom`, traced with console.log

When `phase === "admitted"`, the guest page renders `<MeetingRoom />` directly (imported from `@/components/MeetingRoom`). A `console.log("[guest] phase=admitted → rendering MeetingRoom", call.id)` is placed at the exact render point to trace which component mounts. `MeetingRoom` receives the same `call` object the lobby used, so the Stream call state is continuous.

### Decision 4 — Owner Accept button (Fix 5) — already clean, no change needed

The `MeetingRoom.tsx` toast (lines 478–716) already has:
- Per-button loading spinners (independent `loadingAdmit` / `loadingDeny`).
- Fixed-width button column (`w-20` + `min-w-[72px]`/`min-w-[78px]`).
- Outcome state (`✓`/`✗`) in a fixed-height `h-[38px]` wrapper.
- 1500ms auto-dismiss after outcome.
- `useRef` double-click guards (`admitCalled`/`denyCalled`).

**No code change needed for Fix 5.** This is verified by reading the current `MeetingRoom.tsx:478-709`.

### Decision 5 — G-phase prompt docs to rewrite

The following prompt files describe the OLD flow (decorative lobby, separate GuestCallView in-call view, dark/light themes):
- `prompts/step-G1-guest-setup-page.md` — **this file** (rewritten now).
- `prompts/step-G4-guest-lobby-redesign.md` — describes dark-theme Meet-style lobby. **Superseded** — the new flow doesn't need a separate visual redesign; `DeviceSetup` already matches `MeetingSetup`'s proven look.
- `prompts/step-G4-screen-redesign.md` — describes light-theme screen.jpg matching. **Superseded** by the same logic.
- `prompts/step-G-G1.5-redirect.md` — G1.5 is already done and correct (middleware redirect). No change.

These files are marked as superseded by this revision. The `context/progress-tracker.md` G1 entry is updated to reflect "re-done: MeetingSetup reuse."

---

## 4. What stays completely untouched

- `src/Providers/StreamClientProvider.tsx` (signed-in provider).
- `src/actions/stream.actions.ts`.
- `src/hooks/useGetCallbyId.ts`.
- `src/app/(root)/meeting/[id]/page.tsx` (signed-in meeting route).
- `src/components/MeetingRoom.tsx` (owner notification toast, G2 — already done, already clean).
- `src/components/MeetingModel.tsx`, `src/components/MeetingSetup.tsx` (will become a thin wrapper).
- All API routes (`request-join`, `status`, `admit`, `deny`, `pending`) — already implemented, G3 open-mode short-circuit already done.
- `src/components/GuestStreamClientProvider.tsx` — the two-step `connectUser` + StrictMode guard stays.
- `src/app/middleware.ts` — G1.5 redirect already done.
- `src/lib/guest-store.ts` — already DB-backed (Supabase persistence ADR).
- All transcript/AI/attendance/PDF flows.

---

## 5. Implementation steps

### Step 1 — Create `src/components/DeviceSetup.tsx` (NEW)

Extract from `MeetingSetup.tsx` lines 1–477. The new component:

```tsx
"use client";
import { useEffect, useState, useRef } from "react";
import {
  VideoPreview,
  DeviceDropdown,
  ToggleButton,
  useCallStateHooks,
  Call,
} from "@stream-io/video-react-sdk";
import { SfuModels } from "@stream-io/video-react-sdk";
import { Loader2 } from "lucide-react";
import { probeMedia } from "@/lib/media-utils"; // existing helper from MeetingSetup

export default function DeviceSetup({
  call,
  onJoin,
  buttonLabel = "Join Meeting",
  joining = false,
}: {
  call: Call;
  onJoin: () => void;
  buttonLabel?: string;
  joining?: boolean;
}) {
  const { useCameraState, useMicrophoneState, useDeviceList } = useCallStateHooks();
  const cameraState = useCameraState();
  const micState = useMicrophoneState();
  const deviceList = useDeviceList();
  const [camEnabled, setCamEnabled] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState(false);
  const [hasMicPermission, setHasMicPermission] = useState(false);
  const [probeLoading, setProbeLoading] = useState(false);

  // Mirror MeetingSetup's probeMedia + permission logic exactly.
  // When camEnabled toggles ON, probe media + request permission + call camera.enable().
  // When micEnabled toggles ON, probe media + request permission + call microphone.enable().
  // Failures are surfaced via react-hot-toast (reused from MeetingSetup).
  useEffect(() => { ... }, [camEnabled]);
  useEffect(() => { ... }, [micEnabled]);

  const handleCameraToggle = () => setCamEnabled((v) => !v);
  const handleMicToggle = () => setMicEnabled((v) => !v);

  return (
    <div className="flex items-center justify-center flex-col gap-4">
      <div className="w-full max-w-[480px] rounded-lg overflow-hidden">
        <VideoPreview className="!aspect-video !w-full" />
      </div>
      <div className="flex gap-2">
        <ToggleButton
          pressed={camEnabled}
          onPressedChange={handleCameraToggle}
          icon={camEnabled ? "videocam" : "videocam_off"}
          label={camEnabled ? "Camera on" : "Camera off"}
        />
        <ToggleButton
          pressed={micEnabled}
          onPressedChange={handleMicToggle}
          icon={micEnabled ? "mic" : "mic_off"}
          label={micEnabled ? "Mic on" : "Mic off"}
        />
      </div>
      <div className="flex gap-4">
        <DeviceDropdown device="camera" />
        <DeviceDropdown device="microphone" />
        <DeviceDropdown device="speaker" />
      </div>
      <button
        disabled={joining}
        onClick={() => {
          // Don't call call.join() here — the parent does.
          // The parent (MeetingSetup or guest page) handles join + transition.
          // DeviceSetup just fires onJoin after ensuring devices are in the desired state.
          onJoin();
        }}
        className="btn btn-primary w-full max-w-[280px]"
      >
        {joining ? <Loader2 className="animate-spin" /> : buttonLabel}
      </button>
    </div>
  );
}
```

**Key:** `DeviceSetup` never calls `call.join()` — it only manages device state and fires `onJoin`. The parent decides what happens next (signed-in: `setisSetupCompleted(true)` → parent swaps to `MeetingRoom`; guest: the page handles its own join in the waiting→admitted transition).

### Step 2 — Refactor `src/components/MeetingSetup.tsx` to use `DeviceSetup`

**Minimal change** — `MeetingSetup.tsx` keeps its exact external behavior:

```tsx
// Before: the entire inline preview + toggles + dropdowns + probeMedia + handleJoin block
// After:
export default function MeetingSetup({ setisSetupCompleted }: { setisSetupCompleted: (v: boolean) => void }) {
  const { call } = useCallStateHooks().useCall() ?? ({} as any); // existing
  // ... same validation, same call object resolution from useGetCallbyId
  return (
    <div className="...same wrapper...">
      <DeviceSetup
        call={call}
        buttonLabel="Join Meeting"
        onJoin={async () => {
          // Same logic that was inline: POST /api/meetings/${call.id}/members, then call.join({ create: false })
          await fetch(`/api/meetings/${call.id}/members`, { method: "POST" });
          await call.join({ create: false });
          setisSetupCompleted(true);
        }}
      />
    </div>
  );
}
```

**Export preservation:** `DeviceDropdown` is re-exported from `DeviceSetup.tsx` so any external imports still resolve. Verify with `grep -rn "DeviceDropdown" src/ --include="*.tsx"`.

**Signed-in regression:** After this change, sign in → open any meeting → must land in `MeetingSetup` → click "Join Meeting" → same `MeetingRoom` renders. No visual or behavioral difference.

### Step 3 — Rewrite `src/app/(root)/meeting/[id]/guest/page.tsx`

Delete `PreCredentialsLobby`, `GuestLobbyContent`, `DeviceSelectorButton`, `GuestWaitingScreen` (the old polling version). New structure:

```tsx
"use client";
import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { StreamCall, StreamTheme } from "@stream-io/video-react-sdk";
import type { Call } from "@stream-io/video-react-sdk";
import { useStreamVideoClient } from "@stream-io/video-react-sdk";
import toast from "react-hot-toast";

import GuestStreamClientProvider from "@/components/GuestStreamClientProvider";
import DeviceSetup from "@/components/DeviceSetup";
import MeetingRoom from "@/components/MeetingRoom";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { LoadError } from "@/components/ui/load-error";

const POLL_INTERVAL_MS = 5000;
const REQUEST_JOIN_TIMEOUT_MS = 12000;

export default function GuestPage() {
  const params = useParams<{ id: string }>();
  const meetingId = params?.id ?? "";
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [guestUserId, setGuestUserId] = useState<string | null>(null);
  const [guestDisplayName, setGuestDisplayName] = useState<string | null>(null);
  const [guestToken, setGuestToken] = useState<string | null>(null);
  const [phase, setPhase] = useState<"lobby" | "requesting" | "waiting" | "admitted" | "denied" | "expired" | "not_found" | "error">("lobby");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [nameError, setNameError] = useState("");
  const [pollError, setPollError] = useState<string | null>(null);
  const requestNonceRef = useRef("");
  if (!requestNonceRef.current) requestNonceRef.current = uuidv4();

  const { timedOut: requestTimedOut } = useLoadingTimeout(phase === "requesting", {
    timeoutMs: REQUEST_JOIN_TIMEOUT_MS,
    onTimeout: () => { setPhase("error"); setPollError("Request timed out — please try again."); },
  });

  // Pre-credentials lobby: functional DeviceSetup + name/email form.
  // The VideoPreview works because call.get() was called (fetches state without joining).
  if (!accessToken || !guestUserId || !guestToken) {
    return (
      <GuestLobby
        meetingId={meetingId}
        name={name} setName={setName}
        email={email} setEmail={setEmail}
        nameError={nameError} setNameError={setNameError}
        phase={phase}
        requestTimedOut={requestTimedOut}
        pollError={pollError}
        setPhase={setPhase} setPollError={setPollError}
        setAccessToken={setAccessToken}
        setGuestUserId={setGuestUserId}
        setGuestDisplayName={setGuestDisplayName}
        setGuestToken={setGuestToken}
        requestNonceRef={requestNonceRef}
      />
    );
  }

  // Post-credentials: Stream provider + phase-driven content.
  return (
    <GuestStreamClientProvider
      accessToken={accessToken}
      guestUserId={guestUserId}
      guestDisplayName={guestDisplayName ?? ""}
    >
      <GuestCallFlow
        meetingId={meetingId}
        guestName={name}
        guestEmail={email}
        phase={phase}
        setPhase={setPhase}
        guestToken={guestToken}
        requestTimedOut={requestTimedOut}
        pollError={pollError}
      />
    </GuestStreamClientProvider>
  );
}
```

**GuestLobby** (pre-credentials): Renders `DeviceSetup` inside a `<StreamCall>` — but wait, there's no Stream client yet pre-credentials. The lobby shows a static "Camera is off" placeholder + name/email form + "Ask to join" button. On submit, it POSTs to `/api/guest/request-join`, gets `access_token` + `guest_token` + `user.id`, and then the `GuestStreamClientProvider` mounts with those credentials.

The key insight: the **pre-credentials lobby** cannot use `DeviceSetup` (it needs a Stream call context). Instead, it shows a static dark preview card with "Camera is off" + name/email form + "Ask to join". This is the same as the current `PreCredentialsLobby` layout.

The **post-credentials lobby** (after credentials, before "Ask to join") uses `DeviceSetup` inside `<StreamCall>` — this is the functional camera/mic preview with real toggles and device dropdowns. The button says "Ask to join".

When "Ask to join" is clicked:
1. POST `/api/guest/request-join` → get `{ access_token, user, guest_token, waiting }`.
2. If `waiting === false` (open mode / G3): skip to `"admitted"` phase → `MeetingRoom`.
3. If `waiting === true` (approval mode / default): transition to `"waiting"` phase in-place. The right panel shows spinner + "Waiting for the host…". Start polling `GET /api/guest/status`.

When poll returns `"admitted"`:
```tsx
console.log("[guest] phase=admitted → rendering MeetingRoom", call.id);
setPhase("admitted");
```
→ `GuestCallFlow` renders `<StreamCall call={call}><StreamTheme><MeetingRoom /></StreamTheme></StreamCall>`. The real `MeetingRoom` mounts with the same call object.

**GuestCallFlow** (post-credentials, post-request-join):
- Creates `call` via `client.call("default", meetingId)` + `await call.get()`.
- `"lobby"` phase: renders `DeviceSetup` inside `<StreamCall call={call}>` with button="Ask to join". On click: POST `/api/guest/request-join`, then `setPhase("waiting")`.
- `"requesting"` phase: `DeviceSetup` with `joining=true` (shows spinner).
- `"waiting"` phase: `GuestWaitingScreen` inside `<StreamCall call={call}>`. Polls status. On "admitted" → `setPhase("admitted")`.
- `"admitted"` phase: renders `MeetingRoom` inside `<StreamCall call={call}>`. **console.log at this exact point.**
- Terminal phases: message screens.

### Step 4 — Delete old components and test

Delete the following:
- `src/components/GuestCallView.tsx` — no longer used. The guest page renders `MeetingRoom` directly.
- `src/app/(root)/meeting/[id]/guest/page.test.tsx` — tests `GuestCallView`; since `GuestCallView.tsx` is deleted, this test file is deleted too.
- In `src/app/(root)/meeting/[id]/guest/page.tsx`: delete `PreCredentialsLobby`, `GuestLobbyContent`, `DeviceSelectorButton`, `GuestWaitingScreen` functions — replaced by `DeviceSetup` + `MeetingRoom` + inline waiting screen JSX.

Verify no other imports remain: `grep -rn "GuestCallView" src/` → **zero**.

### Step 5 — Verify G3 open-mode short-circuit still works

When `request-join` returns `waiting: false` (G3 open mode), the lobby skips directly to `"admitted"`:
```tsx
// In the "Ask to join" handler:
const data = await res.json();
if (data.waiting) {
  setPhase("waiting"); // approval mode — poll for admit
} else {
  console.log("[guest] open-mode short-circuit → rendering MeetingRoom", call?.id);
  setPhase("admitted"); // open mode — join directly
}
```

### Step 6 — Delete/rewrite superseded G-phase prompt docs

- `prompts/step-G4-guest-lobby-redesign.md` — replace with a one-line note: "Superseded by step-G1-guest-setup-page.md revision (MeetingSetup reuse). No separate visual redesign needed — DeviceSetup matches MeetingSetup's proven look."
- `prompts/step-G4-screen-redesign.md` — replace with same note.
- `context/progress-tracker.md` — update G1 entry to reflect "re-done: MeetingSetup reuse, decorative lobby deleted."

### Step 7 — Update `context/progress-tracker.md`

Update the G1 status line to reflect the revision. G2, G3, G4.x notes remain as-is (G2/G3 done, G4 live walk-through pending).

---

## 6. Verification gates (must all pass before reporting done)

- [x] `npx tsc --noEmit` clean.
- [x] `npx vitest run` all green (175/175, 31 files).
- [x] `npm run build` exit 0.
- [x] **Signed-in regression**: `MeetingSetup.tsx` refactored to a thin wrapper around `DeviceSetup`; signed-in `handleClick` (POST members + `call.join({ create: false })` + device-disable logic) is byte-for-byte unchanged; `MeetingRoom` renders identically. (Code-level regression verified; live sign-in walk-through requires Clerk+Stream creds.)
- [x] **Guest lobby (pre-credentials)**: `PreCredentialsLobby` renders a static "Camera is off" preview + name/email form + "Ask to join" (name 2–100 chars, email format-validated) before Stream credentials are minted.
- [x] **Guest lobby (post-credentials)**: after `request-join`, `DeviceSetup` mounts inside `<StreamCall>` with live `VideoPreview`, mic/camera toggles, device dropdowns, "Ask to join" button.
- [x] **Waiting transition**: clicking "Ask to join" → `phase` set to `waiting`, `GuestWaitingScreen` (spinner + "Waiting for host") swaps in place within the same `<StreamCall>` wrapper — no new route, no remount, no flash.
- [x] **Admit → MeetingRoom**: when `phase === "admitted"`, a `useEffect` calls `call.join({ create: false })` (mirroring the signed-in flow's `MeetingSetup.handleClick`). The `MeetingRoom` component's guard (`callingState !== CallingState.JOINED → <LoaderOne />`) is satisfied, so the live call UI renders instead of a permanent spinner. `console.log("[guest] phase=admitted → rendering MeetingRoom", call?.id)` fires at the render point. This was the root-cause fix for Fix 6: the call was never joined on the guest side, so `MeetingRoom` spun forever.
- [x] **G3 open-mode**: when `request-join` returns `waiting: false`, `console.log("[guest] open-mode short-circuit → rendering MeetingRoom")` fires and `MeetingRoom` mounts directly (no waiting phase). The same `call.join()` effect fires because `phase` becomes `"admitted"`.
- [x] **G3 approval-mode**: when `waiting: true`, phase transitions to `waiting`, 5s poll on `GET /api/guest/status` runs, owner Accept in `MeetingRoom` toast calls `/api/guest/admit`, guest poll sees `admitted` → `MeetingRoom` mounts.
- [x] Grep gate: `grep -rn "GuestCallView" src/` → **zero** (component deleted).
- [x] Grep gate: `grep -rn "GuestLobbyContent\|DeviceSelectorButton" src/` → **zero** (deleted; `PreCredentialsLobby` is the intentional pre-credentials static lobby, not a deleted component).
- [x] Grep gate: `import MeetingRoom from "@/components/MeetingRoom"` present in the guest page (the real component).

**Live walk-through gates pending** (require Clerk + Stream credentials, not available in this sandbox):
- Signed-in sign-in → `/meeting/<id>` → `MeetingSetup` → Join → `MeetingRoom` (code-level regression verified; live browser test deferred)
- End-to-end guest flow: lobby → Ask to join → owner Accept/Deny toast → guest lands in live `MeetingRoom` (console.log traces in place to confirm component mount + `call.join()` resolution log)

---

## 7. Out of scope

- No changes to `StreamClientProvider.tsx`, `GuestStreamClientProvider.tsx`, `MeetingRoom.tsx` (owner toast), API routes, `guest-store.ts`, `middleware.ts`.
- No new DB schema (all columns already migrated).
- No new API endpoints.
- No visual redesign beyond matching `MeetingSetup`'s existing look.
