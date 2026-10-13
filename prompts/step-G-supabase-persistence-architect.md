# ADR: Migrate Guest Store from In-Memory to Supabase Persistence

## Status
**Proposed** — supersedes G0 §4.4.2/§4.4.5

## Context & Premise (Confirmed)

**Deploy target:** Vercel serverless functions. Evidence:
- `next.config.ts` has no `output` setting → Next.js 15 default = serverless on Vercel.
- `AGENTS.md` Phase 4: "Deploy to Vercel free tier."
- `serverExternalPackages` config present (serverless-specific).

**Root cause of the 403:** The in-memory `Map` in `src/lib/guest-store.ts` is correct in code but **does not survive across Vercel serverless instances**. Each API route invocation may land on a different instance:
1. `POST /api/guest/request-join` (instance A) creates the `GuestRequest` entry in instance A's Map.
2. `POST /api/guest/admit` (instance B) calls `getGuest(guest_token)` → `undefined` → **403** at `route.ts:34-36` (the meeting_id cross-check).
3. `GET /api/guest/pending` returns **200** (not 403) because its lazy-creation fallback (`maybeSingle()` + upsert) masks the missing entry — returns an empty pending array even when the in-memory Map has no entries on that instance.

**Does NOT reproduce in local dev:** `npm run dev` uses a single Node process — the Map IS shared across all API route invocations on the same machine. Confirmed by the progress tracker note: the 5 recovery fixes all passed `tsc` + 169/169 vitest, but the 403 only appears in deployed serverless.

## Why G0 §4.4.2/§4.4.5 Is Superseded

G0 decided "in-memory store, no DB, no schema change" — this was made **before the actual deploy target was verified**. The in-memory assumption (persistent process sharing a Map) holds for local dev and self-hosted containers but **does not hold for Vercel serverless functions**, where each request may land on a different ephemeral instance with its own memory space. This is a platform reality that was not checked at G0 time.

The `Promise<GuestMint>` pattern (resolveMint/rejectMint) — a core G0 design — is **fundamentally incompatible with serverless**: a Promise object exists only in one instance's memory; a concurrent request on another instance can never await it. The entire in-flight-mint dedup mechanism must become a DB-level atomic operation.

## Decision

### 1. New Table: `guest_requests`

```sql
create table if not exists guest_requests (
  guest_token      text primary key,            -- server-issued uuid, prefixed gt_
  meeting_id       text not null,               -- Stream call id (same as meetings.stream_call_id)
  request_nonce    text not null,               -- client-generated uuid for dedup
  name             text not null,               -- display name for owner toast + attendance
  email            text,                        -- optional contact for owner
  status           text not null default 'pending'
    check (status in ('pending', 'minting', 'admitted', 'denied', 'expired')),
  stream_user_id   text,                        -- Stream guest user id (set after createGuestUser)
  access_token     text,                        -- Stream guest access token (set after createGuestUser)
  created_at       timestamptz not null default now(),
  minted_at        timestamptz,                 -- when createGuestUser resolved
  expires_at       timestamptz not null         -- 10-min TTL from creation
);

-- Dedup: exactly one pending/minting row per (meeting_id, request_nonce)
create unique index if not exists idx_guest_requests_nonce_uniq
  on guest_requests (meeting_id, request_nonce)
  where status in ('pending', 'minting');
```

**Status lifecycle:**
- `pending` → `minting` → `admitted` (approval flow: minting during createGuestUser call)
- `pending` → `admitted` (open mode: admit short-circuits after mint)
- `pending` → `denied`
- `pending` → `expired` (after `expires_at` + cleanup)
- `not_found` is NOT a status value — it's the absence of a row (preserved return value from `getStatus`).

### 2. Atomic Operation: Mint Pattern (replacing Promise cache)

The `createPending` function must be the **single isNew caller** that mints. The concurrency fix becomes a DB-level `INSERT ... ON CONFLICT DO NOTHING`:

