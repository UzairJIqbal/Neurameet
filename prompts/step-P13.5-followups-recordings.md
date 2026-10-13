# P13.5 — Follow-ups + Recordings responsive verification pass

## Context

P13.0 (responsive audit) marked the dedicated list pages — including **Follow-ups**
(`src/components/follow-ups/FollowUpList.tsx`) and **Recordings**
(`src/components/RecordingPage.tsx`) — as _already responsive_, with real defects
clustering elsewhere (P13.1 sidebar, P13.3 dashboard rows, P13.6 Meeting Room panels,
P13.9 floating chat, P13.10 dropdown tokens). P13.4 then confirmed the verified
pattern on `MeetingList` (`src/components/meeting-intelligence/MeetingList.tsx`): a
`grid grid-cols-12` with `md:` col spans plus a `col-span-12` wrapping action cell.

P13.5 is the light verification pass for the Follow-ups and Recordings lists
(build-plan.md §P13.5, scope.md `P13.5`). Step definition wording ("reflow to stacked
cards; keep per row controls reachable; fit the Recordings filter") describes the
**target state**, which the code already satisfies.

## Verification findings (code review, this pass)

Both components already implement the verified `MeetingList` responsive pattern:

**FollowUpList.tsx**
- Header: `Action item` `col-span-6 md:col-span-5`, `Meeting`
  `col-span-6 md:col-span-3`, `Open` `col-span-12 hidden text-right md:col-span-4
  md:block` (Action header correctly hidden on mobile — mirrors P13.3's dashboard fix).
- Row cells: action item `col-span-6 flex flex-col gap-2 md:col-span-5` (title +
  status badge + due date, `break-words`), meeting `col-span-6 truncate … md:col-span-3`.
- Action cell: `col-span-12 mt-2 flex flex-wrap justify-end gap-2 md:col-span-4
  md:mt-0 md:flex-nowrap` — Open (Link) + Delete (ConfirmDelete) reflow below the row
  and stay reachable touch targets. ✓

**RecordingPage.tsx**
- Header: `Recording` `col-span-6 md:col-span-5`, `Date` `col-span-6 md:col-span-3`,
  `Action` `col-span-12 hidden text-right md:col-span-4 md:block`.
- Row cells: filename `col-span-6 flex items-center gap-3 md:col-span-5`
  (`break-words`), date `col-span-6 … md:col-span-3`.
- Action cell: `col-span-12 mt-2 flex flex-wrap justify-start gap-2 md:col-span-4
  md:mt-0 md:flex-nowrap md:justify-end` — Play / Delete / View insights all reflow
  below at mobile, reachable. ✓
- Recordings filter input: `relative w-full max-w-sm` — fits within the 375px content
  area (327px after padding), no overflow. ✓

**No genuine small-screen defect found.** The only stylistic difference from
`MeetingList` is Recordings using `new Date(start_time).toLocaleString()` (longer than
`toLocaleDateString()`); it wraps at the comma within `col-span-6` and causes no
horizontal scroll, so it is not a defect and is left unchanged (no over-building).

## Deliverables

1. **Revert-guard unit tests** (jsdom, mirror `MeetingList.test.tsx` exactly):
   - `src/components/follow-ups/FollowUpList.test.tsx` — assert header tokens
     (`Action item` `col-span-6 md:col-span-5`, `Meeting` `col-span-6 md:col-span-3`,
     `Open` `col-span-12 hidden … md:col-span-4 md:block`) and that the row action cell
     (parent of the `Open` Link) is `col-span-12 md:col-span-4 md:flex-nowrap`.
   - `src/components/RecordingPage.test.tsx` — assert header tokens (`Recording`
     `col-span-6 md:col-span-5`, `Date` `col-span-6 md:col-span-3`, `Action`
     `col-span-12 hidden … md:col-span-4 md:block`) and that the row action cell (parent
     of the `View insights` button) is `col-span-12 md:col-span-4 md:flex-nowrap`.
   - Both tests mock `next/navigation` (`useRouter`) and `global.fetch` to return sample
     data so loading settles (RecordingPage also fetches `/api/meetings` + polls on a
     10s interval — cleanup unmount clears it; no fake timers needed since queries
     resolve in well under 10s). `// @vitest-environment jsdom` header required.
2. **Manual `/check verify` at true mobile width (375 / 768)** — visually confirm both
   lists reflow to the card-like stacked layout, action buttons are reachable, and the
   Recordings filter input fits. This is the visual gate (jsdom has no layout engine;
   the token assertions above are the revert guards).
3. **Tracker updates** — mark `P13.5` done in `docs/scope/scope.md` (Build it + Test it
   `[x]`, `Status: P13.5 done`) and `context/progress-tracker.md` (✅ DONE with the
   verification note that both lists were already responsive per the P13.0 audit).

## Files touched

- `src/components/follow-ups/FollowUpList.test.tsx` (new)
- `src/components/RecordingPage.test.tsx` (new)
- `docs/scope/scope.md` (P13.5 status)
- `context/progress-tracker.md` (P13.5 status)

## Gates (must pass)

- `npx tsc --noEmit` clean
- `npx vitest run` — new tests green; full suite stays green
- `npm run build` exit 0

## Out of scope / do not do

- No structural rewrite of either list, no new CSS framework, no changes to the
  existing `md:` col-span layout, no token migration, no dropdown-token work (that is
  P13.10). Do not "improve" the Recordings date format — not a defect.
- Do not touch any other step (P13.6 / P13.7 / P13.8 / P13.9 / P13.10) in this pass.
