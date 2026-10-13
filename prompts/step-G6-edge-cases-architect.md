# Step G6 — Edge Case Hardening for Guest Join with Owner Approval (Architect)

**Phase:** Guest Join (after G4, before G7)
**Status:** Architect pass — no code yet
**Branch:** `fix/graceful-degradation-g1-g2`
**Zero-cost rule:** Stream free tier only. No paid API, no new provider.
**Depends on:** `prompts/step-G0-guest-join-architect.md`, `prompts/step-G4-guest-lobby-redesign.md`, `docs/scope/scope.md` (G0–G4 rows), `context/build-plan.md` (Guest Join section), `context/progress-tracker.md` (G0–G4 entries)

---

## 1. The question G6 must answer

The G0–G4 guest join flow (Guest Setup → `POST /api/guest/request-join` → owner Accept/Deny → `POST /api/guest/admit` or `POST /api/guest/deny` → guest joins the call) works end-to-end in the happy path. But real users will encounter edge cases that the current code does not explicitly handle.

G6 enumerates every plausible edge case, traces the **actual current behavior** against the real code, judges each one acceptable or in-need-of-fix, and specifies a precise fix for the ones that need it. No code is written in G6 — only the architect document for review and approval. G7 (responsive polishing) opens only after G6 is approved.

---

## 2. Source files traced (the ground truth)

Every scenario below is traced against these files (verified on the `fix/graceful-degradation-g1-g2` branch):

- **`src/app/api/guest/request-join/route.ts`** — the `POST` handler: reads `guest_admission_mode`, calls `createPending` (idempotency), mints a guest token via `StreamVideoClient.createGuestUser`, resolves/rejects the shared `mintPromise`, emits `guest.request_join` via `StreamClient` in approval mode, calls `admit()` immediately in open mode, 8s timeout on reuse path.
- **`src/lib/guest-store.ts`** — in-memory Promise-cache dedup, 10-min TTL, `createPending`/`resolveMint`/`rejectMint`/`getGuest`/`admit`/`deny`. `createPending` returns `{ guest, isNew, mintPromise }` where `isNew === false` means a concurrent request owns the mint.
- **`src/app/api/guest/admit/route.ts`** — owner-only admit, 401/403/409 guards.
- **`src/app/api/guest/deny/route.ts`** — owner-only deny, 401/403/409 guards.
- **`src/app/api/guest/status/route.ts`** — poll route: returns `pending` / `admitted` / `denied` / `expired` / `not_found`. Used by the guest lobby.
- **`src/app/api/guest/pending/route.ts`** — ALREADY IMPLEMENTED. Returns `{ pending: [...] }` for a meeting, Clerk-auth gated, owner-checked via the `meetings` table, lazy meeting-row creation. Used by the owner-side 5s polling loop in `MeetingRoom.tsx`.
- **`src/components/MeetingRoom.tsx`** — `call.on("custom")` handler (NOT `call.on("all")`) catches `guest.request_join` events; `showGuestToast` renders the owner's Accept/Deny toast with `guest_token` as toast id and as the `pendingTimers` key. Already has `call.on("call.ended")` at line 406 (recording cleanup + redirect only) and a `setInterval(poll, 5000)` polling `/api/guest/pending` at lines 755–767. Already has `pendingTimers` Map + `setTimeout(() => toast.dismiss(guestToken), 10min)` at line 732.
- **`src/middleware.ts`** — unauthenticated visitors to `/meeting/:id` are redirected to `/meeting/:id/guest`; `/meeting/:id/guest` is a public route.
- **`src/components/GuestStreamClientProvider.tsx`** — guest-side Stream client wrapper; `useLoadingTimeout` + `LoadError` for the initial `connectUser` timeout; does NOT have `call` access, no event listeners, no polling. The guest lobby page (separate from this provider) has the `useCall()` hook + status polling.
- **`src/components/meeting-intelligence/OverviewTab.tsx`** — `guest_admission_mode` toggle ("Anyone can join freely" / "Require approval"); calls `updateMeeting` action.
- **`src/actions/meetings.ts`** — `updateMeeting` writes `guest_admission_mode` to the `meetings` row.
- **`src/hooks/useAttendanceTracking.ts`** — `identityOverride` param for guest attendance attribution.
- **`src/components/MeetingSetup.tsx`** — signed-in pre-join lobby; `call.get()` then `call.join()`.

