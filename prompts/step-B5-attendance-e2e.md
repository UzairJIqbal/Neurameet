# Step B5 — Auto Attendance: End-to-End Verification

## What we are building

Final end-to-end verification of the full Auto Attendance pipeline
(join → mic/camera toggle → leave → PDF download → confirm contents match).

Scope (decided with the user): **both** a live manual walkthrough and a
Playwright regression test for the flow.

## Stream SDK verification (done, noted here)

Before building, the `useAttendanceTracking.ts` Stream SDK assumptions were
checked against the installed SDK 1.40.2 type definitions (the Stream MCP tool
was not connected, so the package `.d.ts` files were used as the authoritative
source). All four assumptions matched:

1. Event names `call.session_participant_joined` / `call.session_participant_left` — exact match.
2. Payload `event.participant.user.id` / `.name` — valid type path.
3. `useMicrophoneState().isMute` — exists.
4. `useCameraState().isEnabled` — exists.

No hook changes were needed. The Playwright test therefore drives the **data
path** over HTTP (the capture route is a plain POST), which needs no live
WebRTC call. The real WebRTC event firing is covered by the manual walkthrough.

## Auth mechanism (already in place)

`tests/auth.setup.ts` already uses the Clerk testing token via
`@clerk/testing/playwright` (`clerkSetup()` + `clerk.signIn({ page, emailAddress })`)
against the dev test user `e2e-test@neurameet.dev`, then saves a shared
`storageState` to `tests/.clerk/e2e-auth.json`. B5 reuses that saved session
(the same pattern `e2e.spec.ts` uses) — no new auth wiring.

## Files changed

### 1. `playwright.config.ts` (edit)
Add a `chromium-attendance` project that matches `/attendance\.spec\.ts/`,
depends on `setup`, and reuses the shared `storageState` (same shape as
`chromium-auth`). This is required because the existing project testMatches
would not pick up a new `attendance.spec.ts`.

### 2. `tests/attendance.spec.ts` (new)
Single serial test, `test.use({ storageState: authFile })`:

- Generate a unique `streamCallId` (`b5-<ts>-<rand>`).
- Resolve the test user's Clerk `id` via `createClerkClient` (same helper
  `auth.setup.ts` uses) so the `user_id` sent in the event body matches the
  authenticated session — the report route owner-checks
  `meetings.user_id === clerkUserId`.
- POST (authenticated, via `page.request` which carries the session cookie)
  the sequence: `join`, `mic_on`, `camera_on`, `mic_off`, `leave`. All five
  events update one open `attendance_events` row.
- Resolve `meetingId` by GET `/api/meetings` and matching `streamCallId`.
- GET `/api/meetings/[id]` and assert `attendanceCount === 1`.
- GET `/api/attendance/report?meetingId=...` and assert:
  - `200`, `content-type: application/pdf`
  - `content-disposition` contains `attendance-report-<meetingId>.pdf`
  - body starts with `%PDF-`
  - raw bytes contain `B5 QA`, `b5@neurameet.dev`, `Participant`, `Camera`,
    `Total sessions: 1` (pdf-lib writes StandardFonts text as literal strings,
    so no PDF-parsing dependency is needed).
- UI check: navigate to `/meeting-intelligence/<meetingId>`, assert the
  attendance Download control is the **enabled `<a download>`** (correct `href`)
  — not the disabled `<button>`.

### 3. No app code changes
The pipeline routes (capture B2, report B3, download wiring B4) are already
built and were verified end-to-end by the user (both live checks passed). B5
only adds the regression test.

## Manual walkthrough (for the user — sandbox cannot drive live WebRTC)

1. `npm run dev`, sign in, start or join any meeting (or use Personal Room).
2. In the call, toggle mic on/off and camera on; then leave the call.
3. Go to Meeting Intelligence → that meeting → Overview tab.
4. Click **Download** on the Attendance Report card; confirm a PDF saves.
5. Open the PDF: confirm one row for you with correct Joined/Left times,
   Duration, Talk time, Mic and Camera toggle counts.
6. On a meeting with no attendance, confirm the Download button is disabled
   with text "No attendance recorded yet."

## Checks

- `npm run build` (app still builds; the test file is not part of the app build).
- User runs `npx playwright test` locally (needs Clerk + Supabase + Stream dev
  env in `.env.local`; the `setup` project creates the signed-in session).
- After build: STOP. Do not auto-sync context files (explicit `/sync` only).
