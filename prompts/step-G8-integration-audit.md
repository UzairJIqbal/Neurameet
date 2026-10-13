# Step G8 — Guest Join Integration Audit

> **Phase**: Guest Join (Steps G0–G1.5, G2–G4, G7 done)
> **Workflow tier**: Alpha (`/check verify`, `/test`)
> **Status**: planned
> **Output**: this document — audit only, no fix code yet
> **Date**: 2026-09-06
> **Branch**: `fix/graceful-degradation-g1-g2`

## At a glance

| Area | Classification | Fix needed? |
|------|---------------|-------------|
| A1. After-meeting recap | Mixed — 3 bugs found | Yes |
| A2. Attendance reports/dashboard | Mostly correct | Minor |
| A3. Transcript generation output | Correctly handles guests | No |
| A4. Participant list/avatar components | Mixed — 2 issues found | Yes |
| A5. Email/notification features | Critical gap | Yes |
| A6. Export features (PDF/CSV/calendar) | Correctly handles guests | No |
| A7. Search functionality | Correctly handles guests (by design) | No |

---

## A1. After-meeting / meeting recap page

**What displays participant data:**
- `src/components/meeting-intelligence/AfterMeetingRecap.tsx` renders `p.name`, `p.email`, presence duration, talk time for each participant.
- Data source: `getMeetingRecap()` → `mergeAttendanceParticipants()` in `src/lib/attendance-merge.ts`.

### A1.1 — `mergeAttendanceParticipants()` collapses all guest-null-`user_id` rows into one entry

- **File**: `src/lib/attendance-merge.ts` line 46
- **Evidence**: `const existing = byUser.get(row.user_id)` — the map key is `row.user_id`. For guests whose `attendance_events.user_id` is `NULL` (post-G3 migration), ALL guest rows collapse into a single entry keyed by `null`/`undefined`. Multiple guests appear as one merged participant.
- **Classification**: **breaks or misrepresents guests**
- **Fix description**: Change the grouping key to use a composite key: `row.user_id ?? row.participant_email ?? row.participant_name`. This ensures each guest with a distinct email or name gets their own entry. The `userId` field on `RecapParticipant` can remain nullable or fall back to the composite key.

### A1.2 — `GET /api/meetings/[id]` returns 404 for guests

- **File**: `src/app/api/meetings/[id]/route.ts` lines 63–77
- **Evidence**: The auth check does `.eq("user_id", userId)` on `attendance_events`. For a guest whose `user_id` in `attendance_events` is NULL (post-G3 migration), this query NEVER matches. The guest gets `{ error: "Meeting not found" }` with status 404.
- **Classification**: **breaks or misrepresents guests**
- **Fix description**: Change the attendance lookup to also match on `stream_user_id` or `participant_email` when `user_id` is NULL. Specifically, change the query to: `.in("user_id", [userId]).or("stream_user_id.eq.{streamUserId},participant_email.eq.{email}")`. Alternatively, relax the `eq("user_id", userId)` to also check `stream_user_id` for the caller's Stream ID. The `api/meetings/by-call/[callId]` route could also be used to look up the meeting by Stream call ID instead of Clerk user ID.

### A1.3 — `AfterMeetingRecap.tsx` itself correctly handles guests

- **File**: `src/components/meeting-intelligence/AfterMeetingRecap.tsx` lines 315–397
- **Evidence**: Renders `p.name`, `p.email`, talk time from `recap.participants`. Names come from `attendance_events.participant_name` which stores the guest's display name. The `isOwner` check is NOT done on the recap page — it explicitly allows anyone with the link to view it.
- **Classification**: **correctly handles guests**
- **Note**: The recap page is accessible to guests (no Clerk auth required). The bugs are in the data layer (A1.1) and the API auth gate (A1.2), not in the component itself.

### A1.4 — `api/attendance/event/route.ts` & `useAttendanceTracking` block guest attendance recording