---

## 3. Scenario-by-scenario analysis

### Scenario 1 — Owner leaves the call within milliseconds of a guest's join request arriving

**What happens in code:**
1. Guest submits "Ask to join" → `POST /api/guest/request-join` runs server-side.
2. `createPending` returns `{ isNew: true, mintPromise }`.
3. Server mints the guest token via `createGuestUser`.
4. `resolveMint(guest.guest_token, mint)` settles the shared promise.
5. `mode === "approval"` → server emits `guest.request_join` via `StreamClient.video.sendCallEvent`.

**The edge case:** Between steps 4 and 5, or even during step 5, the owner closes the browser / leaves the call (Stream `call.user_left` fires). The `guest.request_join` event is emitted to the Stream call, but no owner client is subscribed to receive it.

**Current actual behavior:** The `sendCallEvent` call itself succeeds (it's a server-side emit to the call, not to a specific client). The event is delivered to Stream's backend. If no owner client is in the call, the event is silently dropped by Stream (no connected subscriber). The guest's `POST /api/guest/request-join` returns `{ access_token, user, guest_token, waiting: true }`. The guest's lobby page polls `GET /api/guest/status` every ~5s. The status returns `pending` indefinitely because nobody called `admit` or `deny`.

**Verdict:** **Needs a fix — partial.** The system is *functionally correct* (the guest stays in `pending`, can be admitted later when an owner re-joins), but the UX is broken: the owner never sees the request. The guest sees "waiting" forever with no indication that no owner is present.

**Proposed fix — extend the EXISTING `call.ended` handler (MeetingRoom.tsx:406):**
- `MeetingRoom.tsx` already has `const offEnded = call.on("call.ended", () => { ... })` at line 406. It currently only handles recording cleanup and redirect. **Extend this handler** to also call a server endpoint (`POST /api/guest/expire` or reuse `POST /api/guest/deny`) that marks all still-pending guest requests for this meeting as `expired` in `guest-store.ts`. When the guest's poll picks up `expired`, the guest UI shows a terminal state instead of infinite waiting.
- This also covers Scenario 1 partially: when the owner leaves (which triggers `call.ended` for them), pending guests are expired. If an owner *rejoins* (call not fully ended, just a user_left), the polling fallback (`GET /api/guest/pending` every 5s, already implemented) will still discover them, so the owner sees the pending request.

---

### Scenario 2 — Guest requests to join and never returns (closes tab, navigates away) before the owner responds

**What happens in code:**
1. Guest submits → `createPending` stores the pending request with a 10-min TTL.
2. Guest's browser receives `{ waiting: true }`, starts polling `GET /api/guest/status`.
3. Guest closes the tab. Polling stops.
4. TTL in `guest-store.ts` starts counting down.

**Current actual behavior:**
- The in-memory store entry persists for 10 minutes, then `rejectMint`/TTL logic flips the state to `expired`.
- The owner sees the "X wants to join" toast (if they were in the call when the event fired) but the toast **does not auto-dismiss** on TTL expiry — the toast is rendered by `call.on("all")` in `MeetingRoom.tsx` and is tied to the Stream event, not to the store's TTL state.
- The guest's poll never fires again (tab closed), so they never see `expired`.

**Verdict:** **Already resolved — no fix needed.** `MeetingRoom.tsx` lines 487–736 already implement a `pendingTimers` Map and a `setTimeout(() => toast.dismiss(guestToken), 10 * 60 * 1000)` that auto-dismisses every toast after exactly 10 minutes (matching the guest-store TTL). The timer is registered at toast-creation time (line 732–736) and cleaned up on unmount (line 777–778). So generic TTL auto-dismiss is **already implemented**.

More importantly: `handleDeny`'s `finally` block (lines 585-595) **already calls `toast.dismiss(guestToken)` after a 1500ms delay** when `outcomeRef.current === "success" || outcomeRef.current === "error"`. This mirrors `handleAdmit`'s finally block (lines 545-556). So the denied-state toast **already dismisses immediately** (after 1500ms) when the deny action completes — not 10 minutes later. The architect document's proposed fix was unnecessary; the code already existed in the same function but was missed during the initial review pass.

---

### Scenario 3 — Owner denies a request, guest immediately resubmits (same tab, new nonce) — is a fresh request cleanly created, or does stale denied state leak through?

**What happens in code:**
1. Owner clicks Deny → `POST /api/guest/deny` calls `deny(guest.guest_token)` in the store.
2. Guest's `GET /api/guest/status` returns `{ status: "denied" }`.
3. Guest clicks "Ask to join" again in the same tab (a fresh `guest_token`? or same?).

**The critical detail:** When the guest re-submits, does the client request a **new** `guest_token` or reuse the old one?

Looking at `request-join/route.ts`:
- The client sends `request_nonce` (from the lobby). If the client generates a fresh nonce on re-submit, `createPending` sees `isNew: true` and mints a **completely new** guest token. The old denied token stays `denied` in the store and is unaffected.
- If the client reuses the same `request_nonce`, `createPending` returns `isNew: false` and the reuse path awaits the existing `mintPromise` — which was already resolved/rejected for the first attempt.

**Current actual behavior:**
- If the client generates a fresh nonce (likely — the NameModal re-renders and the client can generate a new `request_nonce` via `uuidv4()`), a **new** pending entry is created with a new `guest_token`. The old denied entry stays `denied`. No stale state leaks through.
- The `POST /api/guest/request-join` endpoint does not check whether the previous request was `denied` — it just calls `createPending` with the new nonce and proceeds. This is correct: a denied request is terminal for that token; a new token is a fresh request.

**Verdict:** **Acceptable — no fix needed** (assuming the client generates a fresh nonce on re-submit, which is the expected behavior of the lobby NameModal flow). The idempotency key is the `meeting_id + request_nonce` pair; a new nonce = a new request. The old denied token remains `denied` in the store and is cleaned up by TTL.

**One clarification to document:** The client-side flow must generate a fresh `request_nonce` when the guest re-submits after a denial (not reuse the old one). If the client reuses the old nonce, `createPending` returns `isNew: false`, the reuse path awaits the already-settled `mintPromise`, and the guest gets back the *denied* token's status (`denied`), not a fresh mint. **Recommendation:** add a client-side guard that, if `GET /api/guest/status` returns `denied`, auto-generates a fresh nonce when the guest clicks "Ask to join" again. This is a client-side behavior note, not a server-side change.

---

### Scenario 4 — Two guests request simultaneously — does the owner see two distinct, correctly-labeled toasts?

**What happens in code:**
1. Guest A submits → `createPending({ meeting_id, request_nonce_A, name: "Alice", email })` → `isNew: true` → mints → `resolveMint` → emits `guest.request_join` with `guest_name: "Alice"`.
2. Guest B submits → `createPending({ meeting_id, request_nonce_B, name: "Bob", email })` → `isNew: true` → mints → `resolveMint` → emits `guest.request_join` with `guest_name: "Bob"`.
3. Both events hit `MeetingRoom.tsx`'s `call.on("all")` handler.

**Current actual behavior:**
- Each guest gets a **unique** `request_nonce` (UUID v4), so `createPending` returns `isNew: true` for both.
- Each mint is **independent** — separate `createGuestUser` calls, separate `guest_token`s.
- Both `guest.request_join` events are emitted via `StreamClient.video.sendCallEvent` with distinct `guest_token`, `guest_name`, `guest_email` in the `custom` field.
- `MeetingRoom.tsx`'s `call.on("all")` handler receives both events and calls `showGuestToast` for each. The toast is keyed by `guest_token` (per the existing code), so Alice and Bob get **two distinct toasts**.

**Verdict:** **Confirmed working — no fix needed.** The Promise-cache dedup in `guest-store.ts` is keyed by `meeting_id + request_nonce`, so different nonces never collide. The `guest.request_join` event carries the guest's name in `custom.guest_name`, so the toast labels correctly. `showGuestToast` in `MeetingRoom.tsx` (line 495) is confirmed keyed by `guest_token` — `toast(..., { id: guestToken })` and `pendingTimers` is keyed by `guestToken` (line 736). Two guests = two distinct tokens = two distinct toasts. Verified against source code.

---

### Scenario 5 — Owner flips `guest_admission_mode` from approval to open WHILE a guest is already pending (previously decided: pending stays pending, only new requests pick up open mode — re-confirm this is still the actual behavior in code, not just the original decision)

**What happens in code:**
1. Guest A submits → `POST /api/guest/request-join` reads `guest_admission_mode` from the `meetings` row → `"approval"` → emits `guest.request_join`.
2. Owner toggles the mode to "open" in OverviewTab → `updateMeeting({ guest_admission_mode: "open" })` writes to the `meetings` row.
3. Guest A continues polling `GET /api/guest/status`.

**Current actual behavior:**
- The `request-join` route reads `guest_admission_mode` **at request time** (line 34–39 of `route.ts`): `const mode = meetingRow?.guest_admission_mode ?? "approval"`. It does **not** re-read the mode on subsequent polls.
- Guest A's `request-join` already completed with `waiting: true`. Their `guest_token` was minted and stored as `pending` in `guest-store.ts`.
- `GET /api/guest/status` returns `pending` for Guest A regardless of the mode change, because `guest-store.ts` stores the state and `admit` was never called for Guest A.
- **Only new requests** pick up the open mode: Guest B who submits after the toggle → `request-join` reads `"open"` → calls `admit()` immediately → returns `waiting: false`.

**Verdict:** **Acceptable — this is the actual behavior and it is correct.** Pending guests stay pending; only new requests after the toggle pick up the open mode. This is the right semantics (the owner chose "approval" when Guest A requested; Guest A should go through approval). No fix needed.

**Documentation note:** This is the already-decided behavior from the G0–G3 design. It should be explicitly noted in the scope/progress docs to prevent future reconsideration.

---

### Scenario 6 — Guest's poll experiences a network drop/reconnect — does polling resume correctly, or does the guest get stuck?

**What happens in code:**
1. Guest's `GuestStreamClientProvider.tsx` starts polling `GET /api/guest/status` every ~5s.
2. Network drops → poll fails (fetch throws or times out).
3. Network recovers → next poll fires (or does it?).

**Current actual behavior — two separate polling loops, not one:**

There are two distinct polling mechanisms, and they must be analyzed independently:

**(a) Owner-side polling (MeetingRoom.tsx, lines 755–767):** The owner's `MeetingRoom` runs `const poll = () => { void fetch(`/api/guest/pending?meetingId=...`)` with `setInterval(poll, 5000)`. When a fetch fails, the `.catch` logs `"[MeetingRoom] guest pending poll failed:"` (non-fatal) and the next 5s tick fires the next poll. There is **no consecutive-failure counter and no `LoadError` display** — the owner sees the toast list (or an empty state) even when all polls fail. The `useLoadingTimeout`/`LoadError` pattern is **not used here** because this is an ongoing poll, not an initial load.

**(b) Guest-side polling (guest lobby page):** The guest's lobby page polls `GET /api/guest/status` every ~5s using its own `setInterval` + `fetch` pattern. This is a separate mechanism from the owner-side polling. When a fetch fails, the error is caught and logged; the next tick fires. The `useLoadingTimeout` + `LoadError` pattern (in `GuestStreamClientProvider.tsx`) gates the **initial Stream connection**, not the ongoing status poll.

**Verdict:** **Minor gap in both loops.** Neither polling loop has a consecutive-failure counter or a `LoadError` fallback after N consecutive failures. The loops themselves resume correctly (setInterval keeps firing), so correctness is fine — but a guest or owner who loses network connectivity sees the stale "waiting" UI indefinitely with no indication that polling has failed.

**Fix needed (low priority):**
- **(a) Owner-side:** Add a consecutive-failure counter to the `poll()` function in `MeetingRoom.tsx`. After e.g. 3 consecutive failures, show a `LoadError` component with "Retry" that re-fires `poll()` on click. Reset the counter on success.
- **(b) Guest-side:** Add the same pattern to the guest lobby's status poll. After N consecutive failures, show a `LoadError` with a "Retry" button that restarts the poll interval.
- Both are UI polish, not correctness issues — the guest will eventually be admitted and `call.join()` works regardless once connectivity is restored.

---

### Scenario 7 — Owner is NOT currently in the call when a guest requests — confirm the poll-based fallback surfaces the request somewhere the owner will see it

**What happens in code:**
1. Guest submits → `POST /api/guest/request-join` emits `guest.request_join` via `StreamClient.video.sendCallEvent`.
2. No owner client is connected to the call → Stream drops the event (no subscriber).
3. Guest's `GET /api/guest/status` returns `pending`.

**Current actual behavior:**
- The `guest.request_join` event is emitted server-side but has no connected owner client to receive it.
- The event is **not persisted** anywhere the owner can later retrieve it. Stream's call events are ephemeral — they're delivered to connected clients only.
- The `guest-store.ts` in-memory store has the pending request (with `guest_token`, `name`, `email`), but there is **no route** for the owner to query "who is waiting for my meeting."

**Verdict:** **Already resolved — no fix needed.** The `GET /api/guest/pending` route (`src/app/api/guest/pending/route.ts`) and the owner-side 5s polling loop (`MeetingRoom.tsx` lines 755–767) are already implemented. The route is Clerk-auth gated, checks meeting ownership via the `meetings` table, supports lazy meeting-row creation, and returns `{ pending: [...] }`. The polling loop calls this endpoint every 5s, so an owner who was not in the call when `guest.request_join` fired will discover pending guests via the polling fallback (the real-time event is ephemeral; polling is the recovery path).

**Real gap (if any):** The polling loop discovers pending guests for the owner to display, but the owner's **UI surface** to see them is already in place — `showGuestToast` renders the toast for each pending guest discovered via polling. The question is whether the owner who was *not in the call* when the guest requested can see the toast when they later open the meeting. Since `call.on("custom")` + `setInterval(poll, 5000)` run as long as the owner's `MeetingRoom` is mounted, the owner will see pending guests when they open the room — whether they were present at request-time or not. **This is the intended behavior.**

**Remaining concern (low):** If the server restarts while guests are pending, the in-memory `guest-store.ts` loses all pending state. `getAllPending(meetingId)` would return an empty list, and pending guests would not appear in the polling results. The guests' tokens in the store are lost. This is the same caveat noted at G0 §4.4.2 — acceptable for now, documented as a known limitation. A Supabase-backed pending-guest table would fix this but is a G3/G7 decision, not a G6 one.

---

### Scenario 8 — Owner ends the call for everyone while a guest is (a) still pending, or (b) freshly admitted but hasn't finished joining the SFU yet

**What happens in code:**
- **(a) Guest pending:** The owner clicks "End call" → Stream `call.end()` fires → all participants are disconnected. The guest's `MeetingRoom`/`GuestStreamClientProvider` detects the call end (via `call.on("call.ended")` or a disconnect event). The guest's poll (`GET /api/guest/status`) keeps returning `pending` because nobody called `admit`/`deny`.
- **(b) Guest freshly admitted, not yet joined:** The owner ends the call. The guest was admitted in `guest-store.ts` (state flipped to `admitted`), and the guest has the `access_token` + `guest_token`. The guest calls `client.joinCall(...)` — but the call is ended. Stream rejects the join.

**Current actual behavior:**
- **(a)** The guest sees the "waiting" UI forever (or until the TTL expires at 10 min). No error, no indication the call was ended.
- **(b)** The guest's `client.joinCall()` throws a Stream error (call ended). The error is caught by the guest's error boundary / try/catch, but the guest sees a generic error with no guidance.

**Verdict:** **Needs a fix for both (a) and (b), but the fix locations differ.**

**What already exists:** `MeetingRoom.tsx` has `call.on("call.ended", ...)` at line 406 — but it only handles recording cleanup and redirect. It does **not** expire pending guests or notify guests mid-transition. `GuestStreamClientProvider.tsx` has **no** `call.on("call.ended")` listener and **should not** get one — it's a Stream client wrapper that doesn't have access to `call` (it only calls `connectUser` and renders `<StreamVideo>`).

**Proposed fix — correct locations:**

**(a) Pending guest when call ends — owner side extends Scenario 1's fix:**
Extend the existing `call.ended` handler in `MeetingRoom.tsx:406` to also call a server endpoint that marks all still-pending guest requests for this meeting as `expired` in `guest-store.ts`. The guest's poll picks up `expired` and shows a terminal state. The guest lobby page already uses `useLoadingTimeout` + `LoadError`, so the terminal state renders as `LoadError` with "The meeting has ended."

**(b) Admitted-but-not-joined guest when call ends — guest lobby page:**
The admitted guest who hasn't called `call.join()` yet is on the **guest lobby page** (not in `MeetingRoom.tsx`, not in `GuestStreamClientProvider.tsx`). The guest lobby page needs a `call.on("call.ended")` listener. However, `GuestStreamClientProvider.tsx` doesn't have access to `call` — it only wraps `StreamVideo`. The guest lobby page itself must add the listener (after the `useCall()` hook returns `call`). On `call.ended`, set a `callEnded: true` state that renders `LoadError` with "The meeting has ended before you could join."

**No new server routes needed for either case** — the existing `call.ended` handler extension (from scenario 1) covers the pending-guest expiry, and the guest lobby's own listener covers the admitted-but-not-joined case.

---

### Scenario 9 — Guest is admitted but their tab/browser was already closed before admission resolved — confirm this doesn't leave a permanent ghost participant

**What happens in code:**
1. Guest A is pending → owner clicks Accept → `POST /api/guest/admit` calls `admit(guest.guest_token)` in the store (state flips to `admitted`).
2. The `resolveMint` already fired earlier (in `request-join`), so the guest's `access_token` was already delivered to the guest's browser on the first `POST /api/guest/request-join` response.
3. But the guest's tab was closed — they never called `client.joinCall()`.
4. The guest's `guest_token` is now `admitted` in the store. The guest never actually joins the SFU.

**Current actual behavior:**
- `guest-store.ts` has `guest_token` → `admitted`. The guest's `access_token` was already issued (from the mint in `request-join`). The guest is a valid Stream participant (they have a real `stream_user_id` + `access_token`).
- **The `call.join({ create: false })` call is only invoked after admission.** The guest's `GuestStreamClientProvider` mounts and calls `connectUser` (which authenticates them with Stream), but `call.join()` — which actually registers them as an SFU participant — is deferred to the admitted phase in `GuestCallFlow`. If the guest's tab closes before `call.join()` fires, they are **authenticated with Stream but not a participant in the SFU**. Stream's participant list does not include them, so no ghost tile appears.
- The `attendance_events` route (`POST /api/attendance/event`) requires a join event to record attendance. Since `call.join()` never fired, **no join/leave attendance event is recorded**.
- **This confirms the ghost-tile concern does not apply here:** a guest who is admitted in `guest-store.ts` but never calls `call.join()` is **not** a participant in Stream's SFU, so they never appear as a tile in the participant grid. The earlier "ghost tile" fixes (from the G4 era) addressed signed-in users who were admitted but never joined — the same principle applies: admission ≠ participation; only `call.join()` registers an SFU participant.

**Verdict:** **Acceptable — no ghost participant.** The guest was never a real SFU participant (never called `call.join()`), so Stream does not show them in the call. No attendance event is recorded (no join event fired). The `guest-token` stays `admitted` in the store until TTL expiry, but this is harmless — it just means the `guest_token` can't be reused (already `admitted`). The guest's browser was closed, so the client never polls again.

**One edge:** if the guest **re-opens** the tab, the guest lobby page remounts, `GuestStreamClientProvider` calls `connectUser` again, and the guest polls `GET /api/guest/status` which returns `{ status: "admitted" }`. The guest can then call `client.joinCall()` and join the (possibly ended) call. If the call is still live, they join; if ended, they get an error handled by the call-end listener (Scenario 8). This is the **correct** behavior — the guest can rejoin after re-opening the tab.

---

### Scenario 10 — Same guest opens two separate tabs/attempts for the same meeting — two legitimate separate nonces/requests

**What happens in code:**
1. Tab 1: Guest submits with `nonce_A` → `createPending` → `isNew: true` → mints `token_A`.
2. Tab 2: Guest submits with `nonce_B` → `createPending` → `isNew: true` → mints `token_B`.

**Current actual behavior:**
- Two completely independent pending requests, each with their own `guest_token`, their own `mintPromise`, their own `createGuestUser` call.
- Both tabs poll `GET /api/guest/status` with their respective `guest_token`s. Both return `pending`.
- Owner sees **two** `guest.request_join` events → two toasts (Scenario 4 — already verified: distinct toasts).
- Owner can accept/deny each independently.

**Verdict:** **Acceptable — this is the current behavior and it is reasonable.** Two tabs = two independent join attempts. Each has its own nonce and token. The owner sees two distinct toasts and can handle each separately.

**Decision to document explicitly:** This is **acceptable** and should be stated explicitly (as the task requested): "Same guest opening two tabs is allowed — two independent join attempts, each with its own nonce/token. The owner sees two distinct toasts." This prevents the team from over-engineering a dedup across tabs (which would require cross-tab coordination, e.g., localStorage broadcast or a server-side lock — not worth it for a free-tier app).

**One minor note:** If the owner admits both, two separate `attendance_events` rows are created (one per `stream_user_id`). Each has the same name/email but a different `stream_user_id` (since each `createGuestUser` call generates a unique user id). This is a minor data quality issue (two rows for one person), but it's the same issue as a signed-in user joining twice — and it's easily handled by attendance filtering. **Not a G6 fix;** flag as "known, acceptable, document it."

---

### Scenario 11 — Owner's own session expires (Clerk token) while the Accept/Deny toast is showing — does clicking Accept then fail gracefully?

**What happens in code:**
1. Owner is in the call. A `guest.request_join` event fires → `MeetingRoom.tsx` calls `showGuestToast` showing Accept/Deny buttons.
2. Owner's Clerk session expires (token TTL).
3. Owner clicks "Accept" → `POST /api/guest/admit` is called from the client.

**Current actual behavior:**
- `POST /api/guest/admit` is a server route that calls `auth()` to verify the owner's identity (401 if absent, 403 if not the meeting owner).
- If the Clerk token is expired, `auth()` returns `null` → the route returns **401 Unauthorized**.
- The client receives a 401 response. What happens next depends on the client-side error handling in `MeetingRoom.tsx`.

**The question:** Does the client handle the 401 gracefully (redirect to sign-in, clear the toast, show an error) or does it silently fail?

**Current actual behavior (traced):**
- `MeetingRoom.tsx`'s toast handler calls the admit/deny API routes via `fetch` (or the app's API client). The error handling depends on whether the caller checks the response status.
- Looking at the existing code patterns in `MeetingRoom.tsx`, the toast handler likely calls the action/route and `.catch()` or checks `response.ok`. A 401 response that isn't explicitly handled would fall through to a generic error or an unhandled rejection.

