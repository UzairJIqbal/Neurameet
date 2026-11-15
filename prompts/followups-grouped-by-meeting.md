# Follow-ups grouped by meeting (Option A)

## Goal

Make the link between a meeting and its follow-ups visible and quick to act on. Today the Follow-ups page is one flat list across every meeting, the meeting name is plain text, marking an item done needs a full detail page, and the meeting's Action Items tab shows no status. Scope is only the follow-up screens and the Action Items tab. Nothing else changes.

## Context to read first

- `src/components/follow-ups/FollowUpList.tsx` (page being redesigned)
- `src/components/follow-ups/FollowUpDetails.tsx` (kept as is, still reachable)
- `src/app/api/follow-ups/route.ts`, `src/actions/follow-ups.ts` (`updateFollowUpStatus`, reused, unchanged)
- `src/app/api/meetings/[id]/route.ts` (GET), `src/lib/meeting-types.ts`
- `src/components/meeting-intelligence/ActionItemsTab.tsx`, `MeetingTabs.tsx`
- `context/ui-tokens.md` status mapping (line 60): Needs attention `bg-error-container text-error`, Completed `bg-success-container text-on-success-container`, overdue `bg-warning-container text-on-warning-container`.

## Changes

### 1. `GET /api/follow-ups` (extended, same path and method)

- Add `meetingStartedAt` (from `meetings.started_at`, falling back to `meetings.created_at`) to each item. Select `meetings(title, started_at, created_at)`.
- `FollowUpItem` gains `meetingStartedAt: string | null`. `FollowUpDetail` already has this field; the detail route keeps working as is.
- No other behaviour change (same ownership filter, same ordering).

### 2. `GET /api/meetings/[id]` (extended)

- For a **personal** meeting only (no `project_id`), also read `follow_ups` (`id, action_item_id, status`) for this meeting, and attach to each action item `followUpId: string | null` and `followUpStatus: FollowUpStatus | null`.
- Project meetings: both fields stay `null` (they use Tasks, no follow-ups).
- `ActionItem` type gains the two optional fields.
- The query runs inside the existing `Promise.all`; a failure there logs and leaves the fields null, never fails the route.

### 3. Follow-ups page redesign (`FollowUpList.tsx`)

- Header: title "Follow-ups", subtitle "Action items from your meetings, grouped by meeting."
- Filter tabs: **Open** (default: pending + needs attention), **Completed**, **All**, each with a count. Stored only in component state.
- Group the filtered items client side by `meetingId`. Groups sorted by `meetingStartedAt` newest first.
- Group header card: meeting title as a `Link` to `/meeting-intelligence/{meetingId}`, the meeting date, and progress "X of Y done" (counts over **all** follow-ups of that meeting, not just the filtered ones). A thin progress bar using `bg-success` on `bg-surface-container`.
- Group rows:
  - A checkbox button (accessible name "Mark done" / "Mark not done") that calls `updateFollowUpStatus(id, "completed" | "pending")`. Optimistic update, revert plus toast on error, disabled while that row is saving.
  - Title (line through and muted when completed), assignee with the `User` icon if set, due date with the `CalendarDays` icon if set. Overdue (due date before today and not completed) gets the warning chip "Overdue".
  - A "Needs attention" chip only when status is `needs_attention` (error-container tokens).
  - A small "Details" link to `/follow-ups/{id}` (keeps the status options there) and the existing `ConfirmDelete`.
  - Priority and notes are not shown in the list.
- Empty states: no follow-ups at all keeps "No follow-ups yet." plus a hint "They appear after a meeting's summary is created." Empty filter shows "Nothing here." for that tab.
- Loading stays on `useLoadingTimeout` + `LoadError`, same as now. Mobile: rows stack, no horizontal scroll at 375px.
- Tokens only, no raw colours.

### 4. Action Items tab (`ActionItemsTab.tsx`)

- New optional prop `canManage?: boolean`. `MeetingTabs` passes `canManage={!projectId && isOwner}` (only the personal meeting owner can update follow-ups, matching `updateFollowUpStatus`'s ownership rule).
- When an item has a `followUpId`:
  - Owner: the same checkbox as the Follow-ups page (shared small component `FollowUpCheck` in `src/components/follow-ups/FollowUpCheck.tsx`, used in both places). Local state so the tab updates without a reload.
  - Others: a read only status chip.
- Items without a follow-up (project meetings) render exactly as today.
- Below the list, for a personal meeting with follow-ups: link "See all follow-ups" to `/follow-ups`.

### 5. Untouched

`FollowUpDetails.tsx`, the follow-up detail and delete routes, the Dashboard card, the pipeline, the DB schema, project Tasks. No new route.

## Tests

- Update `src/components/follow-ups/FollowUpList.test.tsx` for the new layout (the old column header assertions go): grouping by meeting, meeting link href, Open/Completed/All filtering and counts, checkbox calls `updateFollowUpStatus` (mocked) and reverts on failure, overdue chip.
- `src/app/api/follow-ups/route.test.ts`: asserts `meetingStartedAt`.
- New or extended test for `ActionItemsTab`: checkbox shown for owner with a `followUpId`, chip for non owner, nothing for items without one.
- Meeting detail route test (if one exists for GET) asserts the two new fields for personal meetings and null for project meetings.

## Docs

- `AGENTS.md` API Contracts: add two `(extended)` lines for `GET /api/follow-ups` (meetingStartedAt) and `GET /api/meetings/[id]` (followUpId, followUpStatus on personal meeting action items).
- `context/progress-tracker.md` and `context/ui-registry.md` (FollowUpList grouped layout, FollowUpCheck).

## Checks

`npx tsc --noEmit`, `npx eslint` on touched files, `npx vitest run`.

## Manual test steps

1. Open `/follow-ups`: items appear under one card per meeting, newest meeting first, with "X of Y done".
2. Tick an item: it moves out of Open into Completed, progress updates, and stays after reload.
3. Click the meeting name: lands on that meeting. Open its Action Items tab: the same item shows ticked.
4. Untick it there, go back to `/follow-ups`: it is in Open again.
5. Check a project meeting's Action Items tab looks exactly as before.
6. Resize to 375px: no sideways scroll.
