# Step P12 — Meeting pages updation

## Context
The four meeting list pages (Meeting Intelligence, Recordings, Previous, Upcoming) had no delete
functionality anywhere in the app, two of them had a stuck scroll, and two had useless controls
(Previous "Open" routed to the Meeting Setup screen for a past meeting; Upcoming "Start" was always
enabled regardless of the scheduled time). P12 adds delete everywhere it is needed, fixes the scroll,
and rewires the dead controls. Zero-cost only: Supabase deletes + Stream recording/call deletes; no new paid tool.

## Decisions (resolved in `/architect`)
- Delete = Stream call + Supabase row. Previous/Upcoming render Stream calls (keyed by call id), so a
  new `DELETE /api/meetings/by-call/[callId]` deletes the Stream call (creator-enforced) and cascade-deletes
  the linked Supabase meeting row. Meeting Intelligence renders Supabase rows → `DELETE /api/meetings/[id]` (cascade).
- Cascade is via the existing FK `on delete cascade` constraints in `supabase/schema.sql` — deleting the
  `meetings` row removes transcripts, meeting_chunks, action_items, follow_ups, meeting_categories,
  meeting_insights, attendance_events in one operation. No explicit child deletes needed.
- Previous "Open" → "Open Insights": route to `/meeting-intelligence/[meetingId]` when a Supabase meeting
  links the call (streamCallId map), else fall back to `/after-meeting/[call.id]` (the recap page is keyed by call id).
- Extra feature needing delete: Follow-ups list + details.

## Files changed
- `src/components/ui/confirm-delete.tsx` (NEW) — shared two-step confirm popover, `error` tokens when armed.
- `src/lib/recordings.ts` — `deleteUserRecording(userId, id)`: owner-only match via `getUserRecordings`, Stream `video.deleteRecording`, cache invalidation.
- `src/app/api/meetings/[id]/route.ts` — +`DELETE` (owner via `meetings.user_id`, cascade).
- `src/app/api/meetings/by-call/[callId]/route.ts` (NEW) — +`DELETE` (Stream `deleteCall` creator-enforced + cascade Supabase row if owned).
- `src/app/api/recordings/[id]/route.ts` (NEW) — +`DELETE` (Stream, owner-only).
- `src/app/api/follow-ups/[id]/route.ts` — +`DELETE` (owner via meetings.user_id).
- `src/components/RecordingPage.tsx` — scroll fix (`h-full min-h-0 overflow-y-auto`), client-side filter input, per-row Delete.
- `src/components/PreviousPage.tsx` — scroll fix, "Open Insights" with recap fallback, per-row Delete (owner-only), title falls back to `custom.title`.
- `src/components/UpcomingPage.tsx` — "Start" disabled with live countdown until `call.state.startsAt` (30s tick), Copy Link kept, per-row Cancel/Delete (owner-only).
- `src/components/meeting-intelligence/MeetingList.tsx` — per-row Delete.
- `src/components/follow-ups/FollowUpList.tsx` — per-row Delete (row restructured to avoid nested interactive elements).
- `src/components/follow-ups/FollowUpDetails.tsx` — header Delete.

## Verification
- `npx tsc --noEmit` clean.
- `npm run build` exit 0 (new routes present).
- `npx vitest run` — 94 passed, no regressions.
- Manual (dev) QA: Recordings filter + delete; Previous "Open Insights" routes correctly; Upcoming Start
  enables at start time; Meeting Intelligence + Follow-ups delete removes rows and cascades.
