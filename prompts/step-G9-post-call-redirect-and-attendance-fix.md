# Step G9: Post-Call Redirect and Guest Attendance Fixes

## Context & Problem Statement
During G9 live verification:
1. **Infinite Loader on Call End:** When the host ends the call for everyone, both the host and the guest are stuck indefinitely on `<LoaderOne />` instead of being redirected to `/after-meeting/[id]`.
   - In `MeetingRoom.tsx`, `callingState !== CallingState.JOINED` unconditionally renders `<LoaderOne />`.
   - When the call ends, Stream SDK switches `callingState` to `CallingState.LEFT`.
   - The redirect was attached only to `call.on("call.ended")` which guarded with `if (!call.id) return;`. When Stream disposes/detaches event handlers or leaves the call, `call.id` can be undefined or the event may not trigger before `callingState` switches to `LEFT`.
   - `MeetingRoom` had no redirect handler on `callingState === CallingState.LEFT`, nor did it use the dynamic route param (`useParams().id`) as a reliable fallback.
2. **Participant Count Stays at 1:** The after-meeting recap page only displays 1 participant even with 2 people present.
   - In `src/hooks/useAttendanceTracking.ts`, the `post` callback had `if (!c || !identity.userId) return;`.
   - Guests have no Clerk account, so `identity.userId` is `""` (empty string). As a result, every attendance event (`join`, `leave`, mic/camera toggles) for guests was dropped on the client and never sent to `/api/attendance/event`.
   - In `/api/attendance/event/route.ts`, `user_id` should be stored as `null` when empty.

## Proposed Changes

### 1. `src/components/MeetingRoom.tsx`
- Import `useParams` from `next/navigation`.
- Read `routeMeetingId = params?.id as string`.
- Define `targetMeetingId = call?.id || routeMeetingId`.
- Add route param fallback to the existing `call.on("call.ended")` listener so missing `call.id` does not abort redirect.
- Add an effect monitoring `callingState`:
  - Track `hasJoinedRef.current = true` once `callingState === CallingState.JOINED`.
  - When `callingState === CallingState.LEFT` and `hasJoinedRef.current` is true, trigger the post-call redirect to `targetMeetingId` immediately if not already navigated (`recapNavigated.current`).
  - Use `router.replace(`/after-meeting/${targetMeetingId}`)` and `window.location.replace(`/after-meeting/${targetMeetingId}`)` fallback.
- Guard the `<LoaderOne />` return at line 824 so that if `callingState === CallingState.LEFT`, it renders a clean status message ("Meeting ended. Redirecting to recap...") instead of an infinite spinner.

### 2. `src/components/EndCallButton.tsx`
- Import `useParams` from `next/navigation`.
- Use `targetId = call?.id || (params?.id as string)` so it never fails with missing call ID.
- Execute redirect to `/after-meeting/${targetId}` reliably.

### 3. `src/hooks/useAttendanceTracking.ts`
- Update the `post` guard:
  ```ts
  if (!c || (!identity.userId && !identity.streamUserId && !identity.email)) return;
  ```
- Send `user_id: identity.userId || undefined` so guest payloads are dispatched to `/api/attendance/event`.
- Allow the catch-up join effect to fire for guest identities when `streamUserId` or `email` is present.

### 4. `src/app/api/attendance/event/route.ts`
- Ensure `createRow` inserts `user_id: user_id ? user_id : null` into `attendance_events` so guests persist with `NULL` instead of empty strings.

## Verification Plan
1. Unit tests: Run `npx vitest run` to verify no regressions in `MeetingRoom.test.tsx`, `EndCallButton.test.tsx`, and attendance tests.
2. End-to-end test flow:
   - Host starts meeting.
   - Guest joins meeting.
   - Host clicks "End call for everyone".
   - Confirm host redirects to `/after-meeting/[id]`.
   - Confirm guest redirects to `/after-meeting/[id]`.
   - Confirm both views show Participants: 2.

