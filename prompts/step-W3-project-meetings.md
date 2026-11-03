# Step W3: Project meetings, the members only call type, and the consent notice

Spec: `docs/specs/0004-conversations-to-code/0004-project-meetings.md` (child of the umbrella `index.md`, Status In Progress, tier GA), updated and accepted at `/architect` on 2026-11-03. This prompt covers W3 Build plan items 1 to 7 and satisfies AC-23, AC-26 to AC-29, AC-30a, AC-30b. Item 8 (move into a project, AC-24 and AC-25) ships with W4 because it needs `tasks`. The spec is the contract: where this prompt is shorter, the spec wins.

Rules in force: Next.js 15 App Router, strict TypeScript, no `any`, plain JSON errors, every UI load uses `useLoadingTimeout` plus `LoadError`, tokens only (no hex, no raw color classes), react-hot-toast only. No new dependency, no new provider, no new env var. Work on `main`, no branch, no PR. Ask before commit and push. I never read `.env` files and never run the Stream scripts; you run them.

Stream rule: every Stream call below was checked against the `stream-react` skill (`references/VIDEO.md`) and the installed types (`@stream-io/node-sdk` 0.7.3: `VideoApi.getCallType`, `createCallType`, `updateCallType`; `CallApi.updateCallMembers({ update_members?, remove_members? })`, `CallApi.kickUser({ user_id, block? })`; `@stream-io/video-react-sdk` 1.40.2). One skill gotcha matters here: Stream checks capabilities against the call role a user has at join time (`call_member`, `admin`, `host`), not only the user level role. That is exactly why removing `join-call` from `user` and `guest` works as a gate while members keep it.

## 0. Before code

- AGENTS.md API Contracts: the two W3 lines are already in (by-call `callType`, request-join consent). One more small change, because the notice shows the project name (Value sourcing: "project name through `GET /api/meetings/[id]`") and that route does not return it yet. Edit the existing line to read:
  `GET  /api/meetings/[id]            → (extended) adds projectId, projectName, role, canManage; Viewers get no transcript fields and only confirmed action items`
- Mark Step W3 in `context/build-plan.md` as in progress.

## 1. Feasibility gate, Build plan item 1 (STOP after this until you report back)

Two scripts, same style as `scripts/stream-check-call.mjs` (dotenv `.env.local`, `StreamClient`). You run them in your shell.

- `scripts/stream-create-project-call-type.mjs`: `getCallType({ name: "default" })`, copy `settings` and `grants`, remove `join-call` and `join-call-any-team` from `user` and `guest` only (keep `read-call` and `create-call` on `user`; leave `call_member`, `admin`, `host` exactly as on `default`), then `createCallType({ name: "project", settings, grants })`, or `updateCallType` when it already exists. `--check` prints the current `project` grants for each role and changes nothing.
- `scripts/stream-w3-gate-check.mjs`: upserts three test users (`w3-gate-owner`, `w3-gate-member`, `w3-gate-stranger`), creates a fresh `project` call owned by `w3-gate-owner` with `w3-gate-member` as `call_member`, then uses `StreamVideoClient` from `@stream-io/video-client` (REST only, as `request-join` already does on the server) as each user to read the call and print `own_capabilities`. It proves the four gate facts:
  1. the stranger has no `join-call`;
  2. `admin` and `call_member` have `join-call`, `send-audio`, `send-video`;
  3. the stranger calling `getOrCreate` with `data.members` naming themselves does not appear in the server side member list;
  4. plain `user` has no `update-call-member` (only the `-owner` form).
  It prints PASS or FAIL per fact, then hard deletes the test call.

Then a quick browser check by you: sign in as an account that is not a member, open the `project` test call link, press Join, and see it refused.

If Stream refuses the call type on this plan, or any fact fails, I stop, record it in the spec, and we fall back to "keep `default`, block on removal" (the runner up in rationale) through `/architect`. Nothing below starts until you tell me the gate passed.

## 2. Schema, Build plan item 2

Append `-- ===== W3. Project meetings and consent (spec 0004, child 0004-project-meetings) =====` to `supabase/schema.sql` with exactly the umbrella W3 block: `meeting_participants` (RLS on, no policies, `grant all ... to service_role`, same as W1 and W2), `guest_requests.consented_at`, and `meetings.stream_call_type` with its check. I show you the SQL, apply it to the live NeuraMeet project (`lsjiwxohfpzdvenbxpeu`) as migration `w3_project_meetings` only with your OK, then confirm the table, the two columns, the check, and that every existing meeting reads `default`.

## 3. Call type threading, Build plan item 3

