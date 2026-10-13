# Step G8 — Fix Guest Compatibility Bugs (G8-F1 through F7 + broader grep sweep)

## Context

The G8 integration audit (see `prompts/step-G8-integration-audit.md`) found 7 confirmed bugs where guests (users without a Clerk account, identified via `stream_user_id`/`participant_name`/`participant_email`) are broken or misrepresented because existing code assumes a non-null `user_id` from Clerk auth. The `attendance_events.user_id` column was made nullable in the G3 migration, but the API routes and UI components were never updated to handle the NULL case.

## Bugs to Fix

### G8-F1 (Priority 1 — CRITICAL): `src/lib/attendance-merge.ts` line 46
**Current:** `const existing = byUser.get(row.user_id)` — all guest rows with NULL `user_id` collapse into a single entry.
**Fix:** Change to composite key: `const key = row.user_id ?? row.participant_email ?? row.participant_name;` then `byUser.get(key)`. Update both the `get` and `set` calls consistently.
**Known limitation:** No disambiguation for same-name guests sharing same email — acceptable per audit decision.

### G8-F2 (Priority 1 — CRITICAL): `src/app/api/meetings/[id]/route.ts` lines 63-77
**Current:** `.eq("user_id", userId)` on attendance_events — guests with NULL `user_id` never match → 404.
**Fix:** Change the query to also match on `stream_user_id` or `participant_email`. Use an `.or()` clause or a separate query on `stream_user_id`/`participant_email`.

### G8-F3 (Priority 1 — CRITICAL): `src/app/api/attendance/event/route.ts` line 85
**Current:** `(event_type !== "call_ended" && !user_id)` rejects guests with 400.
**Fix:** Allow NULL `user_id` when `stream_user_id` or `participant_email` provides uniqueness. Change condition to require at least one of `user_id`, `stream_user_id`, or `participant_email`.

### G8-F4 (Priority 2): `src/components/Navbar.tsx` line 28
**Current:** Hardcoded `"Good morning, Uzair Iqbal"`.
**Fix:** Use `useUser()` from Clerk. When user is null (guest), show "Good morning, Guest" or similar. When signed in, show first name.

### G8-F5 (Priority 2): `src/components/Sidebar.tsx` lines 55-57
**Current:** Falls back to owner's name/email/avatar when `useUser()` returns null.
**Fix:** Show "Guest" or participant name when no Clerk user. Use `participant_name` from URL params or sessionStorage, or simply show "Guest" as placeholder.

### G8-F6 (Priority 2): `src/components/FloatingChat.tsx` lines 26-47, 99
**Current:** Hardcoded "NM" and "AI" avatar slots; `userName = user?.firstName ?? "there"`.
**Fix:** When `user` is null, show "Guest" as userName. The AvatarCluster should render a single guest avatar instead of hardcoded NM/AI slots.

### G8-F7 (Priority 3): `src/app/api/ai/process/route.ts` lines 201-218
**Current:** `currentUser()` returns null for guests → skips notification.
**Fix:** Fall back to `attendance_events.participant_email` when `currentUser()` returns null. Allow client to pass `email` in request body as well.

## Broader Grep Sweep — Additional `.eq("user_id", ...)` patterns

The following locations also use `.eq("user_id", userId)` on `attendance_events` or `meetings` and may have the same nullable-user_id gap. Each needs evaluation:

1. **`src/app/api/transcript/upload/route.ts:64`** — `.eq("user_id", userId)` on attendance_events for ownership check. Same pattern as G8-F2.
2. **`src/app/api/ai/embed/route.ts:52`** — `.eq("user_id", userId)` on attendance_events for ownership check. Same pattern as G8-F2.
3. **`src/app/api/engagement/route.ts:86`** — `.eq("user_id", userId)` on attendance_events. Same pattern as G8-F2.
4. **`src/app/api/ai/chat/route.ts:165`** — `.eq("user_id", userId)` on attendance_events for auth check. Same pattern as G8-F2.
5. **`src/app/api/follow-ups/route.ts:70`** — `.eq("user_id", userId)` on `meetings` table (not attendance_events). This is for listing the user's own meetings — guests without a Clerk account have no meetings row, so this is correct behavior (guests shouldn't see the follow-ups list).
6. **`src/app/api/follow-ups/[id]/route.ts:78`** — Same as above.
7. **`src/app/api/meetings/route.ts:36`** — `.eq("user_id", userId)` on `meetings` table. Lists user's meetings — correct behavior for guests (they have no meetings).
8. **`src/actions/meetings.ts:88`** — `.eq("user_id", userId)` on `meetings` table. Server action for meeting category update — correct behavior.
9. **`src/actions/follow-ups.ts:40`** — `.eq("user_id", userId)` on `meetings` table. Server action — correct behavior.
10. **`src/app/api/attendance/report/route.ts:53`** — `.eq("user_id", userId)` on `meetings` table (owner check). Guests shouldn't generate PDF reports (owner-only feature). Correct behavior.

**Scope decision for broader sweep:** Only fix the attendance_events `.eq("user_id", ...)` patterns that are used for participant authorization checks (G8-F2 pattern). The `meetings` table `.eq("user_id", ...)` patterns are correct because meetings are owned by Clerk users and guests don't own meetings.

The following files have the same G8-F2 pattern and should be fixed with the same approach (also match on stream_user_id or participant_email):
- `src/app/api/transcript/upload/route.ts` (lines ~60-68)
- `src/app/api/ai/embed/route.ts` (lines ~48-58)
- `src/app/api/engagement/route.ts` (line ~86)
- `src/app/api/ai/chat/route.ts` (lines ~163-170)

## Verification Plan

1. **Unit tests for G8-F1:** Add test cases to `src/lib/meeting-recap.test.ts` verifying that rows with NULL `user_id` but distinct `participant_email`/`participant_name` produce separate entries.
2. **Unit tests for G8-F3:** Add test for the attendance event route validation accepting a guest payload without `user_id` but with `stream_user_id`.
3. **`npx vitest run`** — all green (195+ existing + new tests)
4. **`npx tsc --noEmit`** — clean
5. **`npm run build`** — exit 0
6. **Manual checks:**
   - Recap shows each guest as separate entry (F1)
   - Guest can access meeting detail without 404 (F2)
   - Guest attendance events record successfully (F3)
   - Sidebar shows guest identity (F5)
   - AI processing email reaches guest (F7)

## Constraints
- Zero-cost rule: only free-tier tools
- No changes to the `meetings` table `.eq("user_id", ...)` patterns (guests don't own meetings)
- The composite key for G8-F1 is sufficient — no same-name-guest disambiguation needed
- All type definitions must stay strict TypeScript, no `any`
