# Step A3 — Make "Desktop reminders" Settings toggle functional

## Overview

The `desktopReminders` Settings toggle already exists (`SettingsPage.tsx`) and
persists to `localStorage` via `user-prefs.ts` (default `false`), but it gates
nothing. This step makes it functional: when ON, the app requests browser
Notification permission and surfaces an OS/browser notification at/near the
start of each scheduled (Upcoming) meeting, reusing the live Stream calls the
app already queries. When OFF, nothing is requested and no notifications fire.

Zero-cost only. No new provider, no backend, no paid API. Uses the browser
Web Notification API + the existing Stream `queryCalls` data path.

## Mechanism (decided in `/architect`)

**Browser Notification API + client-side periodic poll of Upcoming meetings.**
The alternative (a Stream call-start webhook) was rejected: it needs a server
endpoint + Stream dashboard config + signature verification, which violates the
A3 constraints ("pure client-side, no new provider, reuse existing Upcoming
data") and only fires when *someone starts the call*, not at the scheduled time.

A small client component mounted globally in the authenticated layout polls the
Upcoming calls every ~30s and fires a Notification when a meeting enters the
lead window. The source of truth for "enabled" is the `desktopReminders`
localStorage pref; the source of truth for "do we have permission" is
`Notification.permission`.

**Honest limitation (v1):** the Web Notification API only shows alerts while the
app tab is open. Service-worker push (closed-tab alerts) is a separate
enhancement and is explicitly out of scope.

## Files

- **New:** `src/components/ReminderManager.tsx` — "use client" engine.
- **Edit:** `src/app/(root)/layout.tsx` — mount `<ReminderManager />` as a child
  of `StreamVideoProvider` (so `useStreamVideoClient()` + `useUser()` resolve).
- **Edit:** `src/components/SettingsPage.tsx` — request Notification permission
  on the `desktopReminders` toggle gesture; toast if unsupported/denied.
- **Reuse (read-only):** `src/hooks/useGetCall.ts` (`upcomingCalls`),
  `src/lib/user-prefs.ts` (`readUserPrefs`, `PREFS_KEY`), `src/components/Loader.tsx`.

## Implementation

### 1. `ReminderManager.tsx` (new, "use client")

```
const REMINDER_INTERVAL_MS = 30_000;
const LEAD_MS = 2 * 60_000;        // fire up to 2 min before start
const GRACE_MS = 15 * 60_000;      // still fire if started up to 15 min ago
const REMINDED_KEY = "neurameet:reminded";   // sessionStorage, dedup set
```

- Guard for browser: no-op if `typeof window === "undefined"` or
  `typeof Notification === "undefined"`.
- Use `useGetCall()` for `upcomingCalls` (single source of truth, matches the
  Upcoming page). Use `useUser()` only to satisfy the hook's contract (it needs
  the client + user, both available inside the layout).
- A `useEffect` with `setInterval(REMINDER_INTERVAL_MS)`:
  1. Read `readUserPrefs().desktopReminders`. If **false**, clear the reminded
     set (`sessionStorage.removeItem(REMINDED_KEY)`) and return.
  2. If `Notification.permission !== "granted"`, return (permission requested at
     toggle gesture in SettingsPage; if denied, ReminderManager stays silent).
  3. Load the reminded set from `sessionStorage` (JSON array of `call.id`).
  4. For each `call` in `upcomingCalls`:
     - `start = new Date(call.state.startsAt).getTime()`.
     - `delta = start - Date.now()`.
     - Fire if `delta <= LEAD_MS && delta >= -GRACE_MS && !reminded.has(call.id)`.
     - On fire: `new Notification("NeuraMeet: meeting starting soon", { body:
       \`${call.state.custom?.description ?? "Your meeting"} — starts
       ${new Date(start).toLocaleTimeString()}\` })`. Set
       `notification.onclick = () => { window.focus();
       window.location.href = \`/meeting/${call.id}\`; }`. Add `call.id` to the
       reminded set and persist to `sessionStorage`.
- Renders `null` (pure side-effect component, no UI).
- Note (known limitation, acceptable for v1): `useGetCall` loads the call list
  once on mount; meetings created *later in the same tab session* won't be
  picked up until a remount/navigation. The primary reminder scenario (already-
  scheduled Upcoming meetings) works because they're in the list at mount and the
  per-tick `delta` check catches the lead window.

### 2. `(root)/layout.tsx` — mount it

```
import ReminderManager from "@/components/ReminderManager";

return (
  <StreamVideoProvider>
    <ReminderManager />
    {children}
  </StreamVideoProvider>
);
```

`StreamVideoProvider` already renders `<StreamVideo client={videoClient}>{children}</StreamVideo>`,
so `ReminderManager` is inside the client context (confirmed in source).

### 3. `SettingsPage.tsx` — permission on toggle

In the `setPref` handler (or specifically in the `desktopReminders` branch),
when switching **to `true`**:

- `import toast from "react-hot-toast";` (existing toast lib per AGENTS.md).
- If `typeof Notification === "undefined"` → `toast.error("Desktop notifications
  aren't supported in this browser.")` and still write the pref (intent kept).
- Else if `Notification.permission === "default"` →
  `const res = await Notification.requestPermission();`
  - if `res !== "granted"` → `toast("Reminders need notification permission —
    enable it in your browser settings.")` (keeps pref ON; ReminderManager stays
    silent until granted).
- Else if `Notification.permission === "granted"` → nothing extra (reminders
  start immediately).

Keep the existing `setPref` write so the pref persists regardless. Do NOT change
the other two toggles' behavior.

## Verification (per build-plan "share exact test steps")

1. `npm run tsc` — types clean (strict, no `any`).
2. `npm run build` — exit 0.
3. **Manual — toggle ON:** sign in → Settings → flip "Desktop reminders" ON →
   grant permission in the browser prompt. Confirm a `toast` does not error and
   `Notification.permission` becomes `"granted"`.
4. **Manual — receive a reminder:** create/schedule an Upcoming meeting with a
   start time ~1–2 min out (or temporarily set `LEAD_MS` large / use an existing
   Upcoming call). Wait for the 30s poll. Confirm an OS/browser notification
   appears once, with the meeting title + time, and clicking it focuses the tab
   and navigates to `/meeting/[id]`. Confirm it does NOT fire again for the same
   meeting (dedup).
5. **Manual — toggle OFF:** flip "Desktop reminders" OFF. Confirm no further
   notifications fire and the reminded set is cleared (a re-toggled meeting can
   remind again).
6. **Manual — denied permission:** flip ON, choose "Block" in the browser.
   Confirm the warning `toast` and no notification fires; pref remains ON.

## Out of scope / not changed

- No service-worker push, no closed-tab alerts.
- No server/webhook, no Stream call-start event wiring.
- No other Settings toggles touched.
- No DB schema change (prefs stay client-side localStorage).
- `progress-tracker.md` / `ui-registry.md` updated after the step closes.