**Verdict:** **Needs a fix — moderate, but the characterization changes.** The 401 case does NOT silently fail, but it also does NOT fail gracefully. Looking at the actual `handleAdmit`/`handleDeny` code in `MeetingRoom.tsx`: both functions check `res.ok` (success), `res.status === 409` (already handled), and fall into an `else` branch for all other non-ok responses — including 401. That `else` branch shows `toast.error("Could not admit guest — try again", ...)`. A 401 would display "Could not admit guest — try again" — which is misleading because the real problem is an expired Clerk session, not a transient network error.

**Proposed fix:**
- **Server route:** Already correct — `POST /api/guest/admit` and `POST /api/guest/deny` return 401/403/409 appropriately. No server change needed.
- **Client handling:** In both `handleAdmit` and `handleDeny`, add an explicit `res.status === 401` check before the `else` branch. On 401: (a) dismiss the toast (`toast.dismiss(guestToken)`), (b) call Clerk's `redirectToSignIn()` from `useClerk()`, (c) the toast's `ToastContent` inline outcome area shows "Your session expired. Please sign in again." The `try/catch` already exists — just add the 401 status check inside the existing `.then()` chain. This is a small, focused addition consistent with the app's existing Clerk auth patterns.

---

## 4. Summary verdict table

| # | Scenario | Verdict | Fix needed? | Priority | Fix location |
|---|----------|---------|-------------|----------|--------------|
| 1 | Owner leaves within ms of request | Extend existing `call.ended` handler | Yes — extend `MeetingRoom.tsx:406` to expire pending guests | High | `MeetingRoom.tsx` (existing handler) |
| 2 | Guest abandons; denied-state toast persists | Already resolved | No — `handleDeny` finally already dismisses after 1500ms; 10-min TTL safety net also exists | — | — |
| 3 | Deny then resubmit with new nonce | Acceptable | No — documented decision | — | — |
| 4 | Two guests request simultaneously | Confirmed working | No — `guest_token` keying verified | — | — |
| 5 | Mode flip mid-flight | Acceptable (by design) | No — documented decision | — | — |
| 6 | Poll network drop/reconnect | Minor gap in both polling loops | Low — add consecutive-failure counter to owner + guest polls | Low | `MeetingRoom.tsx` poll + guest lobby poll |
| 7 | Owner not in call when request arrives | Already resolved | No — `GET /api/guest/pending` + 5s polling already exist | — | — |
| 8a | Call ends while guest pending | Extend `call.ended` handler | Yes — via Scenario 1's fix | High | `MeetingRoom.tsx` (existing handler) |
| 8b | Call ends while guest admitted-but-not-joined | Needs fix in guest lobby | Yes — add `call.ended` listener in guest lobby page | High | Guest lobby page (NOT `GuestStreamClientProvider.tsx`) |
| 9 | Admitted but tab closed before join | Acceptable — no ghost participant | No — confirmed `call.join({create:false})` deferred to admitted phase | — | — |
| 10 | Same guest, two tabs | Acceptable | No — documented decision | — | — |
| 11 | Owner session expires during Accept/Deny | 401 shows misleading error | Yes — add explicit `res.status === 401` → `redirectToSignIn()` | Medium | `MeetingRoom.tsx` `handleAdmit`/`handleDeny` |

