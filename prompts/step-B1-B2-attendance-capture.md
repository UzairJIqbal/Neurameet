# Step B1 + B2 — Auto Attendance Capture and Storage

**Skill context:** `/architect auto attendance capture and storage` (blueprint approved). Part of Layer 2 (Auto Attendance). B0 was the architect pass (this prompt is its approved output). Covers B1 (Supabase schema) + B2 (Stream SDK event tracking → DB). The PDF report (B3–B4) and its library choice are a SEPARATE feature (feature 7) and out of scope here.

## Goal
Record, per live meeting, one attendance session row per participant per join. The browser observes Stream call state (join, leave, mic on/off, camera on/off) through the existing `@stream-io/video-react-sdk` and forwards each event to a new server API route, which writes to a new `attendance_events` table via the service-role Supabase client. Reconnects close the current row and open a fresh one. Talk time = cumulative mic-enabled (unmuted) duration.

## Behavior (agreed in /architect)
- **Transport:** new `POST /api/attendance/event` route. Client posts events; server writes. Service role never reaches the browser.
- **Talk time:** cumulative unmuted duration, derived from mic toggle timestamps on the server (not actual speech).
- **Scope:** all participants (local + remote) for join/leave. Mic/camera toggle counts: local user guaranteed; remote best-effort (see nuance below).
- **Reconnects:** close + reopen a session row using Stream `session_participant_*` events.

## Final `attendance_events` schema
Add to `supabase/schema.sql` (append before or re-run the existing `GRANT` block so the new table is covered):

```sql
create table if not exists attendance_events (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references meetings(id) on delete cascade not null,
  user_id text not null,
  participant_email text,
  participant_name text,
  session_started_at timestamptz not null default now(),
  session_ended_at timestamptz,
  mic_toggles integer not null default 0,
  camera_toggles integer not null default 0,
  talk_time_seconds integer not null default 0,
  mic_enabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_attendance_events_meeting_id on attendance_events(meeting_id);
```

The existing `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;` already grants the new table as long as it runs AFTER this `create table`. Keep RLS OFF (Clerk auth, not Supabase auth — matches the header note in `schema.sql`).

## Implementation

### 1. API route — `src/app/api/attendance/event/route.ts` (POST)
- Use `currentUser()` from `@clerk/nextjs/server`; require a signed-in user, else `401`.
- Body (typed, no `any`): `{ stream_call_id: string; user_id: string; participant_email?: string; participant_name?: string; event_type: "join" | "leave" | "mic_on" | "mic_off" | "camera_on"; }`.
- **Timestamps: use server time** (`new Date().toISOString()`) for every write — do NOT trust a client-sent `at`. This makes talk-time deltas clock-skew safe.
- Resolve `meeting_id`: `supabaseServer().from("meetings").select("id").eq("stream_call_id", stream_call_id).single()`. If none → `404`.
- Helper `findOpenRow(meeting_id, user_id)` → select where `meeting_id`, `user_id`, `session_ended_at is null` order by `created_at desc limit 1`.
- Switch on `event_type` (every branch in try/catch, log failures, never throw to client):
  - `join` → if `findOpenRow` exists, return ok (idempotent). Else insert `{ meeting_id, user_id, participant_email, participant_name, session_started_at: now }`.
  - `leave` → row = `findOpenRow`; if none, return ok. Compute `delta` = `mic_enabled_at ? secondsBetween(now, mic_enabled_at) : 0`; update `{ session_ended_at: now, mic_enabled_at: null, talk_time_seconds: row.talk_time_seconds + delta, updated_at: now }`.
  - `mic_on` → row = `findOpenRow`; if none, insert a base row first (session_started_at = now). Update `{ mic_toggles: row.mic_toggles + 1, mic_enabled_at: row.mic_enabled_at ?? now, updated_at: now }`.
  - `mic_off` → row = `findOpenRow`; if none, return ok. If `mic_enabled_at` set, `delta = secondsBetween(now, mic_enabled_at)`; update `{ mic_enabled_at: null, talk_time_seconds: row.talk_time_seconds + delta, updated_at: now }`.
  - `camera_on` → row = `findOpenRow`; if none, insert base row. Update `{ camera_toggles: row.camera_toggles + 1, updated_at: now }`.
  - default → `400`.
