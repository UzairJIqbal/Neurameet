# Step G3 — Owner Per-Meeting Admission Toggle

**Phase:** Guest Join flow (between G2 and Deploy Step 11)
**Status:** In Progress (blueprint locked; build complete, live walk-through pending)
**Branch:** `fix/graceful-degradation-g1-g2` (uncommitted; do not push without approval)
**Zero-cost rule:** Stream free tier only. No paid Stream plan, no new provider. Column on existing `meetings` table — no new DB table.

---

## 1. The Question G3 Answers

An owner needs a per-meeting toggle between "Anyone with the link can join" (open admission) and "Require approval for guests" (the G1/G2 lobby + owner toast flow). The toggle is stored zero-cost on the existing `meetings` table, and the `POST /api/guest/request-join` route reads it to decide whether to short-circuit to immediate admission or to emit a `guest.request_join` event for owner approval.

**CRITICAL CONSTRAINT — preserve G1/G2:** the default admission mode is `'approval'` (the current G1/G2 behavior). Every existing and newly-created meeting requires approval unless the owner explicitly flips the toggle to `'open'`. The signed-in join path is entirely untouched.

---

## 2. Language We Agreed On

- **Admission mode** — a per-meeting string: `'approval'` (guests wait for owner Accept/Deny via the G2 flow) or `'open'` (guests join immediately, no owner approval).
- **Owner** — the Clerk `user_id` stored in `meetings.user_id`, which equals `call.state.createdBy.id` on the Stream side.
- **Guest** — a Stream `GuestUser` (server-issued token via `createGuestUser`), NOT a Clerk-authenticated user. Signed-in users always use the existing signed-in join path regardless of the toggle.

---

## 3. Decisions Made (5 + 2 gaps)

### Decision 1 — Storage: a column on `meetings`
- Add `guest_admission_mode text NOT NULL DEFAULT 'approval'` to the `meetings` table.
- No new DB table, no `meeting_settings` join — a single `SELECT` field on the meetings row.
- The `user_id` nullable migration for `attendance_events` is bundled here (G0 §4.5.3 locked this): `ALTER TABLE attendance_events ALTER COLUMN user_id DROP NOT NULL`. Signed-in writers always supply non-null `user_id`; guest writers (G4) will omit it.
- **Reasoning:** simplest shape, zero new infra, one extra `SELECT` field, backward-compatible.

### Decision 2 — UI Surface: Overview tab on the Meeting Intelligence detail page
- The toggle lives in `OverviewTab.tsx` as an owner-only card (same as the Attendance Report card pattern).
- `MeetingDetail.tsx` already computes `isOwner = meeting.user_id === user.id` and threads it to `MeetingTabs → OverviewTab`. Reuse that.
- The toggle is a Server Action `updateMeetingGuestAdmissionMode(meetingId, mode)` (in `src/actions/meetings.ts`) — ownership-checked, validates against the two allowed values.
- **Reasoning:** the owner's meeting-config surface, reachable whether the call is live or not, `isOwner` already wired.

### Decision 3 — request-join short-circuit for open mode
- `POST /api/guest/request-join` reads `guest_admission_mode` from the `meetings` row matched by `stream_call_id`.
- If `'open'`: still mints the Stream guest token (the guest needs credentials to join via the Stream client), but **skips** the `guest.request_join` event emit AND immediately marks the guest as `admitted` in the in-memory store. The guest's 5s poll sees `"admitted"` instantly and calls `call.join({ create: false })`.
- If `'approval'` (or default): current G1/G2 flow unchanged (mint + emit + poll fallback).
- **Reasoning:** minimal change, reuses the existing credential + poll infrastructure, no new event shapes.

### Decision 4 — `user_id` nullable migration is safe for the signed-in path
- The existing `POST /api/attendance/event` route is Clerk-authenticated and always supplies a non-null `user_id`. Making the column nullable does not affect it.
- Guest attendance (G4) will write `user_id = null` with `stream_user_id` + `participant_name` + `participant_email` populated.
- **Reasoning:** additive migration, signed-in writers never hit the null path.

### Decision 5 — Default `'approval'`, column-level DEFAULT
- `guest_admission_mode` has `DEFAULT 'approval'` so even meetings created lazily (at first attendance event or transcript upload, per the B2 debug fix) get a safe closed default.
- **Reasoning:** preserves current behavior for all existing and future meetings until the owner explicitly opts in.

### Gap 1 — Fail-safe on missing/lazy-created meeting row
- If `request-join` looks up `guest_admission_mode` and the `meetings` row doesn't exist yet (lazy creation per B2 — the row is only created at first attendance event or transcript upload), the route **defaults to `'approval'`** (safe/closed). Never fail-open.
- Explicit: `const mode = meeting?.guest_admission_mode ?? 'approval';`
- **Reasoning:** a missing row must never let an unapproved guest wander into a call they weren't explicitly admitted to.

