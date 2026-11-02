# W3. Project meetings, consent, and retention

Child of [0004. Conversations to Code](index.md). Uses the W3 SQL block and the role matrix.

## Summary

When you create or schedule a meeting, you can put it in a project. You can also move one of your own personal meetings into a project later, but never out again. Before anyone joins a project call, they see a short notice saying the call is recorded and transcribed and that the project keeps it until someone deletes it, and they must tick a box to continue. Guests tick the same box. Project data has no automatic expiry; it is kept until a person deletes it, and the notice says so.

## Requirements

- **AC-23**: New Meeting and Schedule Meeting show a project picker listing projects where you are Developer or higher (default "Personal"); `createScheduledMeetingRow` saves `meetings.project_id` only after the server confirms that role, else returns "Not authorized" and saves nothing.
- **AC-24**: `POST /api/meetings/[id]/project` moves a personal meeting into a project only when the caller created it (`meetings.user_id`) and is Developer or higher in the target; a meeting already in a project returns 409 "Meetings can't leave a project"; a meeting with a `minutes_reviews` row returns 409 "Finish or cancel the minutes review first".
- **AC-25**: Moving a meeting in converts its follow ups in one database call (`move_meeting_to_project`): action items with an open follow up become `review_state = 'proposed'`, action items with a completed follow up become completed tasks (`completion_kind = 'manual'`, evidence "Completed as a follow up before the move"), the follow up rows are deleted, and `audit_log` gets `meeting.moved`.
- **AC-26**: Before joining a project call, every signed in member sees the consent notice and must tick it; the Join button stays disabled until ticked, and joining calls `POST /api/meetings/[id]/consent`, which upserts `meeting_participants` (latest time and notice version). The tick is asked on every join.
- **AC-27**: A signed in user who is not an active member of the meeting's project is sent through the existing guest admission flow (not a direct join), using the guest identity that `request-join` mints, never their own Stream user; `POST /api/meetings/[id]/members` refuses them with 403. Host controls in the room (admit, deny, end, Live Ledger owner panels) show only when `canManage` from `GET /api/meetings/[id]` is true.
- **AC-28**: `POST /api/guest/request-join` for a project meeting requires `consented: true` and stores `guest_requests.consented_at`; without it, 400 "Please accept the recording notice".
- **AC-29**: The notice text (version `w3-v1`) states: the call is recorded and transcribed; the recording, transcript, summary, and tasks are kept in the project until an Owner or Admin deletes them; project members with access can see them. It is the same text in the member and guest flows.

## Design

### SQL helper

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

An exception rolls the whole call back, so the 409 cases change nothing. The route checks the role first, then maps `not_movable` and `minutes_review` to the two 409 messages. This function needs `tasks`, so the move route ships in W4's slice if W3 lands before tasks exist; W3 ships the picker, consent, and guest consent, and the move button appears with W4. (Order inside the phase stays W3 then W4; only the move route waits.)

### Consent gate, and its honest limit

The gate lives in our join screen (`MeetingSetup`) and in `/api/meetings/[id]/members` (which adds Stream call membership). A person with a valid Stream user token could still reach the call through the Stream API directly, because the `default` call type lets any user join. Before W3, verify with the `stream-react` skill whether making project calls members only, through call type permissions on the free tier, closes this; if it does, add it to this step; if not, the limit stays documented. The same check decides whether removing a member can also revoke their call access (see the umbrella Follow up).

### Value sourcing

| Action | Value | Source |
|---|---|---|
| Picker | eligible projects | `GET /api/projects` filtered to role developer or higher |
| Consent | notice version | constant `CONSENT_NOTICE_VERSION = "w3-v1"` in `src/lib/consent.ts` |
| Consent | project name in the notice | `projects.name` through `GET /api/meetings/[id]` (read) |
| Guest consent | consent flag | request body `consented`, stored as `now()` |

### Critical test scenarios

- Happy path: Developer schedules a project meeting, a Viewer member joins after ticking, `meeting_participants` has the row, verifies **AC-23**, **AC-26**.
- Move: a personal meeting with two open and one completed follow up moves in; two proposals and one completed task appear, no follow ups remain, verifies **AC-24**, **AC-25**.
- Failure: move under a minutes review (409, nothing changed), move out (409), verifies **AC-24**.
- Auth: a non member hits `/members` (403) and is offered the guest flow; a guest without consent gets 400, verifies **AC-27**, **AC-28**.

## Build plan

1. W3 SQL block (`meeting_participants`, `guest_requests.consented_at`), satisfies **AC-26**, **AC-28**.
2. Project picker and the server side role check in `createScheduledMeetingRow`, satisfies **AC-23**.
3. Consent notice in the join screen (verify Stream APIs with `stream-react` first), consent route, members route guard, satisfies **AC-26**, **AC-27**, **AC-29**.
4. Guest consent in the guest join screen and `request-join`, satisfies **AC-28**, **AC-29**.
5. With W4: `move_meeting_to_project` and the move route and button, satisfies **AC-24**, **AC-25**.

## Rationale (short)

Moving only inward keeps the access story simple: data never leaves a project's audience. A tick on every join is the clearest consent a free stack can give. Retention "until deleted" matches how the rest of the app already behaves, and saying it in the notice is what makes it fair.