- **File**: `src/app/api/attendance/event/route.ts` lines 66–70, `src/hooks/useAttendanceTracking.ts` lines 63, 103, 185–192
- **Evidence**: Guest attendance events fail to record due to three sequential root causes in the pipeline:
  1. **Server Auth Gate (401)**: `POST /api/attendance/event` line 66 executes `const { userId: authUserId } = await auth();`. For unauthenticated guests, `authUserId` is `null`, so line 69 returns `401 Unauthorized` before reaching body validation (line 85).
  2. **Client Hook Timing Race**: `useAttendanceTracking` line 63 sets `userId: localParticipant?.userId ?? ""`. When `CallingState.JOINED` first fires, `localParticipant` is undefined, so `userId` evaluates to `""`. Line 103 `if (!identity.userId) return;` drops the join request, while line 188 sets `localJoinHandled.current = true`, preventing future retries once `localParticipant` resolves.
  3. **Database Query `NULL` Handling**: `findOpenRow()` line 228 uses `.eq("user_id", user_id)`. For guests with `user_id = null`, PostgREST generates `user_id = NULL`, which returns 0 rows (does not match NULL).
- **Classification**: **breaks or misrepresents guests**
- **Fix description**: Remove the mandatory Clerk `auth()` check on `/api/attendance/event` for payloads carrying guest identities (`stream_user_id` / `participant_email` / `participant_name`); fix `useAttendanceTracking` to resolve guest `userId` reliably before setting `localJoinHandled`; and update `findOpenRow`/`createRow` in `route.ts` to query by `stream_user_id` when `user_id` is NULL.

---

## A2. Attendance reports/dashboard

**What displays participant data:**
- `src/app/api/attendance/report/route.ts` queries `attendance_events` for `participant_email`, `participant_name`, `session_started_at`, `session_ended_at`, `mic_toggles`, `camera_toggles`, `talk_time_seconds`.
- `src/lib/attendance-pdf.ts` renders the PDF with `displayName()` using `row.participantName?.trim() || row.participantEmail?.trim() || "Unknown"`.
- `src/components/meeting-intelligence/OverviewTab.tsx` shows only `attendanceCount` (a number).

### A2.1 — Attendance PDF report correctly handles guests

- **File**: `src/app/api/attendance/report/route.ts` lines 61–68, `src/lib/attendance-pdf.ts` lines 45–47
- **Evidence**: The query selects all `attendance_events` columns without filtering on `user_id`. The `displayName()` function falls back to email then "Unknown". Guests with `participant_name` and `participant_email` in their `attendance_events` row appear correctly.
- **Classification**: **correctly handles guests**

### A2.2 — Engagement tab correctly handles guests

- **File**: `src/app/api/engagement/route.ts` lines 136–183
- **Evidence**: Speakers are keyed by `row.user_id || row.participant_email || row.participant_name || "unknown"`. The fallback chain handles guests. Names come from `normalizeSpeakerName(row.participant_name)`.
- **Classification**: **correctly handles guests**

### A2.3 — Overview tab silently omits guests (by design)

- **File**: `src/components/meeting-intelligence/OverviewTab.tsx`
- **Evidence**: Only shows `attendanceCount` — a number. No individual participant names. The count includes guests (from `attendance_events` query).
- **Classification**: **silently omits guests** (acceptable — no individual identity displayed, only a count)

### A2.4 — Follow-up list/details correctly handle guests

- **File**: `src/components/follow-ups/FollowUpList.tsx`, `src/components/follow-ups/FollowUpDetails.tsx`
- **Evidence**: Display `fu.actionTitle`, `fu.meetingTitle`, `fu.assignee`. The `assignee` field is a plain string, not a Clerk user ID. No participant identity is rendered.
- **Classification**: **correctly handles guests** (by omission — no participant identity to misrepresent)

### A2.5 — `api/attendance/event/route.ts` & client hook block guest attendance (same root cause as A1.4)

- **File**: `src/app/api/attendance/event/route.ts` lines 66–70, `src/hooks/useAttendanceTracking.ts` lines 63, 103
- **Evidence**: Same authoritative root cause as A1.4 — server `auth()` returns 401 for guests, client hook timing drops initial `join` POST when `userId` is `""`, and SQL `.eq("user_id", null)` fails to match open rows.
- **Classification**: **breaks or misrepresents guests**
- **Fix description**: Same as A1.4 — allow unauthenticated POSTs when valid guest payload parameters are present, fix client hook guest identity resolution, and query by `stream_user_id` when `user_id` is NULL.

---

## A3. Transcript generation output

**What displays participant data:**
- `src/app/api/transcript/download/route.ts` generates merged speaker-labeled transcripts.
- `src/agent/transcript-generation.ts` resolves speaker names via `resolveSpeakerName()` (lines 294–339).

### A3.1 — Transcript download correctly handles guests