- Return `NextResponse.json({ ok: true })` (or `{ ok: false }` on caught error) with appropriate status. Never surface raw errors.
- Use the server client `supabaseServer()` from `src/lib/supabase-server.ts` only.

### 2. Client capture hook — `src/hooks/useAttendanceTracking.ts` (`"use client"`)
- Pull `useCall()` + `useCallStateHooks()` (`useCallCallingState`, `useMicrophoneState`, `useCameraState`, `useParticipants`) and `useUser()` from `@clerk/nextjs`.
- `postEvent(event_type, identity)` → `fetch("/api/attendance/event", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ stream_call_id: call.id, user_id: identity.userId, participant_email: identity.email, participant_name: identity.name, event_type }) })`. Fire-and-forget with exactly one retry on failure; never block UI.
- **On mount while `callingState === JOINED`:** post `join` for the local user (idempotent on server). Then seed already-present remote participants (from `useParticipants()`) by posting `join` for each `userId !== localUser.id` (remote `participant_email` may be null — pass null, never fabricate).
- **Subscribe to Stream events** (call `.on(...)`, return cleanup in the effect):
  - `call.on("call.session_participant_joined", (e) => postEvent("join", identityFromEvent(e)))` and `call.on("call.session_participant_left", (e) => postEvent("leave", identityFromEvent(e)))` — these fire for BOTH local and remote and handle reconnects (close + reopen row). Extract `userId` / name / email from the event payload (verify exact field path against the installed `@stream-io/video-react-sdk` types during implementation).
  - **Local mic/camera:** a `useEffect` watching `useMicrophoneState().isMute` → transition to unmuted posts `mic_on`, to muted posts `mic_off`. Same pattern with `useCameraState().isCameraOn` → `camera_on`.
  - **Remote mic/camera (best-effort):** if `call.on("call.participant_updated", ...)` cleanly exposes a participant's audio/video enabled transition, diff previous vs new on-state and post `mic_on`/`mic_off`/`camera_on` for that remote `userId`. **Fallback (if the event shape is not clean):** skip remote device toggles and document that remote `mic_toggles`/`camera_toggles` may be 0; local-user device toggles remain guaranteed. Do not block the build on this nuance.
- Verify the exact Stream event-name strings (`session_participant_joined`, `session_participant_left`, `participant_updated`) against the installed SDK — the logic does not depend on which one fires for device toggles, only the local-state hook guarantees local device counts.

### 3. Wire into `MeetingRoom.tsx`
- `MeetingRoom.tsx` is already a client component (uses `useSearchParams`/`useState`). Call `useAttendanceTracking()` at the top of the component body.
- In the existing `OnLeave` handler (before `router.push("/")`), post `leave` for the local user. For the unmount path, post `leave` with `fetch(..., { keepalive: true })` to improve delivery when the room tears down.

### 4. Update `AGENTS.md` API Contracts
Add to the contract list so this path is not treated as invented later:
```
POST /api/attendance/event    → records a join/leave/mic/camera attendance event to attendance_events (service-role, server-only)
```

## Constraints (from AGENTS.md — never violate)
- Zero cost: no paid API, no paid PDF service here (PDF is B3). Supabase free tier only.
- All attendance writes via `supabaseServer()` from the API route — never the browser client, never the anon key.
- No RLS on the new table (Clerk auth). Service role bypasses RLS.
- No hardcoded hex / raw Tailwind color classes (this feature is mostly logic; if any UI hint is needed, use ui-tokens tokens).
- Verify Stream event names against installed SDK types; do not assume field shapes.
- Small functions, explicit types, `strict` TypeScript, no `any`.

## Verification (Beta tier: /check verify, then /test)
- `npx tsc --noEmit` clean; `npx next build` exit 0.
- Manual (Clerk OAuth may need manual driving): join a meeting → toggle mic/camera a few times → leave. Confirm in Supabase: one `attendance_events` row per participant per join, `session_started_at`/`session_ended_at` set, `talk_time_seconds` ≈ unmuted duration, `mic_toggles`/`camera_toggles` sane.
- Reconnect mid-meeting → a new row opens for that participant (old row kept with `session_ended_at`).
- On a meeting with no attendance, the table stays empty (no crash).

## After build (AGENTS.md rule)
Update `context/progress-tracker.md`, `context/ui-registry.md`, and mark `context/build-plan.md` Step B1 ✅ DONE and Step B2 ✅ DONE. The PDF report remains feature 7 / Step B3–B4, deferred.