### Gap 2 — Mid-flight toggle change
- If a guest is already `"pending"` in `guest-store` when the owner flips approval → open, that specific pending request **stays pending**. It does NOT get auto-admitted retroactively.
- Only NEW requests after the flip pick up the open-mode short-circuit.
- The owner can still manually admit a live pending guest via the existing G2 toast if the owner is in-call.
- **Reasoning:** simplest correct behavior — no extra store-scan logic, no race between the toggle flip and the in-memory store. The pending guest's poll continues until the owner acts (admit/deny) or the 10-min TTL expires.

---

## 4. Out of Scope (Do NOT Build in G3)
- The guest attendance write path (`user_id = null` rows) — that is G4.
- Any change to the signed-in join flow.
- Any new DB table, provider, or notification system.
- The deny path, TTL, or dedup logic in `guest-store.ts` — those are unchanged G1/G2 concerns.
- Deploy (Step 11) — stays after G3/G4 close.

---

## 5. G3 Implementation Steps

1. **Schema migration** (`supabase/schema.sql`):
   - `ALTER TABLE meetings ADD COLUMN IF NOT EXISTS guest_admission_mode text NOT NULL DEFAULT 'approval';`
   - `ALTER TABLE attendance_events ALTER COLUMN user_id DROP NOT NULL;` (idempotent)
   - Both in the existing migration `do $$` block pattern.

2. **Server Action** (`src/actions/meetings.ts`):
   - `updateMeetingGuestAdmissionMode(meetingId: string, mode: 'open' | 'approval'): Promise<{ ok: boolean }>`
   - Clerk `auth()` → 401 if absent.
   - `meetings.user_id === userId` owner check → 403 if not owner.
   - Validate `mode` against `['open', 'approval']`.
   - `supabaseServer().from('meetings').update({ guest_admission_mode: mode }).eq('id', meetingId)`.

3. **request-join route update** (`src/app/api/guest/request-join/route.ts`):
   - After validation + before minting: look up `meetings` by `stream_call_id = meetingId`, select `guest_admission_mode`.
   - `const mode = meeting?.guest_admission_mode ?? 'approval';` (fail-safe default).
   - If `mode === 'open'`: mint the guest token as-is, but — instead of (or in addition to) emitting `guest.request_join` — call `admit(guest_token)` on the store entry so `getStatus` returns `'admitted'` immediately. Skip the `sendCallEvent` emit (no owner notification needed). Return the **identical** response shape as approval mode (`{ access_token, user, guest_token, waiting: true }`) but with `waiting: false` — same field, just flipped.
   - If `mode === 'approval'`: current G1/G2 flow (mint + emit + return `waiting: true`).

4. **Guest lobby display** (`src/app/(root)/meeting/[id]/guest/page.tsx`):
   - When `waiting: false` is returned from `request-join`, skip the "Waiting for the host" phase and go straight to the in-call view (the `phase` sets to `"admitted"` immediately, the call joins via `call.join({ create: false })`). No new `admitted` field to read — the lobby already keys off `waiting`.

   **Concrete one-line diff in the lobby form handler:**
   ```ts
   // In GuestLobbyForm.handleAskToJoin, after successful request-join:
   setPhase(data.waiting ? "waiting" : "admitted");  // was: setPhase("waiting");
   ```
   No other changes needed in the lobby — `GuestCallView` already handles the `admitted` phase.
   - Minimal change — the `GuestCallView` already handles the `admitted` phase.

5. **Overview tab toggle UI** (`src/components/meeting-intelligence/OverviewTab.tsx`):
   - Owner-only card (guard: `isOwner` prop threaded from `MeetingDetail → MeetingTabs → OverviewTab`).
   - Radio or toggle: "Anyone with the link can join" (`open`) vs "Require approval for guests" (`approval`).
   - Current value read from `meeting.guest_admission_mode` (added to `MeetingDetailData` + the `GET /api/meetings/[id]` select).
   - On change: call `updateMeetingGuestAdmissionMode` Server Action, optimistic UI update, toast on success/error.

6. **Types** (`src/lib/meeting-types.ts`):
   - Add `guest_admission_mode: string` to `MeetingDetailData`.
   - Add `GuestAdmissionMode = 'open' | 'approval'` type alias.

7. **Verification gates:**
   - `npx tsc --noEmit` clean (only pre-existing unrelated `AfterMeetingRecap.test.tsx` error).
   - `npx vitest run src/lib/guest-store.test.ts` — existing 21/21 still green (no store API change, just the route reads a new field).
   - `npm run build` exit 0.
   - Grep gate: `request-join` defaults to `'approval'` on missing meeting row (`?? 'approval'`).
   - Grep gate: the `meeting` lookup in `request-join` selects `guest_admission_mode`.
   - Live walk-through (user): owner flips toggle to "open" on detail page → a fresh guest request (new nonce, new tab) skips the waiting state and joins directly; owner flips back to "approval" → a fresh guest request enters the lobby + owner toast.
