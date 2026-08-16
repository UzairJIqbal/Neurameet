# Fix — Schedule Meeting entry point + denied-permission silent no-op

## Context (from `/review` of A3 + permission fixes)

Two issues were confirmed against the code:

1. **Schedule Meeting is unreachable.** The Dashboard quick actions
   (`src/components/DashboardContent.tsx:110-139`) expose only New Meeting,
   Join Meeting, Upload Transcript, Ask AI. The component that *does* include a
   Schedule Meeting card (`HomeCard` → `MeetingTypeLists`, fed by
   `meetingCardDetails` in `constants/index.tsx:160-165`) is **orphaned** — it
   is never imported or rendered anywhere, so the schedule modal
   (`MeetingModel.tsx`, handles `isScheduleMeeting`) has no UI trigger. A user
   cannot schedule a meeting in the running app, which also blocks A3 reminder
   verification end to end.
2. **Silent no-op when notifications already denied.** `SettingsPage.tsx`
   `requestReminderPermission()` (lines 105-122) only calls
   `Notification.requestPermission()` when `Notification.permission === "default"`.
   If the browser already **denied** notifications for the origin, toggling
   Desktop reminders ON does nothing and shows no feedback — the user is left
   thinking it does nothing and reminders silently never fire.

Scope of this fix: issues 1 and 2 only. Issue 3 (the orphaned `HomeCard` /
`MeetingTypeLists` dead code and the Dashboard card-set inconsistency) is
**deferred to A4/A5**, which already scopes dead-control cleanup.

## Decision on issue 1 — add to DashboardContent quick actions

Wire Schedule Meeting as a 5th quick action on the Dashboard (the main
authenticated landing), reusing the existing modal infrastructure. Rationale:

- **Minimal, single-file change.** `DashboardContent` already supports
  `isScheduleMeeting` in its `meetingModalType` union (line 66) and already
  renders `<MeetingModel type={meetingModalType} />` whenever that state is set
  (lines 299-304). So `onClick: () => setMeetingModalType("isScheduleMeeting")`
  opens the fully-built schedule modal with zero new infrastructure.
- **Single source of truth for meeting actions.** The Dashboard is where users
  already go for New/Join/Upload/Ask AI. Adding Schedule here makes it the
  canonical entry point instead of reviving a second, divergent card system
  (`HomeCard`/`MeetingTypeLists`).
- **Avoids duplicating a dead surface.** "Fixing" `MeetingTypeLists` to render
  would create a parallel card set (Instant/Join/Recordings/Schedule/Upload)
  that must be kept in sync with the Dashboard — more surface, more drift.
  Leaving its eventual removal to A4/A5 (as already scoped) is cleaner.

Known minor cosmetic note: the quick-action grid is `lg:grid-cols-4`, so the
5th card wraps to its own row on large screens. Acceptable; not changing grid
classes (keep the edit minimal). Call it out if you want `lg:grid-cols-5`
instead.

This also makes A3 verifiable: scheduling a meeting ~1-2 min out creates an
Upcoming Stream call that `ReminderManager` polls via `useGetCall`.

## Files

- **Edit:** `src/components/DashboardContent.tsx` — add Schedule Meeting quick
  action.
- **Edit:** `src/components/SettingsPage.tsx` — handle the `denied` permission
  state with a clear toast.
- **Not touched:** `HomeCard.tsx`, `MeetingTypeLists.tsx`, `constants/index.tsx`
  (the orphaned Schedule card stays until A4/A5), `ReminderManager.tsx`,
  `MeetingModel.tsx` (already correct).

## Implementation

### 1. DashboardContent.tsx — Schedule Meeting quick action

In the `quickActions` array (after the "Ask AI" entry, ~line 138), add:

```tsx
{
  title: "Schedule Meeting",
  subtitle: "Plan a meeting",
  icon: <CalendarDays className="h-6 w-6" />,
  iconWrap: "bg-tertiary-container/30 text-tertiary",
  onClick: () => setMeetingModalType("isScheduleMeeting"),
},
```

`CalendarDays` is already imported (line 13); `tertiary` / `tertiary-container`
tokens are already used (line 89). No new import needed. `setMeetingModalType`
already accepts `"isScheduleMeeting"` (line 66), and the existing
`{meetingModalType && <MeetingModel ... />}` block renders the schedule modal.

### 2. SettingsPage.tsx — denied-permission feedback

Replace `requestReminderPermission` (lines 105-122) so the `denied` state is
handled explicitly:

```tsx
// Requests Notification permission on the user's toggle gesture. The pref is
// always written regardless (intent is kept even if unsupported/denied);
// ReminderManager stays silent until permission is granted.
const requestReminderPermission = async () => {
  if (typeof Notification === "undefined") {
    toast.error("Desktop notifications aren't supported in this browser.");
    return;
  }
  if (Notification.permission === "denied") {
    toast.error(
      "Notifications are blocked for this site. Enable them in your browser's site settings (click the icon in the address bar) to get reminders.",
    );
    return;
  }
  if (Notification.permission === "default") {
    try {
      const res = await Notification.requestPermission();
      if (res === "denied") {
        toast.error(
          "Notifications are blocked for this site. Enable them in your browser's site settings (click the icon in the address bar) to get reminders.",
        );
      } else if (res !== "granted") {
        toast(
          "Reminders need notification permission — enable it in your browser settings.",
        );
      }
    } catch {
      toast("Couldn't request notification permission.");
    }
  }
  // Already "granted" → nothing extra; reminders start immediately.
};
```

Behavior after fix:
- `default` → prompt appears; grant → reminders on; block → same blocked toast.
- `denied` (previously blocked) → immediate clear toast, no silent no-op.
- `granted` → no prompt, reminders on (unchanged).
- unsupported → error toast (unchanged).

## Verification

1. `npx tsc --noEmit` — types clean (strict, no `any`).
2. `npx next build` — exit 0 (lint is skipped by build in this sandbox).
3. **Issue 1 manual:** sign in → Dashboard → confirm a "Schedule Meeting" card
   is present among the quick actions → click it → the schedule modal opens →
   set a time ~1-2 min out → confirm it creates an Upcoming meeting.
4. **Issue 2 manual:** in browser site settings, set Notifications to "Block"
   for localhost → return to app → Settings → toggle Desktop reminders ON →
   confirm the blocked toast appears (no silent no-op). Then reset the site
   permission to "Ask" (default) → toggle ON again → confirm the browser
   prompt appears.
5. **A3 end-to-end (now possible):** with permission granted and a meeting
   scheduled ~1-2 min out, wait for the 30s poll and confirm exactly one
   reminder notification fires (dedup), then toggling OFF clears it.

## Explicitly out of scope (deferred to A4/A5)

- Removing the orphaned `HomeCard` / `MeetingTypeLists` and the duplicate
  Schedule entry in `constants/index.tsx` `meetingCardDetails`.
- Any Dashboard card-set consolidation beyond adding the one quick action.
- MeetingSetup permission-denied runtime fixes (already implemented, separate).

## After close

- Update `context/progress-tracker.md` and `context/ui-registry.md` per
  AGENTS.md (note Schedule Meeting now reachable from Dashboard; denied
  permission now gives feedback).
- Commit per close (this fix is one logical change; one commit is fine).