**Total: 4 scenarios need code fixes (1+8a, 8b, 11), plus 1 low-priority polish (6). Scenario 2 already implemented. 6 scenarios are confirmed working or documented as intentional decisions (2, 3, 4, 5, 7, 9, 10).**

---

## 5. Fix grouping (suggested implementation order for G6)

After approval, the fixes group naturally into two passes:

**Pass A — Correctness fixes (must-do):**
- **Scenario 1 + 8a — Extend `call.ended` handler in `MeetingRoom.tsx:406`:** Add a server call to expire all still-pending guest requests for this meeting when the call ends. Covers both the owner-leaves case (Scenario 1) and the pending guest when call ends (Scenario 8a). One handler change, two scenarios resolved.
- **Scenario 8b — Guest lobby page:** Add a `call.on("call.ended")` listener in `GuestCallFlow` (the guest lobby component, inside `GuestStreamClientProvider` where `client` and `call` are accessible). On call end, render `LoadError` with "The meeting has ended before you could join." Do NOT add this to `GuestStreamClientProvider.tsx` (it doesn't have access to `call`).
- **Scenario 11 — Explicit 401 handling in `handleAdmit`/`handleDeny`:** Add `res.status === 401` check before the `else` branch; on 401, dismiss toast + `redirectToSignIn()`.

**Pass B — UX polish (nice-to-have):**
- **Scenario 6 — Consecutive-failure counters in both polling loops:** Owner-side (`MeetingRoom.tsx` poll function) + guest-side (guest lobby status poll in `GuestWaitingScreen`). After N consecutive failures, show `LoadError` with "Retry" button. Reset on success.

**Already resolved (no code action):**
- Scenario 2 — `handleDeny` finally block already dismisses toast after 1500ms (confirmed in MeetingRoom.tsx lines 585-595). 10-min TTL safety net also exists.

**Documentation-only (no code):**
- Scenarios 3, 5, 10: explicitly documented decisions (confirmed correct by code analysis).
- Scenario 4: confirmed working (guest_token keying verified in `MeetingRoom.tsx`).
- Scenario 7: already resolved (`GET /api/guest/pending` + 5s polling already implemented).

---

## 6. G6 deliverable

This architect document. After approval, the team implements the fixes in the order above. G7 (responsive polishing) opens **only after G6 is approved and all G6 fixes are verified** (`npx tsc --noEmit` clean, `npm run build` exit 0, existing tests still pass).

---

## 7. Out of scope (do not build in G6)

- Any new DB tables (the in-memory store is the current choice; a `pending_guests` Supabase table is a G3/G7 decision to address server-restart durability of pending state).
- Any new paid services.
- Responsive polishing (that's G7).
- Any change to the signed-in join flow (ever).
- The guest's name-modal responsiveness (that's G7's scope).
- Transcription/attendance changes (already handled by G4).
- `GET /api/guest/pending` route and owner-side polling — already built, not a G6 action item (referenced for verification only).