- New `src/lib/stream-call-type.ts`: `PROJECT_CALL_TYPE = "project"`, `type StreamCallType = "default" | "project"`, `isStreamCallType(value)`, `callTypeForNewMeeting(projectId: string | null): StreamCallType`. Browser safe.
- New `src/lib/stream-call-type-server.ts` (`server-only`): `streamCallTypeFor(supabase, streamCallId)` returns the row's value, or `default` when there is no row. A lookup error throws (callers already return 500 on errors; never guess `default` on an error).
- Server sites read the row instead of `"default"`: `meetings/[id]/members`, `meetings/by-call/[callId]` (GET returns `{ meetingId, callType }`; DELETE uses the row value, `default` when there is no row), `guest/request-join`, `guest/admit`, `guest/deny`, `attendance/event` (both the Stream read and the lazy row create path), `lib/live-ledger-events.ts` (both `sendCallEvent` and `queryCallParticipants`), `lib/meeting-recap.ts`, `lib/recordings.ts` (both `listCallRecordings` calls), and `transcript/download` (reads `stream_call_type` from the meeting row it already loads and ignores the body value).
- Browser sites: `MeetingModel.tsx` (both creates), `useGetCallbyId.ts` (link path: by-call lookup first; 404 means `default`; any other failure sets an error the meeting page shows through `LoadError` with retry, never a silent `default`), `meeting/[id]/guest/page.tsx` (type from the `request-join` response), `AfterMeetingRecap.tsx` (drop the hardcoded body value, the server now reads the row). `PersonalRoomPage.tsx` stays `default`. `MeetingRoom.tsx` needs nothing.
- Finish with a grep of `src` for `"default"` and `'default'`: only non call type uses may remain (toaster id, Notification permission, `PersonalRoomPage`).

## 4. Project picker and server first create, Build plan item 4 (AC-23)

- `createScheduledMeetingRow` takes `projectId?: string | null`. When set: `requireProjectRole(..., NEED_ROLES.content)` first; any denial returns `{ ok: false, error: "Not authorized" }` and writes nothing. The insert saves `project_id` and `stream_call_type: projectId ? "project" : "default"` (the server decides the type, never the browser). An existing row (re schedule of the same call id) never changes `project_id` or `stream_call_type`; moving in is the W4 route only.
- `MeetingModel.tsx`: a "Project" select in both the New Meeting and Schedule Meeting forms, options "Personal" (default) plus projects from `listProjects()` where role is owner, admin, or developer. Loading uses `useLoadingTimeout`; a failed or timed out load shows a small inline `LoadError` with retry and still lets you create a personal meeting. Personal meetings keep today's order exactly. For a project meeting: save the row first; on failure toast the error and create no Stream call; on success create the call with `client.call("project", id)` and the same `getOrCreate` data as today.
- Matches the existing form controls in `new-meeting.png` and `join-meeting.png` (no design covers the picker, so I reuse the current select styling and tokens).

## 5. Consent for members, Build plan item 5 (AC-26, AC-27, AC-29)

- New `src/lib/consent.ts` (browser safe): `CONSENT_NOTICE_VERSION = "w3-v1"`, `CONSENT_FRESH_MINUTES = 15`, `consentNoticeText(projectName)` returning the AC-29 text, and `isConsentFresh(row, now)` (current version and within 15 minutes). Unit tested.
- New `src/components/ConsentNotice.tsx`: the notice text plus a checkbox, controlled by the parent. Same component in the member and guest flows.
- `DeviceSetup` gains two optional props: `joinDisabled?: boolean` and `beforeJoin?: ReactNode` (rendered above the Join button). Existing callers are unchanged.
- `MeetingSetup.tsx`: by-call lookup, then `GET /api/meetings/[meetingId]` for `projectId` and `projectName` (loads guarded by `useLoadingTimeout` and `LoadError`). When `projectId` is set (this includes moved meetings and pre W3 project meetings on `default`), it shows `ConsentNotice` and keeps Join disabled until ticked; Join then calls `POST /api/meetings/[callId]/consent`, then `/members`, then `call.join()`. The tick resets on every visit. A 404 from `/members` (or consent) sends the user to `/meeting/[callId]/guest` (AC-27). A 409 shows "Please accept the recording notice" and unticks.
- `GET /api/meetings/[id]` adds `projectName` (from `projects.name`) for members.
- New `POST /api/meetings/[id]/consent` (`[id]` is the Stream call id): Clerk `auth()`; body `{ noticeVersion }` must equal `CONSENT_NOTICE_VERSION` (else 422); meeting by `stream_call_id`; no row or no `project_id` → 404; not an active member → 404 (via `checkMeetingAccess` with need `read`); upsert `meeting_participants` (`consented_at = now()`, `notice_version`); 200 `{ ok: true }`.
- `/members` for a meeting with `project_id`: active membership checked again on every call (already true via `checkMeetingAccess`), then the consent row must pass `isConsentFresh`, else 409 "Please accept the recording notice". The call member role still comes from `streamCallRole`. Personal meetings unchanged.