- **File**: `src/app/api/transcript/download/route.ts`, `src/agent/transcript-generation.ts` lines 294–338
- **Evidence**: `resolveSpeakerName()` looks up `attendance_events` for `participant_name` and `participant_email` matching the `streamUserId` parsed from recording filenames. Guest names stored in `attendance_events.participant_name` (from the guest's `identityOverride` in `useAttendanceTracking`) are used as speaker labels. Fallback chain: `attendance_events` → Stream member lookup → `Speaker ${streamUserId.slice(0, 8)}`.
- **Classification**: **correctly handles guests**

### A3.2 — Transcript status silently omits guests

- **File**: `src/app/api/transcript/status/route.ts` lines 9–13
- **Evidence**: `if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })`. Guests without a Clerk `userId` cannot poll transcript status.
- **Classification**: **silently omits guests**
- **Note**: This is a minor gap. The download path does not use this status route, so guests can still download transcripts. But they cannot poll the status. This is a low-priority fix (the download endpoint is open to any signed-in participant via `enforceOwner: false`).

---

## A4. Participant list/avatar components

**What displays participant data:**
- `src/components/MeetingRoom.tsx` uses Stream's `CallParticipantsList` (line 895) for the side panel.
- `src/components/Navbar.tsx` shows a hardcoded greeting and Clerk `UserButton`.
- `src/components/Sidebar.tsx` shows `user?.fullName`, `user?.primaryEmailAddress?.emailAddress`, `user?.imageUrl` from Clerk.
- `src/components/DashboardContent.tsx` shows `user?.firstName` for the greeting.
- `src/components/FloatingChat.tsx` shows `user?.firstName` + hardcoded avatar cluster.

### A4.1 — `CallParticipantsList` correctly handles guests (via Stream SDK)

- **File**: `src/components/MeetingRoom.tsx` line 895
- **Evidence**: Stream's `CallParticipantsList` renders all connected participants from the SFU. Guests are connected via `GuestStreamClientProvider.tsx` line 99: `c.connectUser({ type: "guest", id: guestUserId, name: guestDisplayName }, accessToken)`. Stream renders the guest's display name from `connectUser`. The `guestEmail` is passed as a custom field but Stream's UI may not surface it — name-only display.
- **Classification**: **correctly handles guests** (name displayed via Stream SDK; no custom avatar)

### A4.2 — `Navbar.tsx` and `Sidebar.tsx` show wrong identity for guests

- **File**: `src/components/Navbar.tsx` line 28, `src/components/Sidebar.tsx` lines 55–57
- **Evidence**: Navbar shows hardcoded `"Good morning, Uzair Iqbal"` (line 28). Sidebar derives `fullName`, `email`, `avatar` from `useUser()` with hardcoded fallbacks (`"Uzair Iqbal"`, `"uzair@example.com"`, `"/icons/images/Uzair Javaid.png"`). `useUser()` returns `null` for guests without a Clerk account, so all three fall back to the owner's identity. A guest sees the **owner's name and email** displayed as their own.
- **Classification**: **breaks or misrepresents guests**
- **Fix description**: For the sidebar, conditionally render: when `!user`, show a guest-specific identity (e.g., "Guest" or the `guestDisplayName` if available) instead of the hardcoded owner fallback. The navbar greeting should also be dynamic or hidden for guests. These are app-shell chrome elements, not meeting participant displays, but they actively mislead guests into thinking they are the owner.

### A4.3 — `FloatingChat.tsx` shows hardcoded avatars for guests

- **File**: `src/components/FloatingChat.tsx` lines 26–47, 99
- **Evidence**: `const userName = user?.firstName ?? "there"` and `AvatarCluster` renders `user?.imageUrl` (falls back to "U" when undefined) plus hardcoded "NM" and "AI" avatar slots. A guest sees "U" + "NM" + "AI" and "Hi there 👋". The "NM" avatar is misleading — it appears to be the owner's avatar.
- **Classification**: **breaks or misrepresents guests**
- **Fix description**: When `!user`, render the floating chat with a guest-appropriate identity (e.g., "Guest" initial, no misleading hardcoded avatar slots). The avatar cluster should either hide or show a guest-specific variant.

### A4.4 — `DashboardContent.tsx` silently omits guests (by design)

- **File**: `src/components/DashboardContent.tsx` line 164
- **Evidence**: `const firstName = user?.firstName ?? "there"` — greeting falls back to "there" for guests. The dashboard shows meeting lists and follow-up lists with no participant identity. `useUser()` returns `null` for guests.
- **Classification**: **silently omits guests** (acceptable — dashboard is owner-scoped; guests don't create meetings)

### A4.5 — `PersonalRoomPage.tsx` silently omits guests (by design)

- **File**: `src/components/PersonalRoomPage.tsx` lines 32–33
- **Evidence**: Uses `user?.username` and `user?.id` from Clerk exclusively. Guests never access this page (it's an owner-only personal room creation page).
- **Classification**: **silently omits guests** (acceptable by design)

### A4.6 — `MeetingSetup.tsx` silently omits guests (by design)

- **File**: `src/components/MeetingSetup.tsx`
- **Evidence**: No participant list or avatar rendered. `createMeeting` requires `user.id` (line 122). Guests cannot create meetings — `if (!user || !client) return;` (line 113). This is correct behavior since guests don't own meetings.
- **Classification**: **silently omits guests** (acceptable by design)

### A4.7 — `EndCallButton.tsx` silently omits guests (by design)

- **File**: `src/components/EndCallButton.tsx`
- **Evidence**: Uses `useLocalParticipant()` to get `currentUser.userId` and compares with `MeetingOwner.id`. No participant identity rendered. Authorization is Stream-ID based and works correctly for both signed-in users and guests.
- **Classification**: **silently omits guests** (acceptable — no identity displayed; auth logic works correctly)

---

## A5. Email/notification features

**What handles participant data for notifications/emails:**
- Guest join request, admit, deny flows.
- AI processing email notification.
- Settings page email preferences.
- Attendance event tracking.

### A5.1 — AI processing email notification is broken for guests

- **File**: `src/app/api/ai/process/route.ts` lines 201–218
- **Evidence**: Uses `currentUser()` to get the Clerk user's `primaryEmailAddress?.emailAddress`. A guest without a Clerk account gets `user = null`, `to = undefined`, and the code logs `"[process] No recipient email found; skipping notification."`. Guests who attended a meeting and whose transcript is processed will NEVER receive the summary-ready email, even if they provided an email during the lobby.
- **Classification**: **breaks or misrepresents guests**
- **Fix description**: When `currentUser()` returns null, fall back to checking if the caller has a `participant_email` in `attendance_events` for the given meeting. Query `attendance_events` for `participant_email` matching the caller's `stream_user_id` or `participant_name`. If found, use that email as the `to` address. Alternatively, allow the client to pass an explicit `email` field in the request body to `/api/ai/process` when the user has no Clerk account.

### A5.2 — Upload transcript modal forwards email preference but server can't resolve it for guests

- **File**: `src/components/UploadTranscriptModal.tsx` lines 160, 173
- **Evidence**: Reads `emailNotifications` from `readUserPrefs()` (localStorage) and forwards it to `/api/ai/process`. The server still resolves email via `currentUser()` which fails for guests (see A5.1).
- **Classification**: **breaks or misrepresents guests**
- **Fix description**: Same as A5.1 — the server needs an alternative email resolution path for guests. The client-side preference forwarding is correct; the server-side email lookup is the gap.

### A5.3 — Settings page silently omits guests for email preferences

- **File**: `src/components/SettingsPage.tsx` lines 136–137, 167–169
- **Evidence**: `useUser()` returns `null` for guests. `user?.primaryEmailAddress?.emailAddress` is undefined. Display falls back to `"no email on file"`. Guests cannot set email notification preferences because there is no Clerk account to bind the preference to.
- **Classification**: **silently omits guests**
- **Note**: Acceptable — guests without a Clerk account can't have email preferences tied to a Clerk profile. The fix would be to allow guest email binding, which is a larger feature.

### A5.4 — Guest join request/notify: email captured but never sent to guest

- **File**: `src/app/api/guest/request-join/route.ts` line 94, `src/app/api/guest/admit/route.ts` lines 77–87, `src/app/api/guest/deny/route.ts` lines 72–81
- **Evidence**: Guest email IS captured in `guest_requests.email` and IS transmitted in the `guest.request_join` Stream event (`guest_email: email ?? null`). However, NO email is ever sent to the guest at any stage — not on request, admit, or deny. The `admit` route's `getGuest()` explicitly excludes email (line 208-210 of `guest-store.ts`). The `request-join` route emits `guest_email` in the Stream event but the owner's client only uses `guest_name` for the toast (line 776 of `MeetingRoom.tsx`).
- **Classification**: **silently omits guests** (for email notification TO the guest)
- **Fix description**: This is a feature gap, not a bug. If email notification to guests is desired, the admit/deny routes need to call `sendMeetingReadyEmail` or similar with the guest's email. The email field is stored in `guest_requests` but never retrieved for notification purposes. This is a lower-priority improvement since the system currently works without it.

### A5.5 — Attendance event tracking drops guest join due to client hook timing race (same root cause as A1.4)

- **File**: `src/hooks/useAttendanceTracking.ts` lines 57–68, 103, 185–192, `src/components/MeetingRoom.tsx` lines 199–203
- **Evidence**: For guests, `useAttendanceTracking` initializes `userId` to `localParticipant?.userId ?? ""` which evaluates to `""` on initial `CallingState.JOINED` because Stream's `localParticipant` is not yet populated. Line 103 `if (!identity.userId) return;` drops the join request, while line 188 sets `localJoinHandled.current = true`, preventing future retries once `localParticipant` resolves.
- **Classification**: **breaks or misrepresents guests**
- **Fix description**: Same as A1.4 — update `useAttendanceTracking` so guest identity resolution falls back to `identityOverride.streamUserId` or retries join once `localParticipant` is populated.

---

## A6. Export features (PDF, CSV, calendar)

**What handles participant data for exports:**

### A6.1 — Attendance PDF report correctly handles guests

- **File**: `src/app/api/attendance/report/route.ts`, `src/lib/attendance-pdf.ts`
- **Evidence**: Queries `attendance_events` without filtering on `user_id`. `displayName()` uses `participantName ?? participantEmail ?? "Unknown"`. Guests appear correctly in the PDF.
- **Classification**: **correctly handles guests**

### A6.2 — Transcript download correctly handles guests

- **File**: `src/app/api/transcript/download/route.ts`, `src/agent/transcript-generation.ts`
- **Evidence**: `resolveSpeakerName()` resolves guest names from `attendance_events.participant_name`/`participant_email`. No `user_id` dependency.
- **Classification**: **correctly handles guests**

### A6.3 — Calendar exports

- **Finding**: No calendar export feature exists. The `Calendar` icon references in `src/components/UpcomingPage.tsx` and `src/components/meeting-intelligence/OverviewTab.tsx` are lucide-react UI icon components, not actual calendar integration. No `ics`, `.ics`, `google-calendar`, or calendar API code exists.
- **Classification**: **not applicable**

### A6.4 — CSV exports

- **Finding**: No CSV export feature exists. The only CSV reference is the regex in `src/middleware.ts` line 62 for static asset bypass (`|csv|`). No CSV generation code exists.
- **Classification**: **not applicable**

---

## A7. Search functionality

**What handles participant data in search:**

### A7.1 — Cross-meeting search correctly handles guests (by design)

- **File**: `src/app/api/search/route.ts`, `src/lib/meeting-search.ts`
- **Evidence**: `searchAcrossMeetings(userId, query)` calls `match_meeting_chunks_user` RPC with `p_user_id: userId`. This filters results to meetings **owned by the caller**. Guests own no meetings, so they get zero results. This is arguably correct (guests shouldn't search across meetings they don't own), but guest-contributed transcripts/chunks are invisible to cross-meeting search.
- **Classification**: **silently omits guests** (by design — owner-scoped search)

### A7.2 — Meeting intelligence search correctly handles guests

- **File**: `src/components/DashboardContent.tsx` lines 168–195
- **Evidence**: Client-side search over the already-fetched dashboard data. The dashboard data comes from `/api/meetings` which is owner-scoped. Guests see no meetings, so no search results.
- **Classification**: **silently omits guests** (by design — dashboard is owner-scoped)

---

## Consolidated findings

### Bugs requiring fixes (breaks or misrepresents guests)

| # | Area | File | Line(s) | Issue | Fix |
|---|------|------|---------|-------|-----|
| G8-F1 | A1 | `src/lib/attendance-merge.ts` | 46–48 | `byUser.get(row.user_id)` collapses all null-`user_id` guest rows into one entry | Use composite key: `row.user_id ?? row.stream_user_id ?? row.participant_email ?? row.participant_name` (`stream_user_id` is unique per guest) |
| G8-F2 | A1 | `src/app/api/meetings/[id]/route.ts` | 63–77 | `.eq("user_id", userId)` fails for guests with NULL `user_id` in `attendance_events` | Also match on `stream_user_id` or `participant_email` |
| G8-F3 / G8-F10 | A1/A2 | `src/app/api/attendance/event/route.ts` & `src/hooks/useAttendanceTracking.ts` | route.ts:66-70, 228, hook:63, 103, 185-192 | Guests show "Participants: 1" and are omitted from call timeline on recap page (`/after-meeting/[id]`). Root Cause: `POST /api/attendance/event` line 66 returns 401 (`!authUserId`), client hook drops initial `post("join")` because `userId` evaluates to `""` before `localParticipant` resolves, and `findOpenRow` uses `.eq("user_id", user_id)` which fails on NULL. Zero guest rows reach `attendance_events`. | Remove Clerk `auth()` hard-stop on `/api/attendance/event` for payloads carrying guest identities; fix `useAttendanceTracking` guest `userId` resolution and join guard; update `findOpenRow` / `createRow` queries to handle NULL `user_id`. |
| G8-F4 | A4 | `src/components/Navbar.tsx` | 28 | Hardcoded `"Good morning, Uzair Iqbal"` — shows wrong identity for guests | Make greeting dynamic or hide for guests |
| G8-F5 | A4 | `src/components/Sidebar.tsx` | 55–57 | Falls back to owner's name/email/avatar when `useUser()` is null | Show guest-specific identity instead of owner defaults |
| G8-F6 | A4 | `src/components/FloatingChat.tsx` | 26–47 | Hardcoded avatar slots ("NM", "AI") and "there" fallback for guests | Render guest-appropriate identity when `!user` |
| G8-F7 | A5 | `src/app/api/ai/process/route.ts` | 201–218 | `currentUser()` returns null for guests → no email notification sent | Fall back to `attendance_events.participant_email` or client-passed `email` |

**Fix applied (G8-F8/G8-F9):** `src/components/MeetingRoom.tsx` line 248 — added `if (!call || !isOwner) return 0;` at the top of `loadRecordings()`. This single gate covers all three call sites: the function body (line 250), the `frame_recording_ready` event handler (line 484), and the `showRecordings` panel-open `useEffect` (line 817). The `isOwner` signal at line 207 (`const isOwner = !!call && call.state.createdBy?.id === user?.id`) already correctly distinguishes owners from guests. The `Record` and `Recordings` buttons are already gated behind `{isOwner && (...)}` at lines 958 and 998, so the UI and the data-fetching logic are now consistent — guests cannot trigger `queryRecordings()` either from the UI or from any event handler or polling loop.
| G8-F8 | A1 | `src/components/MeetingRoom.tsx` | 250 | `call.queryRecordings()` called unconditionally inside `loadRecordings()` (line 250). Stream throws: "User '...' with role 'guest' is not allowed to perform action ListRecordings in scope 'video:default'" — guests lack this permission. **Fix applied**: `loadRecordings()` now returns early when `!isOwner` (`if (!call || !isOwner) return 0;`). Covers all three call sites — the function body (line 250), the `frame_recording_ready` handler (line 484), and the `showRecordings` panel-open effect (line 817). |
| G8-F9 | A1 | `src/components/MeetingRoom.tsx` | 288–300 | Polling interval `setInterval` calls `loadRecordings({ silent: true })` every 10s. Same root cause as G8-F8 — `loadRecordings()` lacked an `isOwner` gate. **Fix applied**: Same as G8-F8 — the `isOwner` gate inside `loadRecordings()` covers the polling interval too. |

### Investigation finding: garbled guest identity string (unconfirmed Stream backend formatting)

| Finding | Details |
|---------|---------|
| **Classification** | Unconfirmed Stream backend API formatting, low-priority, no app-side bug found. |
| **Evidence 1** | Guest user IDs are generated server-side as `guest-${crypto.randomUUID().slice(0, 8)}` (`request-join/route.ts` line 61). Each guest gets a unique 8-hex-char suffix — no collision mechanism exists |
| **Evidence 2** | `stream_user_id` is `created.user.id` (the same `guest-{8-hex-chars}` string) stored in `guest_requests.stream_user_id` and `attendance_events.stream_user_id` (`request-join/route.ts` lines 74, 89, 95). The `GuestStreamClientProvider` connects with `{ type: "guest", id: guestUserId }` where `guestUserId` is server-issued (`GuestStreamClientProvider.tsx` line 99-100) |
| **Evidence 3** | `useAttendanceTracking` stores each participant's `streamUserId` independently per `attendance_events` row (`hooks/useAttendanceTracking.ts` lines 106-108). No code path concatenates multiple guest IDs |
| **Evidence 4** | Stream's error `"User '...' with role 'guest' is not allowed..."` formats the identity as a string in Stream's server response. The pattern comes from Stream formatting identities in an error context |
| **Action required** | None. No code change needed for this aspect of G8-F8 |

### Silently omits guests (by design or low priority)

| Area | File | Note |
|------|------|------|
| A3 | `src/app/api/transcript/status/route.ts` | 401 for unauthenticated users; minor gap, download path is open |
| A2 | `src/components/meeting-intelligence/OverviewTab.tsx` | Count only, no individual identity; acceptable |
| A2 | `src/components/follow-ups/FollowUpList.tsx` | No participant identity displayed; `assignee` is a plain string |
| A4 | `src/components/RecordingPage.tsx` | No participant data rendered |
| A4 | `src/components/PreviousPage.tsx` | No participant data rendered |
| A4 | `src/components/UpcomingPage.tsx` | No participant data rendered |
| A4 | `src/components/PersonalRoomPage.tsx` | Owner-only page |
| A4 | `src/components/MeetingSetup.tsx` | Guests cannot create meetings (correct) |
| A4 | `src/components/EndCallButton.tsx` | No identity rendered; auth works correctly |
| A5 | `src/app/api/guest/admit/route.ts` | Email not retrieved/not sent to guest; feature gap |
| A5 | `src/app/api/guest/deny/route.ts` | Email not retrieved/not sent to guest; feature gap |
| A5 | `src/components/SettingsPage.tsx` | No Clerk account → no email preferences; acceptable |
| A7 | `src/app/api/search/route.ts` | Owner-scoped search; guests own no meetings |

### Correctly handles guests

| Area | File |
|------|------|
| A3 | `src/app/api/transcript/download/route.ts`, `src/agent/transcript-generation.ts` |
| A2 | `src/app/api/attendance/report/route.ts`, `src/lib/attendance-pdf.ts` |
| A2 | `src/app/api/engagement/route.ts` |
| A4 | `src/components/MeetingRoom.tsx` — `CallParticipantsList` via Stream SDK |
| A6 | `src/app/api/attendance/report/route.ts`, `src/app/api/transcript/download/route.ts` |
| A5 | `src/app/api/guest/status/route.ts` |

---

## Verification plan

After fixes are applied:

1. **Run `npx vitest run`** — all 195+ existing tests must remain green. Add new tests for A1.1 (guest grouping) and A1.4/G8-F10 (guest attendance event recording).
2. **Run `npx tsc --noEmit`** — must be clean.
3. **Run `npm run build`** — must exit 0.
4. **Manual verification** — create a meeting, join as guest, verify:
   - After-meeting recap shows each guest as a separate entry (G8-F1)
   - Guest can access meeting detail page without 404 (G8-F2)
   - Guest attendance events record successfully (G8-F3 / G8-F10)
   - Navbar, Sidebar, and FloatingChat show guest identity instead of owner (G8-F4, G8-F5, G8-F6)
   - AI processing email reaches guest via `participant_email` fallback (G8-F7)

---

## Resolved decisions & backlog

1. **G8-F4/F5/F6 (app chrome)** — **RESOLVED: FIX**. Update Navbar greeting, Sidebar identity, and FloatingChat avatar/name to display guest identity when `!user`.
2. **G8-F7 (AI email)** — **RESOLVED: FIX**. Implement `attendance_events.participant_email` fallback in `/api/ai/process`.
3. **G8-F1 (guest grouping key)** — **RESOLVED: FIX**. Use composite key `row.user_id ?? row.stream_user_id ?? row.participant_email ?? row.participant_name` (`stream_user_id` is server-minted and unique per guest).
4. **G8-F2/F3/F10 (auth/attendance)** — **RESOLVED: FIX**. Fix `/api/attendance/event` auth gate, `useAttendanceTracking` guest `userId` resolution, and `findOpenRow` NULL handling.
5. **Null-safety audit backlog** — Audit all `.eq("user_id", ...)` patterns across the codebase for null-safety as a post-G8 backlog item.
