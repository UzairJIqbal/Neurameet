# W3. Project meetings, consent, and retention

Child of [0004. Conversations to Code](index.md). Uses the W3 SQL block and the role matrix.

Updated 2026-11-03: the two owed Stream checks are settled (members only `project` call type, plus removal from live calls on offboarding), and the spec now matches what W1 and W2 shipped.

## Summary

When you create or schedule a meeting, you can put it in a project. You can also move one of your own personal meetings into a project later, but never out again. Before anyone joins a project call, they see a short notice saying the call is recorded and transcribed and that the project keeps it until someone deletes it, and they must tick a box to continue. Guests tick the same box. Project data has no automatic expiry; it is kept until a person deletes it, and the notice says so.

New project calls use their own Stream call type, `project`, where nobody can join unless our server has added them as a call member. Our server adds a member only after the consent tick, and adds a guest only when the guest is admitted. So the gate is checked by Stream itself, not just hidden in our screens. When someone is removed from a project, the server also takes them off any project call that has not ended.

## Requirements

- **AC-23**: New Meeting and Schedule Meeting show a project picker listing projects where you are Developer or higher (default "Personal"); `createScheduledMeetingRow` saves `meetings.project_id` and `meetings.stream_call_type = 'project'` only after the server confirms that role, else returns "Not authorized" and saves nothing. For a project meeting the server check and row save run first, and the browser creates the Stream call (call type `project`) only after they succeed; on failure it shows the error and creates no call. A personal meeting keeps today's order and `default`. The Personal Room stays personal (no picker).
- **AC-24**: `POST /api/meetings/[id]/project` moves a personal meeting into a project only when the caller created it (`meetings.user_id`) and is Developer or higher in the target; a meeting already in a project returns 409 "Meetings can't leave a project"; a meeting with a `minutes_reviews` row returns 409 "Finish or cancel the minutes review first". The moved meeting keeps `stream_call_type = 'default'` (Stream cannot change a call's type).
- **AC-25**: Moving a meeting in converts its follow ups in one database call (`move_meeting_to_project`): action items with an open follow up become `review_state = 'proposed'`, action items with a completed follow up become completed tasks (`completion_kind = 'manual'`, evidence "Completed as a follow up before the move"), the follow up rows are deleted, and `audit_log` gets `meeting.moved`.
- **AC-26**: Before joining a project call, every signed in member sees the consent notice and must tick it; the Join button stays disabled until ticked. Ticking calls `POST /api/meetings/[id]/consent` (where `[id]` is the Stream call id, the same as `/members`; both look the meeting up by `stream_call_id`), which returns 404 to anyone who is not an active member of the meeting's project and otherwise upserts `meeting_participants` (latest time and notice version). Then `POST /api/meetings/[id]/members` adds the caller as a Stream call member, and for a project meeting it refuses with 409 "Please accept the recording notice" unless that caller has a `meeting_participants` row with the current notice version and `consented_at` within the last 15 minutes. `/members` checks active project membership again on every call. The tick is asked on every join.
- **AC-27**: A signed in user who is not an active member of the meeting's project is sent through the existing guest admission flow (not a direct join), using the guest identity that `request-join` mints, never their own Stream user; `POST /api/meetings/[id]/members` refuses them with 404 (W1 already ships this, and 404 matches the "never reveal the project" rule). Host controls in the room follow `canManage` from `GET /api/meetings/[id]` (W1 already ships this; W3 only verifies it).
- **AC-28**: `POST /api/guest/request-join` reads `guest_admission_mode`, `project_id`, and `stream_call_type` from the meeting row (found by Stream call id). When `project_id` is set (this includes meetings moved in on `default`), it requires `consented: true` and stores `guest_requests.consented_at`; without it, 400 "Please accept the recording notice". Its response adds `callType`, so the guest page opens the call with the right type. With no meeting row, it behaves as today (approval mode, `default`, no consent check).
- **AC-29**: The notice text (version `w3-v1`) states: the call is recorded and transcribed; the recording, transcript, summary, and tasks are kept in the project until an Owner or Admin deletes them; project members with access can see them. It is the same text in the member and guest flows.
- **AC-30a** (Stream gate): on a call of type `project`, a signed in user or guest whom our server has not added as a call member cannot join (Stream refuses `join-call`), even with a valid Stream token and the call id. Admitting a guest on a `project` call (`POST /api/guest/admit`, and the open mode shortcut inside `request-join`) adds the guest's Stream user (`mint.stream_user_id` from the guest store) as a `call_member` before `admit()` runs. If the mint is still empty, admit returns 409 "Guest is still connecting, try again". If the Stream call fails, admit returns 502 "Couldn't admit the guest, try again" and the guest stays pending; in open mode the request is marked expired and `request-join` returns 502, so the guest can start again.
- **AC-30b** (offboarding): when a member is removed or leaves (`DELETE /api/projects/[id]/members/[userId]`), the server, after the removal is saved, removes that user from the call members of every meeting in the project with `stream_call_type = 'project'` and `status <> 'ended'` (newest `started_at` first, at most 50, with a log line when the cap is hit), and kicks them if they are in the call. Each Stream call is best effort: a failure is logged and never undoes or fails the removal.

(AC-30a and AC-30b sit inside W3's range so the global AC-30 to AC-84 numbering of later steps stays unchanged.)

## Design

### SQL

Added to the W3 block in the umbrella `index.md`:

```sql
alter table meetings add column if not exists stream_call_type text not null default 'default'
  check (stream_call_type in ('default', 'project'));
```

Every existing row stays `default`. `meeting_participants` and `guest_requests.consented_at` are unchanged from the umbrella block.

### The `project` call type (one time setup)

`scripts/stream-create-project-call-type.mjs` (run once by you, with your Stream keys in your shell; it never reads `.env` for us):

1. `client.video.getCallType({ name: 'default' })` and copy its `settings` and `grants`.
2. Remove `join-call` (and `join-call-any-team` if present) from the `user` and `guest` roles. Keep `read-call` and `create-call` for `user`, so a member can preview and create the call.
3. Also remove `update-call-member` and `remove-call-member` from `user`, `guest`, and `call_member`, and `end-call` from `user` and `guest`. Leave `admin` and `host` exactly as on `default`. Gate finding 2026-11-03: on `default` the plain `user` and `call_member` roles hold the full `update-call-member` grant (not only the `-owner` form), so the first gate run let a stranger add themselves through `POST /members` and then join. Our app changes members only from the server, so these grants are not needed in the browser. `call_member` keeps `end-call` because a Developer who creates a project meeting joins as `call_member` and the End button shows for the call creator.
4. `client.video.createCallType({ name: 'project', settings, grants })`, or `updateCallType` if it already exists. `--check` prints the current grants and changes nothing.

Grants are config, not a paid feature, and the SDK (`@stream-io/node-sdk` 0.7.3, `VideoApi.createCallType`, `CreateCallTypeRequest { name, grants, settings }`) supports it. Build step 1 is the feasibility gate: if Stream refuses to create the call type on this plan, stop, record it here, and fall back to "keep `default`, block on removal" (the runner up in rationale). Recording settings still come from the per call `settings_override` at create, as today.

### Where the call type travels

- **Source of truth**: `meetings.stream_call_type`. New helper `src/lib/stream-call-type.ts`: `PROJECT_CALL_TYPE = "project"`, `type StreamCallType = "default" | "project"`, `callTypeForNewMeeting(projectId)`, and a server `streamCallTypeFor(supabase, streamCallId)` that returns the row's value or `default` when there is no row.
- **Server sites** that today hardcode `"default"` read the row instead: `meetings/[id]/members`, `meetings/by-call/[callId]` (DELETE), `guest/request-join`, `guest/admit`, `guest/deny`, `attendance/event`, `lib/live-ledger-events.ts`, `lib/meeting-recap.ts`, `lib/recordings.ts` (both `listCallRecordings` calls), and `transcript/download` (already accepts `streamCallType`).
- **Browser sites**: `MeetingModel.tsx` (both creates use `callTypeForNewMeeting(projectId)`), `useGetCallbyId.ts` (link path), `meeting/[id]/guest/page.tsx`, and `AfterMeetingRecap.tsx` (passes the meeting's type). `PersonalRoomPage.tsx` stays `default`. `MeetingRoom.tsx` uses the call object it is given, so it needs no change (its `call_cid` mentions are event filters).
- **Already safe**: paths that list calls through `queryCalls` (`useGetCall.ts`, `fetchCreatedRecordings` in `recordings.ts`) get each call's own type back and pass it on.
- **How the browser learns the type**: `GET /api/meetings/by-call/[callId]` adds `callType` to its response (`{ meetingId, callType }`); only a 404 means `default`; any other failure (500, network) shows the shared `LoadError` fallback and never guesses `default`. The guest page reads `callType` from the `request-join` response. Calls listed through `queryCalls` already carry their own type.

### Join order for a project meeting (member)

`MeetingSetup` → by-call lookup (`callType = project`) → consent notice and tick → `POST /api/meetings/[id]/consent` → `POST /api/meetings/[id]/members` (checks fresh consent, adds call member with the role from W1's `streamCallRole`) → `call.join()`. A 404 from `/members` sends the user to the guest flow (AC-27). Verify every Stream call against the `stream-react` skill before coding, as AGENTS.md requires.

### SQL helper (move, ships with W4)

```sql
create or replace function move_meeting_to_project(p_meeting uuid, p_project uuid, p_actor text)
returns void language plpgsql as $$
declare r action_items; t tasks;
begin
  update meetings set project_id = p_project
    where id = p_meeting and project_id is null and user_id = p_actor;
  if not found then raise exception 'not_movable'; end if;
  if exists (select 1 from minutes_reviews where meeting_id = p_meeting) then
    raise exception 'minutes_review';
  end if;
  update action_items ai set review_state = 'proposed'
    from follow_ups f where f.action_item_id = ai.id and f.meeting_id = p_meeting
    and f.status <> 'completed';
  for r in select ai.* from action_items ai join follow_ups f on f.action_item_id = ai.id
           where f.meeting_id = p_meeting and f.status = 'completed' loop
    t := create_project_task(p_project, r.title, null, null, r.due_date, r.id, p_meeting,
                             null, null, null, null, p_actor);
    update tasks set status = 'completed', completion_kind = 'manual',
      completion_evidence = 'Completed as a follow up before the move',
      completed_at = now(), completed_by = p_actor where id = t.id;
    update action_items set review_state = 'confirmed', reviewed_by = p_actor, reviewed_at = now()
      where id = r.id;
  end loop;
  delete from follow_ups where meeting_id = p_meeting;
  insert into audit_log (project_id, actor_id, action, target_type, target_id)
    values (p_project, p_actor, 'meeting.moved', 'meeting', p_meeting::text);
end $$;
```

An exception rolls the whole call back, so the 409 cases change nothing. The route checks the role first, then maps `not_movable` and `minutes_review` to the two 409 messages. This function needs `tasks`, so the move route and button ship with W4. W3 ships the picker, the call type, consent, guest consent, and offboarding removal.

### Honest limits that stay

- A meeting moved into a project keeps the `default` call type, so for that call the gate is only in our screens and routes. The notice still shows. Most moved meetings have already ended.
- Someone who has been added as a call member once can rejoin that same call through the Stream API without ticking again. Our screen still asks every time; Stream only knows they consented at least once.
- The meeting creator is added as an `admin` call member when the call is created, so they could join through the API without the tick. Our screen still asks them.
- Project meetings created before W3 stay on `default`. There is no backfill; the notice still shows for them.
- A user can create a `project` type call on their own through the API. That call has no meeting row and no project, so it reaches no project data.

### Value sourcing

| Action | Value | Source |
|---|---|---|
| Picker | eligible projects | `GET /api/projects` filtered to role developer or higher |
| Create | call type | `callTypeForNewMeeting(projectId)` in the browser; the server saves its own `project_id ? 'project' : 'default'` |
| Join | call type | `GET /api/meetings/by-call/[callId]` → `callType` (404 → `default`) |
| Guest join | call type | `request-join` response `callType`, from `meetings.stream_call_type` |
| Consent | notice version | constant `CONSENT_NOTICE_VERSION = "w3-v1"` in `src/lib/consent.ts` |
| Consent | freshness window | constant `CONSENT_FRESH_MINUTES = 15` in `src/lib/consent.ts` |
| Consent | project name in the notice | `projects.name` through `GET /api/meetings/[id]` (read) |
| Consent and members | meeting row | `meetings` by `stream_call_id` (the route's `[id]`) |
| Guest admit | guest Stream user id | guest store `mint.stream_user_id` |
| Guest consent | consent flag | request body `consented`, stored as `now()` |
| Call member role | role | W1 `streamCallRole` (`admin` for Owner and Admin, `call_member` otherwise); guests always `call_member` |
| Offboarding | calls to clear | `meetings` where `project_id = p`, `stream_call_type = 'project'`, `status <> 'ended'`, order `started_at desc`, limit 50 |

### Critical test scenarios

- Happy path: Developer schedules a project meeting (call type `project`, row saved), a Viewer member ticks and joins, `meeting_participants` has the row, verifies **AC-23**, **AC-26**.
- Stream gate: a signed in non member with a valid token calls `call.join()` on the `project` call directly and is refused; the same for a guest who is still pending; after admit the guest joins, verifies **AC-30a**.
- Stale consent: `/members` with no consent row, or a row older than 15 minutes, or an old notice version, returns 409, verifies **AC-26**.
- Offboarding: a member in a live project call is removed; they are kicked and cannot rejoin; a failing Stream call leaves the removal saved, verifies **AC-30b**.
- Move: a personal meeting with two open and one completed follow up moves in; two proposals and one completed task appear, no follow ups remain, call type stays `default`, verifies **AC-24**, **AC-25** (with W4).
- Failure: move under a minutes review (409, nothing changed), move out (409), verifies **AC-24**.
- Auth: a non member hits `/members` (404) and is offered the guest flow; a guest without consent gets 400, verifies **AC-27**, **AC-28**.
- Regression: a personal meeting still creates, joins, records, and lists recordings on `default` exactly as before.

## Build plan

1. Feasibility gate: write `scripts/stream-create-project-call-type.mjs` (copies every `default` setting), you run it, then prove four things before anything else: a non member is refused `join-call`; a call member (`call_member` and `admin`) joins and can send audio and video; a stranger calling `getOrCreate` with `data.members` on an existing `project` call does not become a member; plain `user` and `call_member` have no `update-call-member` grant and the members endpoint refuses them. If any fails, or Stream refuses the call type, stop and fall back (see above), satisfies **AC-30a**.
2. W3 SQL block (`meeting_participants`, `guest_requests.consented_at`, `meetings.stream_call_type`), applied live only with your OK, satisfies **AC-23**, **AC-26**, **AC-28**.
3. `src/lib/stream-call-type.ts` and swap every server and browser `"default"` site listed above; by-call GET adds `callType`; finish with a grep of `src` for `"default"` that shows no call type uses left, satisfies **AC-23**, **AC-28**.
4. Project picker, the server side role check in `createScheduledMeetingRow`, and the server first order for project meetings in `MeetingModel.tsx`, satisfies **AC-23**.
5. Consent notice in the join screen, `src/lib/consent.ts`, consent route, fresh consent check in `/members`, satisfies **AC-26**, **AC-27**, **AC-29**.
6. Guest consent in the guest join screen and `request-join`; admit (and open mode) adds the guest as a call member, satisfies **AC-28**, **AC-29**, **AC-30a**.
7. Offboarding removal from live project calls in the W1 member DELETE route, satisfies **AC-30b**.
Steps 1 to 7 built 2026-11-03 (gate passed 4 of 4, SQL applied, tests green).

8. With W4: `move_meeting_to_project` and the move route and button, satisfies **AC-24**, **AC-25**.

## Rationale (short)

Moving only inward keeps the access story simple: data never leaves a project's audience. A tick on every join is the clearest consent a free stack can give, and a members only call type makes Stream itself refuse anyone our server has not let in, which closes the gap the first version of this spec left documented. It costs a call type string passed through about fifteen files, which is cheaper than a gate that only hides a button. Retention "until deleted" matches how the rest of the app already behaves, and saying it in the notice is what makes it fair. Full options in [rationale.md](rationale.md#w3-call-gate).