## 6. Guest consent and admit as a call member, Build plan item 6 (AC-28, AC-29, AC-30a)

- Guest page `NameModal`: a signed out guest cannot look the meeting up first, so the page learns it from the spec's own 400. The first "Ask to join" goes without consent; a 400 with `code: "consent_required"` (returned before any mint, so nothing is created) shows `ConsentNotice` in the modal ("this project", no name, since the guest is not a member), and the guest ticks and asks again with `consented: true`. Personal meetings never see the notice, exactly as today.
- `request-join`: reads `guest_admission_mode, project_id, stream_call_type` from the row. With `project_id` and no `consented: true` → 400 `{ error: "Please accept the recording notice", code: "consent_required" }` before any mint. With consent, `createPending` stores `consented_at`. The response adds `callType`. No row → today's behavior (approval, `default`, no consent check).
- Open mode on a `project` call: after `resolveMint`, `updateCallMembers({ update_members: [{ user_id: mint.stream_user_id, role: "call_member" }] })`, then `admit()`. If Stream fails: mark the request expired (new `expireGuest(guest_token)` in `guest-store.ts`) and return 502 "Couldn't admit the guest, try again".
- `guest/admit` on a `project` call: read `stream_user_id` with `getGuest`; empty → 409 "Guest is still connecting, try again"; add the guest as `call_member` before `admit()`; Stream failure → 502 "Couldn't admit the guest, try again" and the guest stays pending. `default` calls keep today's flow.
- Guest page creates the call with the `callType` from the response.

## 7. Offboarding removal, Build plan item 7 (AC-30b)

- New `src/lib/project-call-offboarding.ts` (`server-only`): `removeFromLiveProjectCalls(supabase, projectId, userId)` selects meetings with `project_id = p`, `stream_call_type = 'project'`, `status <> 'ended'`, `order started_at desc`, `limit 50`, logs when 50 come back, then for each call runs `updateCallMembers({ remove_members: [userId] })` and `kickUser({ user_id: userId })` (calls in parallel with `Promise.allSettled`). Every failure is logged, nothing throws.
- Called in `DELETE /api/projects/[id]/members/[userId]` only after `remove_project_member` succeeds, wrapped so it never changes the 200 response.

## 8. Tests

- Unit: `stream-call-type` helpers, `consent.ts`, `removeFromLiveProjectCalls` (cap log, best effort on failure, the right filters).
- Routes: consent (422, 404 non member, 404 personal, upsert), `/members` (409 missing, stale, old version; 200 fresh; 404 non member), by-call GET `callType`, `request-join` (400 without consent on a project meeting, `callType` in the response, open mode Stream failure 502 and expired), `guest/admit` (409 empty mint, 502 Stream failure keeps pending, member added before admit), member DELETE (removal saved even when Stream fails), `createScheduledMeetingRow` (Viewer gets "Not authorized" and nothing saved, Developer saves `project` type, re schedule keeps project).
- Update any existing tests that assert `"default"`.
- Then `npx tsc --noEmit`, `npm run lint`, `npx vitest run`, `npm run build`.

## 9. After the build

- Update `context/progress-tracker.md`, `context/ui-registry.md` (`ConsentNotice`, the picker, the `DeviceSetup` props), `context/build-plan.md`, the spec Build plan ticks, and the W3 milestone boxes in `docs/scope/scope.md` (W3a to W3d; W3e waits for W4).
- Flag for `/architect` later (not built, not blocking): a call owner or `admin` call member can add any Stream user as a member through the API. On a project call that is the creator (Developer or higher) or an Owner or Admin, so it is one more honest limit the spec should list.

## Test steps for you (after the build)

1. Run the call type script, then the gate check: four PASS lines.
2. As a Developer, schedule a meeting in a project: the Stream call type is `project`, the row has `project_id` and `stream_call_type = 'project'`.
3. As a Viewer in the same project, open the link: the notice shows, Join stays disabled until ticked, then you join; `meeting_participants` has your row.
4. Sign in as a non member and open the link: you land on the guest flow; trying `call.join()` directly is refused.
5. As a guest, skip the tick: 400. Tick it: the Owner admits you and you join.
6. Remove a member who is in a live project call: they are kicked and cannot rejoin; the removal stays saved.
7. A personal meeting still creates, joins, records, and lists recordings exactly as before.
