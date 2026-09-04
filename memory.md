# Memory — G3 Guest Admission Mode Workflow Fix

Last updated: 2026-09-04

## What was built

Fixed the G3 guest admission mode workflow. The toggle ("Anyone can join" / "Approval required") was originally only in `OverviewTab.tsx` (post-meeting Meeting Intelligence tab), forcing the owner to end a call, navigate to Meeting Intelligence, toggle, then navigate back — a broken real-world workflow. Fixed by threading `guestAdmissionMode` through ALL four pre-join creation paths:

- **`src/components/MeetingModel.tsx`** — Added `guestAdmissionMode` state + toggle UI in both `isInstantMeeting` and `isScheduleMeeting` modal views. Passes `guestAdmissionMode` to `createScheduledMeetingRow`.
- **`src/components/DeviceSetup.tsx`** — Added optional `guestAdmissionMode` prop + toggle section between device controls and Join Meeting button.
- **`src/components/MeetingSetup.tsx`** — Added `guestAdmissionMode` state, passes it to `<DeviceSetup>`.
- **`src/components/PersonalRoomPage.tsx`** — Added `guestAdmissionMode` state. Persists mode via `createScheduledMeetingRow` from `@/actions/meetings`.
- **`src/actions/meetings.ts`** — `createScheduledMeetingRow` accepts optional `guestAdmissionMode` param (added earlier in this session).
- **`src/app/api/attendance/event/route.ts`** — Lazy-created meeting rows default to `"approval"`.
- **`src/components/PersonalRoomPage.test.tsx`** — Added `vi.mock("@/actions/meetings", ...)` to fix server-only import crash.

## Decisions made

- **Use `createScheduledMeetingRow` for PersonalRoomPage** instead of direct Supabase dynamic import — matches MeetingModel.tsx pattern, avoids `server-only` module error in tests.
- **Mock `@/actions/meetings` in PersonalRoomPage.test.tsx** — `server-only` import caused "This module cannot be imported from a Client Component module" crash.
- **Lazy attendance-event path** keeps `"approval"` default since it cannot know the owner's preference at join time.

## Problems solved

- **G3 workflow broken**: toggle was post-meeting only → moved to pre-join flow across all four creation paths.
- **`PersonalRoomPage.tsx` TypeScript error**: `const { supabase: supabaseLazy } = await import("@/lib/supabase-server")` failed because `supabaseServer` is a named export, not a property on the module namespace. Fixed by importing `createScheduledMeetingRow` from `@/actions/meetings`.
- **Test suite crash**: Adding `@/actions/meetings` import to `PersonalRoomPage.tsx` caused server-only crash in tests. Fixed with `vi.mock`.

## Step G4 completed (2026-09-04)

Fixed guest attribution in attendance/transcript pipeline. Root cause: `useAttendanceTracking` used Clerk`s `useUser()` which returns `null` for guests, so `localIdentity` was always `null` and `post()` returned early — guests never got attendance events recorded.

**Changes:**
- `src/hooks/useAttendanceTracking.ts` — Added optional `identityOverride` parameter; when `user` is null and override provided, builds `localIdentity` from `localParticipant?.userId` + override name/email
- `src/components/MeetingRoom.tsx` — Added `guestName`/`guestEmail` props, moved `useLocalParticipant` into `useCallStateHooks` destructuring, passes override to `useAttendanceTracking`
- `src/components/GuestStreamClientProvider.tsx` — Added `guestEmail` prop, threaded into `connectUser()` and dependency array
- `src/app/(root)/meeting/[id]/guest/page.tsx` — Threaded `guestEmail` from NameModal through `GuestStreamClientProvider` → `GuestCallFlow` → `MeetingRoom`
- `src/components/MeetingRoom.test.tsx` — Added `useLocalParticipant` to mock

Verified: `npx tsc --noEmit` clean, `npx vitest run` 175/175 green, `npm run build` exit 0.

## Current state

- **Verification**: `npx tsc --noEmit` clean, `npx vitest run` 175/175 green, `npx next build` exit 0 — all verified.
- **G3 code complete** across all four pre-join creation paths.
- **`src/components/PersonalRoomPage.test.tsx`** — newly untracked file, added `vi.mock` for `@/actions/meetings`.
- **`context/progress-tracker.md`** — G3 entry updated to reflect pre-join workflow fix.
- **`memory.md`** — this file.

## Next session starts with

1. **Live browser walk-through** (user's responsibility — needs Clerk + Stream credentials):
   - Verify guest admission toggle works in all four pre-join paths
   - Owner toggles "Anyone can join" → guest `request-join` returns `waiting: false` → phase jumps to `"admitted"` immediately
   - Owner toggles "Approval required" → guest sees "Waiting for the host" → owner gets Accept/Deny toast → Accept → guest joins
   - Check `guest_admission_mode` column exists in live Supabase DB
2. **Step G4** — Attendance + transcript compatibility for guests
3. **Other pending work**: Product Final Polishing steps (P0–P11), G1.5 live verification

## Open questions

- Whether `guest_admission_mode` column migration in `supabase/schema.sql` has been applied to the live Supabase DB.
- Live browser walk-through of the G3 pre-join toggle has NOT been completed.
- G4 (guest attendance/transcript compatibility) not yet started.

## Key files for continuation

- `src/components/MeetingModel.tsx` — Instant + Schedule meeting modals with admission toggle
- `src/components/DeviceSetup.tsx` — Pre-join device setup with admission toggle
- `src/components/MeetingSetup.tsx` — Signed-in device setup wrapper passing admission mode
- `src/components/PersonalRoomPage.tsx` — Personal room with admission mode persistence
- `src/actions/meetings.ts` — `createScheduledMeetingRow` with `guestAdmissionMode` param
- `src/app/api/attendance/event/route.ts` — Lazy meeting rows default to "approval"
- `context/progress-tracker.md` — Full project progress
- `AGENTS.md` — Project instructions, zero-cost rules, data model, API contracts
