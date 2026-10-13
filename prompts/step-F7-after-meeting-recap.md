# Step F7 — After-Meeting Recap Page

**Skill context:** `/architect afterMeeting recap page` (blueprint approved this session). Builds on the transcript generation capability delivered in F1–F5 (the `POST /api/transcript/generate` route and the idle/generating/done/exists/too_short/failed state machine). This step gives that capability a proper post-call home and adds a post-meeting redirect for every participant. Out of scope: changing the transcript generation internals (ffmpeg/Groq) — those are frozen from F1–F5.

## Goal
Add a new public post-call recap page at `/after-meeting/[id]`. When a meeting ends (owner ends the call, or any participant leaves), every participant is routed there instead of home. The page shows the meeting title, description, total duration, and the participant list, plus a **Generate Transcript** button. The button is enabled only for signed-in users; a logged-out visitor who clicks it is prompted to sign in and redirected to the Clerk sign-in page (with a return URL back to this page). Generate Transcript is moved off the Recording tab.

## Behavior (agreed in /architect)
- **Route:** new standalone public route `src/app/after-meeting/[id]/page.tsx`, rendered OUTSIDE the `(root)` sidebar group (it is a post-call landing, readable while logged-out). It reuses `GET /api/meetings/[id]` for meeting data and queries `attendance_events` for the participant list.
- **Redirect trigger:** in `MeetingRoom.tsx`, `OnLeave` routes to `/after-meeting/[id]` instead of `/`. Additionally add a `call.on("call.ended", ...)` listener that routes any remaining participants to the same page when the owner ends the call. (Both paths confirmed against the installed SDK: `call.ended` event exists.)
- **Fields shown:**
  - **Title** — `meetings.title` (already in `MeetingDetailData`).
  - **Description** — extend `GET /api/meetings/[id]` to return `description` (source: the Stream call `custom.description`, which `MeetingModel.tsx`/`PersonalRoomPage.tsx` already set at creation; fall back to `""`). `MeetingDetailData` currently has NO description field — add it.
  - **Total time** — `endedAt − startedAt` (both ISO strings on `MeetingDetailData`); render `mm:ss` or `Xh Ym`; `—` if either is null.
  - **Participants** — distinct list from `attendance_events` for the meeting (`participant_name` → fallback `participant_email` → `"Unknown"`), with join/leave times where available.
- **Generate Transcript button (moved here):**
  - Enabled only when `useUser().isSignedIn` is true.
  - Logged-out visitor clicking it → `useClerk().redirectToSignIn({ returnBackUrl: window.location.pathname })` (sends them to Clerk sign-in, then back to `/after-meeting/[id]`).
  - Signed-in click → `POST /api/transcript/generate` with the same body shape used by `RecordingTab.tsx` (`meetingId`, `streamCallId`, `streamCallType: "default"`), reusing the exact idle/generating/done/exists/too_short/failed states + toasts.
  - **Authz (server stays owner-only):** the existing route enforces `meetings.user_id === userId`. A signed-in non-owner who clicks gets a clear `"Only the host can generate a transcript"` toast (no crash). (Decision D3 default = owner-scoped; relax only if the user later asks.)
- **Recording tab:** remove the Generate Transcript button from `src/components/meeting-intelligence/RecordingTab.tsx`. The tab keeps playback only.

## Security constraints (unchanged, must hold)
- No secrets (`SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, `STREAM_SECRET_KEY`, `CLERK_SECRET_KEY`) ever reach the browser. The recap page is display-only; generation stays in the server route.
- The logged-out gate is UX only — the server route remains the real enforcement (401 if unauthenticated, owner-check if authenticated).
- No hardcoded hex / raw Tailwind color classes — use the design tokens already in the project.

## Implementation

### 1. Extend `GET /api/meetings/[id]` (server route)
- Add `description` to the returned `meeting` object (read from the Stream call `custom.description` via the Stream server client, or from a `meetings.description` column if present; fallback `""`).
- Add a `participants` array to `MeetingDetailResponse` (distinct `attendance_events` rows: `name`, `email`, `joinedAt`, `leftAt`).
- Update `MeetingDetailData` and `MeetingDetailResponse` in `src/lib/meeting-types.ts` accordingly.
- Keep `runtime = "nodejs"` (uses `supabaseServer()` + Stream server client).

### 2. Create `src/app/after-meeting/[id]/page.tsx`
- Server component: read `params.id`, fetch meeting + participants (reuse the extended API logic directly server-side, not via HTTP). Handle missing meeting → friendly "Meeting not found".
- Render a client sub-component `<AfterMeetingRecap meeting={...} participants={...} />` for the interactive button/auth.
- Outside `(root)` layout: no sidebar; standalone centered layout using tokens.

### 3. Build `AfterMeetingRecap` client component
- Header: title (token `text-on-surface`), description (`text-on-surface-variant`).
- Stat row: Total time, Participant count.
- Participant list: name/email + join–leave where present.
- Generate Transcript button: identical styling/tokens to the old `RecordingTab` button; wire `useUser()` + `useClerk()`; logged-out → `redirectToSignIn`; signed-in → `POST /api/transcript/generate` with the F1–F5 state machine + toasts.
- A link back to the full Meeting Intelligence detail (`/meeting-intelligence/[id]`) for users who want tabs/insights.

### 4. Remove button from `RecordingTab.tsx`
- Delete the Generate Transcript button + its `gen` state/`handleGenerate` logic. Keep recordings list + Play.

### 5. Wire redirect in `MeetingRoom.tsx`
- `OnLeave` (line ~204): `router.push(\`/after-meeting/${call.id}\`)` instead of `router.push("/")`.
- Add `useEffect` with `call.on("call.ended", () => router.push(\`/after-meeting/${call.id}\`))` (clean up on unmount). Guard against double-navigation.

## Verify (manual)
- Create + join a meeting, end it (owner) → all participants land on `/after-meeting/[id]`.
- Page shows title, description, total time, participant list.
- Open the link logged-out → page renders, but clicking Generate Transcript redirects to Clerk sign-in, then back to the page.
- Logged-in owner clicks Generate Transcript → transcript generates; button shows done/exists states; Summary/Action Items/Category/RAG populate as in F1–F5.
- Logged-in non-owner clicks → "Only the host can generate" toast; no generation.
- Recording tab no longer shows the Generate Transcript button (playback only).
- `npx tsc --noEmit` clean and `npm run build` exit 0.

## Context files to update (after build, per AGENTS.md)
- `docs/scope/scope.md` — add F7 row (planned → done), mark Build it / Verify it.
- `context/progress-tracker.md` — note F7 complete.
- `context/architecture.md` — meeting lifecycle: call end now routes to `/after-meeting/[id]`.
- `context/ui-registry.md` — register the new route + recap component; note Generate Transcript moved off Recording tab.
- `AGENTS.md` only if the meeting-lifecycle description there needs it (likely not).