```sql
-- The isNew caller:
INSERT INTO guest_requests (
  guest_token, meeting_id, request_nonce, name, email, status, expires_at
) VALUES (
  'gt_<uuid>', '<meetingId>', '<nonce>', '<name>', '<email>', 'pending', now() + interval '10 minutes'
)
ON CONFLICT (meeting_id, request_nonce) DO NOTHING
  -- the unique index only covers pending/minting, so a re-INSERT after the row
  -- expired or was admitted/denied does NOT conflict — it creates fresh.
RETURNING guest_token;
-- If RETURNING is empty → a concurrent caller already owns this nonce → isNew = false.
```

**The isNew caller then:**
1. Sets status → `minting` (atomic UPDATE to claim the mint slot).
2. Calls `createGuestUser` (Stream API).
3. Atomically writes `stream_user_id` + `access_token` + `minted_at` + status back to `pending` (or `admitted` in open mode).
4. The reuse-path caller (isNew = false) polls `GET /api/guest/status` or is served the same row via the unique index lookup — it reads the credentials once they're written, no Promise needed.

**Why this is race-safe:** The unique constraint on `(meeting_id, request_nonce) WHERE status IN ('pending','minting')` is the single source of truth. Two concurrent POSTs with the same nonce → only one `INSERT ... ON CONFLICT DO NOTHING` succeeds → only that caller is `isNew` → only that caller mints. No Promise object crosses instances. No polling loop re-introduces a race (the reuse-path reads the same DB row).

**Open-mode short-circuit:** Still done server-side (same as current code) — after mint, `UPDATE ... SET status = 'admitted'` so the first `GET /api/guest/status` poll returns `admitted` immediately.

### 3. Atomic Operation: admit()/deny()

```sql
-- admit(guest_token):
UPDATE guest_requests
SET status = 'admitted', minted_at = COALESCE(minted_at, now())
WHERE guest_token = '<token>'
  AND status = 'pending'
RETURNING 1;
-- If no row returned → the caller's admit() returns false (409 in the route).
```

This is the existing check-and-set pattern, now atomic at the SQL level. The `WHERE status = 'pending'` guard makes it idempotent: concurrent admit calls → only one succeeds (the other sees 0 rows updated). No separate `getStatus` precheck → no `await` gap (mirrors the G2 fix rationale).

**The 403 cross-check (`getGuest(guest_token).meeting_id === meeting_id`) is preserved** — it runs against the DB row now, so it works across instances.

### 4. Function Signature Mapping (guest-store.ts)

All functions become `async` (DB-backed), preserving names and return shapes:

| Function | Current | After Migration |
|---|---|---|
| `createPending({ meeting_id, request_nonce, name, email })` | sync → `{ guest, isNew, mintPromise }` | async → `{ guest: GuestInfo, isNew, mintPromise }` |
| `resolveMint(guest_token, mint)` | sync void | async void (UPDATE stream_user_id, access_token, minted_at) |
| `rejectMint(guest_token, e)` | sync void | async void (DELETE the row so retry can start fresh) |
| `getStatus(guest_token)` | sync → string | async → string (reads `status` + checks `expires_at` vs `now()`) |
| `getGuest(guest_token)` | sync → `{ meeting_id, name, status, stream_user_id } \| undefined` | async → same shape (never exposes `access_token`, `mint`, `_resolve`, `_reject`) |
| `getAllPending(meetingId)` | sync → array | async → array (SELECT ... WHERE meeting_id AND status = 'pending' AND expires_at > now()) |
| `admit(guest_token)` | sync → boolean | async → boolean (atomic UPDATE ... WHERE status = 'pending' RETURNING) |
| `deny(guest_token)` | sync → boolean | async → boolean (atomic UPDATE ... WHERE status = 'pending' RETURNING) |
| `cleanup()` | sync void | async void (DELETE expired pending rows) |
| `getStatus` return type | adds `minting` to the union? No — stays `"pending" \| "admitted" \| "denied" \| "expired" \| "not_found"` | No change (clients don't need to know about `minting`; that's an internal transition state). |

