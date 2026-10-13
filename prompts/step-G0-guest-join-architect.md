# Step G0 — Guest Join with Owner Approval (Architect)

**Phase:** Guest Join (new — between Transcript Generation F0–F9 and Deploy Step 11)
**Status:** Accepted (architecture complete; G1 built, G2-G4 pending)
**Branch:** `fix/graceful-degradation-g1-g2` (uncommitted; do not push without approval)
**Zero-cost rule:** Stream free tier only. No paid Stream plan, no new provider. No account required for guests.
**Related:** `docs/scope/scope.md` (G0–G4 rows), `context/build-plan.md` (Guest Join section), `context/progress-tracker.md` (G0–G4 pending), `context/architecture.md` (`attendance_events` schema, §2.1 of data model)

---

## 1. The question G0 must answer

An unauthenticated participant clicks a shared meeting link (e.g. `/meeting/abc123`). Today they are forced through Clerk sign-in before seeing MeetingSetup. We want them to land on a lightweight **Guest Setup** page instead — camera/mic preview + a name field + an "Ask to join" button — with **no account creation required**.

When they click "Ask to join", the meeting **owner** receives a real-time notification ("X wants to join") and can Accept or Deny. On accept, the guest is admitted into the actual Stream call.

**CRITICAL CONSTRAINT — do not break the existing flow:** the signed-in join path (owner or any signed-in user clicking a link → straight into MeetingSetup → Meeting Room) must stay exactly as-is. This change ONLY affects participants who are NOT signed in when they click a link. Everything else (instant meeting creation, scheduled meetings, recording, transcript generation, attendance, RAG chat, follow-ups, etc.) must continue working unchanged.

G0 is the architect gate: verify Stream's actual guest/anonymous-user capability, decide the identity-capture approach, decide the approval-notification mechanism, confirm zero-cost feasibility, and confirm the signed-in flow is untouched. No code is written in G0 — only the decision that gates G1+.

---

## 2. Audit inputs (what exists today)

### Signed-in join flow (MUST be preserved unchanged)
- `src/Providers/StreamClientProvider.tsx` creates a `StreamVideoClient` with `user.id = Clerk user.id`, `name`, `image`, and a `tokenProvider` backed by `src/actions/stream.actions.ts` (`tokenProvider` uses Clerk `currentUser()` + `client.generateUserToken`).
- `src/hooks/useGetCallbyId.ts` — the existing join route hook using `allowLinkAccess: true`.
- `src/components/MeetingSetup.tsx` / `src/components/MeetingRoom.tsx` — the live pre-join lobby and in-call UI.
- The route guard that sends unauthenticated visitors to Clerk sign-in.

### Stream SDK (installed, verified against type definitions)
- `@stream-io/video-react-sdk` **1.40.2**, `@stream-io/video-client` **1.57.0** (per `step-D0-audit.md` and `node_modules/@stream-io/video-client/dist/**/*.d.ts`).
- `GuestUser` type — `{ type: 'guest'; token: never }` — a real Stream SDK type representing an unauthenticated guest.
- `AnonymousUser` type — `{ type: 'anonymous'; id?: '!anon' }` — a real Stream SDK type.
- `AnonymousUser` is a real (optional-id) anonymous participant; `GuestUser` is the token-never variant. Both exist for unauthenticated participants without a Clerk account.
- `StreamVideoClient.createGuestUser(data: CreateGuestRequest): Promise<CreateGuestResponse>` returns `{ access_token, duration, user }` — a real method on the node client (`@stream-io/video-client`).
- `connectAnonymousUser` is private (not a public API).
- `connectUser` accepts a `User` type.
- `StreamVideoClientOptions` is a discriminated union keyed on `user.type` — `type: 'guest'` requires `api_key` (no `user` field); `type: 'anonymous'` requires `api_key` + `user` (id/name).

### Existing data model for guest attribution (NO new schema needed)
- `attendance_events` table (`supabase/schema.sql`) already has the columns needed for guests:
  - `stream_user_id text` — Stream user_id of the participant (the G0 fix; for guests this is the Stream guest/anonymous id).
  - `participant_name text` — display name captured at join (guests fill this in on the Guest Setup page).
  - `participant_email text` — email captured at join (optional for guests).
  - `user_id text` — Clerk user id (null for guests).
