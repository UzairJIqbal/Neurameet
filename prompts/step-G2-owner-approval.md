# Step G2 — Owner Approval for Guest Join

## What we are building

When a guest asks to join via G1's `guest.request_join` call event, the signed-in meeting owner (in the call) receives a real-time desktop notification with their name and Accept / Deny buttons. Accept admits the guest into the call; Deny blocks them. The guest's 5-second status poll is the primary admission signal (poll-only fallback per G0 §4.2); the call event gives the owner real-time notification. No new notification system — Stream call events only, zero-cost, Stream free tier.

## Scope

### Build (all DONE)

1. **`getGuest(guest_token)` export** in `src/lib/guest-store.ts` — returns a sanitized `{ meeting_id, name, status } | undefined`. Never exposes `mint`, `access_token`, `stream_user_id`, `_resolve`, `_reject`, or `promise`. Lets the admit/deny routes verify a `guest_token` belongs to the claimed `meeting_id` before the owner check.
2. **Tests** for `getGuest` in `src/lib/guest-store.test.ts` (4 new tests: sanitized fields, unknown token, admit status, deny status).
3. **`POST /api/guest/admit`** — Clerk-auth route. Checks `getStatus(guest_token) === "pending"` → 409 if not; `getGuest(guest_token).meeting_id === meeting_id` → 403 on mismatch; owner check `meetings.user_id === userId` → 403; calls `admit(guest_token)` and **checks its boolean return → 409 if false**; best-effort `sendCallEvent({ event: "guest.admitted" })` via `@stream-io/node-sdk`; returns `{ status: "admitted" }`.
4. **`POST /api/guest/deny`** — Same structure, calls `deny(guest_token)` → 409 if false, emits `guest.denied`.
5. **Owner notification in `MeetingRoom.tsx`** — `call.on("all", handler)` subscribing to `guest.request_join` custom events (via `CustomVideoEvent` with `event.type === "custom"` and `event.custom.event === "guest.request_join"`). Renders a `react-hot-toast` with the guest's name + Accept/Deny buttons (Accept → `POST /api/guest/admit`, Deny → `POST /api/guest/deny`).

### Decisions locked

- **Event reception:** `call.on("all", handler)` is typed as `EventTypes = 'all' | StreamVideoEvent['type']` (`connection/types.d.ts:123`). Custom events arrive as `type: 'custom'` with `CustomVideoEvent` shape (`{ call_cid, created_at, custom: { [key: string]: any }, type: string, user }` — `gen/coordinator/index.d.ts:3863-3897`). Handler filters on `event.type === "custom" && event.custom?.event === "guest.request_join"`. Existing `call.on(...)` subscription + cleanup pattern reused from `MeetingRoom.tsx:441-461`.
- **Event emission:** `nodeClient.video.sendCallEvent({ type: "default", id: meeting_id, custom: { event: "guest.admitted"|"guest.denied", guest_token } })` — mirrors the emit shape from `request-join/route.ts:68-78`. `@stream-io/node-sdk`'s `StreamClient.video` is typed as `StreamVideoClient` (extends `VideoApi`) which has `sendCallEvent` directly.
- **Owner check:** `auth()` → `userId` → `supabase.from("meetings").select("user_id").eq("stream_call_id", meeting_id).maybeSingle()` → 403 if `meeting.user_id !== userId`. Exact pattern from `src/app/api/meetings/by-call/[callId]/route.ts:33-43`.
- **No new DB table:** state is server-side in-memory `guest-store.ts`; the guest polls `GET /api/guest/status`.
- **Guest admission into the call:** `call.join({ create: false })` (same as `MeetingSetup.tsx:365`). Already implemented in `GuestCallView` (G1); G2 only adds the owner side.

## The three gap fixes

1. **Return value check:** `admit()` and `deny()` in `guest-store.ts` return `boolean` (false if the status wasn't `"pending"`). The G2 routes check this return value and return **409** with `{ error: "Guest request already resolved or expired" }` when false — NOT the success shape. This guards against the race between the `getStatus` check and the actual admit/deny call (e.g. another owner, or the TTL expiring in between).
2. **Toast dedup:** `toast(..., { id: guest_token })` — react-hot-toast supports stable IDs, so a duplicate `guest.request_join` event for the same `guest_token` updates the existing toast instead of stacking a second one. `toast.dismiss(guest_token)` removes it after an Accept/Deny.
3. **Stale toast handling (option a):** when creating the toast, set a 10-minute timer via `setTimeout(() => toast.dismiss(guest_token), 10 * 60 * 1000)` matching the guest-store TTL. On dismiss or before unmount, the timer is cleared (tracked in a `useRef` map keyed by `guest_token`). This ensures stale pending requests auto-clear from the owner UI if no action is taken — the guest's own polling will have already expired them by the time the toast is dismissed.

## Files to create / modify

- **Modify** `src/lib/guest-store.ts` — add `getGuest(guest_token)` export returning `{ meeting_id, name, status } | undefined`. DONE.
- **Add tests** to `src/lib/guest-store.test.ts` — 4 new tests for `getGuest`. DONE (21/21 green).
- **Create** `src/app/api/guest/admit/route.ts` — POST handler (8 steps: auth → parse → `getStatus` 409 → `getGuest` cross-check 403 → owner check → `admit()` return check 409 → best-effort `sendCallEvent` → `{ status: "admitted" }`). DONE.
- **Create** `src/app/api/guest/deny/route.ts` — POST handler, mirrors admit. DONE.
- **Modify** `src/components/MeetingRoom.tsx` — add `useEffect` subscribing via `call.on("all", handler)`, filtering for `guest.request_join`, rendering a react-hot-toast with Accept/Deny via `toast(..., { id: guest_token })`, 10-min TTL auto-dismiss with cleanup. Guarded by `isOwner` so guests don't get the notification. DONE.
- **No middleware changes** — admit/deny routes call `auth()` and protect themselves; the guest's status poll already needs no auth (G1).

## Verification gates (all passed)

- `npx tsc --noEmit` — clean (only pre-existing unrelated `AfterMeetingRecap.test.tsx` error).
- `npx vitest run src/lib/guest-store.test.ts` — 21/21 green.
- `npm run build` — exit 0.
- `grep` gate: `guest.request_join` emit uses `nodeClient.video.sendCallEvent` (same as `request-join/route.ts:68`).
- `grep` gate: `call.on("all", handler)` confirmed from SDK type defs — `AllCallEvents` includes `'all'` (`connection/types.d.ts:123`), `MeetingRoom.tsx` already uses `call.on(...)` + cleanup at lines 441-461.
- `grep` gate: `getGuest` returns only `{ meeting_id, name, status }` — no `mint`/`access_token`/`_resolve`/`_reject`/`promise` fields.
- `grep` gate: admit/deny routes check `admit()`/`deny()` boolean return before returning `{ status: "admitted" }` / `{ status: "denied" }` — 409 on false.