**`GuestInfo` type** (new, returned by `createPending`):
```ts
type GuestInfo = {
  guest_token: string;
  meeting_id: string;
  request_nonce: string;
  name: string;
  email?: string;
  status: "pending" | "minting" | "admitted" | "denied" | "expired";
  stream_user_id: string | null; // null until resolveMint
  access_token: string | null; // null until resolveMint
  minted_at: string | null;
  created_at: string;
  expires_at: string;
};
```

**`mintPromise` semantics:** The reuse-path caller (`isNew = false`) cannot await a Promise across instances. Instead, it receives `mintPromise = Promise.resolve(null)` as a sentinel (since it will poll `GET /api/guest/status` to learn when minting completes, or the route caller re-queries). The `isNew = true` caller uses `mintPromise` internally to signal its own completion to `resolveMint`. **The Promise stays in the route closure, not in the store** — the store writes to DB, the route resolves locally.

### 5. Route Changes

| Route | Current Behavior | After Migration |
|---|---|---|
| `request-join/route.ts` | in-memory createPending + resolveMint/rejectMint | async createPending + resolveMint/rejectMint (DB writes). The `mintPromise` race against 8s timeout **stays** (same code structure — the timeout guards the `createGuestUser` call, not the store). `isNew` logic identical, just DB-backed. |
| `admit/route.ts` | `getGuest()` sync cross-check → `admit()` sync | `await getGuest()` → `await admit()`. Step 3 cross-check preserved (now reads from DB, works across instances). No other logic change — the 403 → 200 fix is automatic because `getGuest()` now finds the row. |
| `deny/route.ts` | Same structure as admit | Same — `await getGuest()` + `await deny()`. |
| `status/route.ts` | `getStatus()` sync | `await getStatus()` — also checks `expires_at` vs `now()` for expiry. |
| `pending/route.ts` | `getAllPending()` sync + lazy-creation fallback | `await getAllPending()` — **the masking behavior is fixed as a side effect**: `getAllPending` now queries the DB for rows with `status = 'pending' AND expires_at > now()`, so it returns the real pending count, not a masked 200-with-empty-array. The lazy-creation fallback for the `meetings` table row is **kept** (that's a separate concern — it ensures the meetings row exists for owner check), but `getAllPending` no longer masks a missing guest entry. |

### 6. The `GET /api/guest/pending` Masking Behavior

**Current problem:** The lazy-creation fallback (creates a `meetings` row if not found) combined with the in-memory `getAllPending` returns `{ pending: [] }` (200) even when no guest exists on that instance — the 403 in the admit route is never visible to the owner because the pending endpoint shows 200 with an empty list.

**After migration:** This is **fixed as a side effect** — `getAllPending(meetingId)` queries `SELECT ... WHERE meeting_id = ? AND status = 'pending' AND expires_at > now()`. If the guest request exists in Supabase (which it will, since `request-join` writes there), it appears regardless of which instance serves the GET. The masking was always an in-memory-instance problem, not a logic problem — once the store is DB-backed, the masking disappears because all instances read the same rows.

The lazy-creation fallback for the `meetings` table row stays (it's a separate concern: ensuring the meetings row exists so the owner check + `guest_admission_mode` lookup can proceed for a meeting that was just created via Stream SDK without a Supabase row).

### 7. Other In-Memory State Audit

Grep across `src/` for module-level `Map`/`Set`/cache patterns:

| File | Pattern | Risk |
|---|---|---|
| `src/lib/guest-store.ts` | `const store = new Map`, `nonceIndex = new Map` | **THIS TASK — migrating.** |
| `src/lib/recordings.ts` | `recordingsCache = new Map` (user_id → cached recordings, 60s TTL) | **Low risk — different failure mode.** This is a read-through cache: if the cache misses (different instance), the function re-fetches from Stream. No data loss, no 403 — just a redundant API call. Not a correctness bug, just a minor performance hit on serverless cold starts. **No migration needed.** |
| `src/components/RecordingPage.tsx` | `new Map()` for links | Local component state (rebuilt each render) — not module-level. No risk. |
| `src/components/MeetingRoom.tsx` | `pendingTimers = new Map` inside useEffect | Component-scoped (closure, resets each render). Not module-level. No risk. |
| `src/components/ReminderManager.tsx` | `localStorage` + `new Set` per-call | Client-side `localStorage`, per-function local `Set`. Not module-level server state. No risk. |
| `src/components/UpcomingPage.tsx` | `useState<Set<string>>` | React component state. No risk. |
| All other `new Map`/`new Set` in routes | Inside request handlers or component bodies | Request-scoped or render-scoped. No cross-instance sharing needed. No risk. |

**Conclusion:** `guest-store.ts` is the **only** module-level in-memory state whose correctness depends on cross-instance persistence. `recordings.ts` has a cache that degrades gracefully (redundant fetch) rather than breaking (403). No other server-side module-level state exists.

### 8. Supabase Permissions

The new `guest_requests` table must be covered by the existing `service_role` GRANT block in `supabase/schema.sql`:

```sql
-- Already extends to all tables in schema public:
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
```

This is idempotent — the existing GRANT covers the new table automatically (it grants on ALL tables, not per-table). RLS stays **disabled** (per schema.sql header: auth is Clerk, not Supabase — all queries scope by `user_id`/ownership in app code, service-role client bypasses RLS).

### 9. Security

- `access_token` and `stream_user_id` in `guest_requests` are Stream-issued credentials, NOT Supabase secrets. They are stored server-side via `supabaseServer()` (service-role), never exposed to the browser (the token is sent to the guest browser as part of the `request-join` response, same as today — that flow is unchanged).
- `getGuest()` continues to return only `{ meeting_id, name, status, stream_user_id: null }` — never `access_token`. The route handles mint delivery separately.
- The `expires_at` column enables a cleanup cron (or lazy expiry check in `getStatus`) for stale rows — same 10-min TTL as the in-memory store.

### 10. Verification Plan

1. **`npx tsc --noEmit`** — clean (no type errors from the async migration).
2. **`npm run build`** — exits 0 (serverless functions compile).
3. **`npx vitest run src/lib/guest-store.test.ts`** — all existing tests pass with the DB-backed store (tests must mock `@/lib/supabase-server`). The 17/17 → 21/21 tests (including the 4 `getGuest` tests + the admit route emit regression) should all pass against the new async signatures.
4. **`src/app/api/guest/admit/route.test.ts`** — the existing G2 regression test (asserts `user_id` in emit payload) continues to pass. It uses `createPending` + `resolveMint` to seed — these calls must work with the async signatures under the mocked supabase client.
5. **Live walk-through (gates from the user's instruction):**
   - **Double-click Accept** → no 403, guest admitted once, no 409 shown (the atomic UPDATE ensures the second click hits `WHERE status = 'pending'` → 0 rows → `admit()` returns false → route returns 409; the owner UI should handle this gracefully via the `useRef` guard already in MeetingRoom.tsx:109-110).
   - **Open mode toggle** → guest skips lobby, joins directly (`admit()` called in request-join's open-mode branch, status → `admitted`, guest poll sees `admitted` immediately).
   - **Approval mode** → lobby + toast + accept works cleanly (guest sees "waiting", owner gets `guest.request_join` toast with Accept/Deny, accept calls `admit()` → guest poll flips to `admitted` → `GuestCallView` enters the call).

### 11. Out of Scope

- No changes to `MeetingRoom.tsx` owner notification logic (the `call.on("all", ...)` handler + toast + `useRef` double-click guards are unchanged — they're already correct per Fix 2).
- No changes to `GuestCallView.tsx` (admitted phase handling, camera/microphone disable-before-join — unchanged per Fix 4).
- No changes to `middleware.ts` (public route for `/meeting/:id/guest`, signed-out redirect — unchanged per G1.5).
- No new UI — this is purely a store backend migration.
- The `processing_state` and `language` column migrations for `transcripts` (from F-series work) are separate and already applied.