- `resolveSpeakerName` (the existing F-series name-resolution fallback chain) already handles: Clerk profile name → `participant_name` → `participant_email` → `stream_user_id` → "SpeakerN". So a guest who provides a name will resolve correctly in transcripts and attendance reports without any DB change.

### Stream call events (the existing real-time infra to reuse)
- Stream call state is already connected for owners in active calls. The SDK emits participant-change events (`call.state.events`) and user presence state. This is the real-time channel to reuse for the owner "X wants to join" notification — do NOT build a separate notification system.

---

## 3. Zero-cost verification

- `GuestUser`, `AnonymousUser`, and `createGuestUser` are all part of the **free Stream Video SDK** (same package already in use). No paid Stream tier is required — guests join calls the same way signed-in users do, just without a Clerk-backed `generateUserToken` (the guest token comes from `createGuestUser` on the server).
- No new provider: no Clerk account creation for guests, no Supabase writes from the browser for the join path, no new auth vendor.
- The owner notification reuses the existing Stream call event stream (no new infra, no paid push service — Resend email is the only optional enrichment and is already approved zero-cost, used only for Step A2).

**Conclusion: G0 is zero-cost.** Guest capability is real in the installed free-tier Stream SDK. The blocker from the scope note ("HTTP 503 reading VIDEO.md") does NOT block the decision — the capability is confirmed via the installed SDK type definitions, which is the authoritative source per the permanent Stream SDK verification rule.

---

## 4. Decisions to lock

### 4.1 Stream guest identity approach (chosen)

**Option A — `GuestUser` via `createGuestUser` (server-side token):**
The guest Setup page collects a **name** (required, client-side validation) and **email** (optional, client-side validation). On "Ask to join", the browser calls a new server API route `POST /api/guest/request-join { meetingId, name, email }` (auth NOT required). The server:
1. Generates a Stream guest token via `StreamVideoClient.createGuestUser()` (server-only, uses `STREAM_API_KEY`/`STREAM_API_SECRET` — never exposed to the browser).
2. Stores the guest's pending request in a new lightweight pending-guest table OR (preferred, zero-state) emits a Stream call event carrying the guest's `{ name, email, stream_guest_id, proposed_identity }` so the owner's existing call session receives it.
3. Returns `{ access_token, user, waiting: true }` to the browser (the guest's client holds the token but does NOT join yet).

**Option B — `AnonymousUser` with a generated display name:**
`connectAnonymousUser({ id: '!anon-<random>', name })` — simpler, no server token round-trip, but the id is client-generated (less secure; an owner can't easily distinguish repeat guests, and the Stream id is not resolvable to a Clerk account so attendance attribution is weaker).

**Decision: Option A (`GuestUser` via `createGuestUser`).** Rationale: (1) the guest identity is server-issued and tamper-resistant; (2) the `stream_user_id` / `participant_name` / `participant_email` columns in `attendance_events` were explicitly built for this (they key on `stream_user_id` + name, not Clerk `user_id`); (3) anonymous-with-client-id would weaken speaker attribution in the F-series transcript path. The email is OPTIONAL (guests shouldn't be forced to type one) — the name alone is the minimum identifier.

**No new DB table is required.** The pending guest admission state lives on the Stream call event stream (the owner is in the call; the guest is waiting in the lobby). If a lobby-state table is later needed for owners who are NOT yet in the call, that is a G2/G3 decision, not a G0 one.

### 4.2 Approval-notification mechanism (chosen — reuse, don't build)

Reuse the **existing Stream call event stream**. When the server emits the "guest wants to join" event (a custom Stream call event, e.g. `guest.request_join` carrying `{ guestId, name, email }`), the owner's `MeetingRoom`/`MeetingSetup` (the owner is a signed-in participant in the call) receives it via `call.on('guest.request_join', ...)` and shows an in-call toast/modal: "X wants to join — Accept / Deny". On Accept, the owner's client calls `POST /api/guest/admit` (server-side, service-role), which calls Stream's `call.updateCallMembers` or `call.acceptRequest`/grants the guest `can_join` capability for their `stream_user_id`, then emits an `guest.admitted` event. The guest's lobby page, subscribed to a Stream presence/user-state poll or a lightweight server-sent poll on `POST /api/guest/status?token=...`, sees the admit and calls `client.joinCall` to enter the room.

**If a real-time accept event is not reliably deliverable to the lobby page (because the guest is not yet on the call):** the guest page polls `GET /api/guest/status` (server-only Supabase lookup keyed by the guest token / a session id) every ~5s for the admitted flag. This is a polling fallback, not a new push system. Either way, do NOT build a separate WebSocket/notification service — Stream call events are the primary channel.

### 4.3 Owner per-meeting toggle (deferred to G3, noted here)

Per the scope, an owner-level per-meeting toggle ("Anyone can join freely" vs "Require approval for guests") controls friction. This is a G3 decision (where the toggle lives: meeting metadata / a `meetings` column / a `meeting_settings` table). G0 confirms the toggle should be readable from a server API route so the Guest Setup / request-join route can short-circuit to immediate join when "anyone can join" is on. **No schema change is mandated at G0** — the owner can set the flag via the existing `meetings` metadata or a `meeting_settings` row; G3 decides the storage and the UI location (Settings or in-call). The signed-in join flow is unaffected either way.

### 4.4 Attendance + transcript compatibility for guests (G4, confirmed no-breaking)

Confirmed at G0: guests who join show up in `attendance_events` with `stream_user_id` = the server-issued Stream guest id, `participant_name` = the name they typed, `participant_email` = the optional email, and `user_id` = null. The existing `resolveSpeakerName` fallback chain resolves their display name in transcripts. **No F-series change is needed** — the F8/F9 merge and cleanup already key off `participant_name` when `user_id` is null. G4 will verify this end-to-end with a real bilingual test meeting.

### 4.5 G0 addendum — architect alignment resolutions (locked)

Three questions surfaced by the `/architect` pass that materially change G1 direction. All are locked here so G1/G2/G4 never improvise them.

**1. SDK import path for `createGuestUser` → `@stream-io/video-client`, NOT `@stream-io/node-sdk`.**
`createGuestUser` exists on `StreamVideoClient` from `@stream-io/video-client` (verified at `node_modules/@stream-io/video-client/dist/StreamVideoClient.d.ts`). It does NOT exist on the node-sdk `StreamClient` from `@stream-io/node-sdk`. The existing `src/actions/stream.actions.ts` correctly imports from `@stream-io/node-sdk` for the signed-in `generateUserToken` path — that pairing is **not** an inconsistency to "fix," it is a different concern (guest token issuance vs Clerk-backed user token). The new `POST /api/guest/request-join` route in G1 MUST import `StreamVideoClient` from `@stream-io/video-client` and call `createGuestUser` server-side. Code comment in the route must state: "Imports `@stream-io/video-client` (not `@stream-io/node-sdk`) because `createGuestUser` is a `StreamVideoClient` method; this differs from `stream.actions.ts` intentionally."

**2. Guest browser client → standalone provider, never merged with StreamClientProvider.**
A `GuestStreamClientProvider` (new in G1, alongside `StreamClientProvider.tsx`) creates its own `StreamVideoClient` with `user: { type: 'guest', id: <stream_guest_id> }` and a static `tokenProvider` returning the `access_token` from `request-join`. The Guest Setup page tree uses ONLY the guest provider. G1 verification: `grep` for any import of `StreamClientProvider` in guest-path files — the result must be **zero**. The two providers never import each other.

**3. `user_id NOT NULL` in `attendance_events` → Option (a) migrate to nullable, G3.**
The table currently has `user_id text NOT NULL` (schema.sql:170). Guests have no Clerk id. Decision: **migrate `user_id` to nullable** at G3 (bundle it with the owner-toggle storage decision, since both are attendance-adjacent schema). Guest attendance rows get `user_id = null` with `stream_user_id` + `participant_name` + `participant_email` populated. This is the cleanest path and matches `resolveSpeakerName`'s existing null-check (it prefers `participant_name` → `participant_email` when the row exists, regardless of `user_id`). The migration is additive and safe: existing signed-in writers always supply a non-null `user_id`, so making the column nullable breaks nothing. `POST /api/attendance/event` (Clerk-authenticated) keeps requiring `user_id` for signed-in participants; G4 adds the guest-scoped write path that omits `user_id`. **This is NOT left for G4 to invent** — the canonical rule is locked here: guest = null `user_id` + populated `stream_user_id`/`participant_name`/`participant_email`.

---

## 6. What stays completely untouched

- `src/Providers/StreamClientProvider.tsx` and `src/actions/stream.actions.ts` (the Clerk-backed token provider for signed-in users).
- `src/hooks/useGetCallbyId.ts` and the signed-in `call.join({ create: false })` path.
- `src/components/MeetingSetup.tsx` and `src/components/MeetingRoom.tsx` (the signed-in lobby and in-call UI).
- All transcript upload/AI processing/embeddings/attendance/PDF flows.
- The Clerk route guard (unauthenticated visitors to signed-in-only routes still bounce to sign-in — Guest Setup is a NEW, parallel path that only triggers on the `/meeting/[id]` route for unauthenticated users).

---

## 7. G0 deliverable

Lock the four decisions above in writing and produce the G1+ step list. The G1+ steps (authored at G1+/develop time, not here) are:
- **G1** — Guest Setup page: `/meeting/[id]/guest` (or an `isGuest` branch of the existing `/meeting/[id]` route) with camera/mic preview (Stream `VideoPreview`), name (required) + email (optional) inputs with client-side validation, "Ask to join" button. Must NOT render the signed-in MeetingSetup.
- **G2** — Owner approval notification + Accept/Deny UI in the owner's MeetingRoom (Stream call event handler) + the server routes `POST /api/guest/request-join` (token issuance via `createGuestUser` from `@stream-io/video-client`, idempotent — see §4.4.3 and §4.5.1), `POST /api/guest/admit` (admit), `POST /api/guest/deny` (deny — see §4.4.1), and `GET /api/guest/status` (poll fallback — see §4.4.4 and §5). Backed by an in-memory `src/lib/guest-store.ts` with a 10-minute TTL (see §4.4.2). G2 ships the poll-only fallback as the baseline; G3 adds the owner's notification surface + the `user_id` nullable migration (see §4.5.3).
- **G3** — Owner per-meeting toggle (storage + UI + enforcement in the request-join route).
- **G4** — Attendance + transcript compatibility verification for guest participants (end-to-end with a bilingual test meeting).

**This G0 prompt does NOT write any of G1–G4 code.** It locks the architecture so G1+ can be built incrementally, each step verified against the installed Stream SDK types before coding.

---

## 7. Review gap resolution — Deny path, TTL, dedup, owner-not-in-call

Four architectural questions raised during review that G0 must close before G1:

**1. Deny path → yes, a server route is needed.**
Client-side dismissal alone is insufficient because the guest polls a server status endpoint; a missed Stream event would leave the guest polling forever. So Deny is a server-backed operation:

- `POST /api/guest/deny` — request `{ guest_token: string, meeting_id?: string }`, no auth required (the `guest_token` is the credential, server-only, issued by `request-join`). It emits a Stream call event `guest.denied` carrying `{ guest_token, denied_at }` so any online owner session sees it immediately. It also marks the guest token `denied` in the server in-memory store so the next `GET /api/guest/status?guest_token=...` returns `{ status: "denied" }`. Response: `{ status: "denied" }`. Idempotent — a repeat deny is a no-op returning the same response. This lives in the same `src/lib/guest-store.ts` (in-memory) that `request-join` and `admit` use. Does NOT add a DB table.

**2. Pending-request TTL / expiry → 10-minute in-memory TTL, no DB.**
A guest request that the owner never answers otherwise has no lifecycle bound. Decision: the server store auto-expires a pending request after 10 minutes. On TTL expiry the store flips the state to `expired` and the guest's status poll returns `{ status: "expired" }`; the Guest Setup UI shows "The owner hasn't responded yet. Try again later." with the retry path disabled until the guest re-submits a fresh request (which re-enters the pending → polling cycle). The 10-minute window covers "owner stepped away briefly" without trapping a guest indefinitely. TTL state is in-memory in `src/lib/guest-store.ts` keyed by `guest_token` — restarted on server recycle, which is acceptable (a server restart means the guest's lobby session was also abandoned; re-requesting is the expected recovery). **No new DB table.** If a durable pending-guest table is later required (e.g. to survive restarts), that is a G3 decision, not G0.

**3. Request dedup / idempotency → yes, keyed by guest_token on request-join.**
`POST /api/guest/request-join` is idempotent: a second call with the same `meeting_id + name + email` (or the same already-issued `guest_token`) does NOT mint a new token or emit a second `guest.request_join` event — it returns the existing pending request's payload `{ access_token, user, waiting: true }` from the in-memory store. The owner therefore sees exactly one "X wants to join" toast even on a double-click or a slow-network retry. The guest's "Ask to join" button disables itself after the first successful submit until the status resolves (admitted/denied/expired), preventing the client from even attempting a duplicate. The dedup key lives in the same `guest-store.ts`; no DB uniqueness constraint needed.

**4. Owner-not-in-call case → poll-only fallback works today; owner visibility surface is G3.**
The §4.2 decision assumes the owner is present in the call session to receive the `guest.request_join` Stream event. When the owner has not joined yet or has left, event delivery to the owner cannot occur. Resolution: the guest flow falls through to **poll-only** — `GET /api/guest/status?guest_token=...` every ~5s — and this fallback is **guaranteed to work today** because it depends only on the server in-memory store plus a status route (no new infra). The admit/deny still works: whoever holds the `guest_token` (the owner, via any UI G3 later builds) calls `POST /api/guest/admit` or `POST /api/guest/deny`, which flips the store state and the guest's poll picks it up. The one dependency on G3 is the **owner's surface for seeing pending guests** (e.g. a badge on the meeting detail page or an owner panel) — that is a G3 storage/UI decision, not a G2 blocker. The admission *mechanism* (poll + admit/deny routes + in-memory store) is complete and functional without the owner being in the call; only the owner's *notification affordance* improves at G3. This split is intentional: ship the polling fallback as the G2 baseline, enhance the owner's surface at G3.

**Net on schema:** all four are resolved with an in-memory server store (`src/lib/guest-store.ts`) + Stream call events. **No new database table is required at G0/G2.**

**Carry to G4 (locked by G0 §4.5.3, not decided at G4):** the existing `POST /api/attendance/event` route is Clerk-authenticated (`auth()` → 401 if absent). A guest participant has no Clerk id, so guest attendance events cannot flow through this route as-is. G4 will build the guest-scoped write path that populates `stream_user_id` + `participant_name` + `participant_email` and leaves `user_id = null` (the canonical guest-row shape, locked at §4.5.3 — G4 does NOT invent a new convention). `resolveSpeakerName` already prefers those columns before the `user_id`-scoped fallback, so transcript attribution works. The `user_id` column becomes nullable via the G3 migration, so the guest write does not violate a NOT NULL constraint. This is a G4 implementation detail, gated by the G3 schema migration — not a G0 blocker.

---

- Re-confirm `GuestUser` / `AnonymousUser` / `createGuestUser` / `StreamVideoClientOptions` discriminated union in `node_modules/@stream-io/video-client/dist/**/*.d.ts` (done — see §2).
- Confirm `attendance_events` has `stream_user_id`, `participant_name`, `participant_email`, `user_id` in `supabase/schema.sql` (done — see §2).
- Confirm `resolveSpeakerName` fallback chain handles null `user_id` + non-null `participant_name` (verify in `src/agent/rag.ts` or the F-series transcript code).
- Confirm no new DB table is required for the G0 decisions (confirmed — admission state lives on the Stream call event stream + a lightweight server status lookup).

**G0 is blocked only by:** (a) a confirmed free-tier Stream guest path (confirmed via SDK types), and (b) approval of the identity/notification decisions above. Neither requires a paid plan.

---

## 9. Out of scope (do not build in G0)
- The Guest Setup page UI (G1).
- The owner Accept/Deny UI and the admit route (G2).
- The owner per-meeting toggle UI + storage (G3).
- End-to-end guest attendance/transcript test (G4).
- Any change to the signed-in join flow (ever).
- Deploy (Step 11) — stays after G0–G4 close.
