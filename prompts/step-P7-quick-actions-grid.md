# Step P7 — Dashboard Quick Actions layout (3+2 grid)

## What we are building

A layout only change to the Dashboard Quick Actions. The five cards now render
five across on desktop and feel cramped. They will instead render as a
responsive grid that lands on a 3+2 layout on desktop: three cards on the top
row, two cards on the bottom row, left aligned. Each card gets more width and
breathing room. No behavior, data, icons, or copy changes.

## Decisions (settled in /architect, confirmed)

- Grid columns: `grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3`. Desktop caps
  at three columns, so the five cards flow as 3 then 2.
- Card order unchanged: New Meeting, Join Meeting, Upload Transcript on top;
  Ask AI, Schedule Meeting on bottom.
- No card internal restyle, no new component, no data change. Pure className edit.

## Files touched

- `src/components/DashboardContent.tsx` line 303: the quick actions grid div
  className `lg:grid-cols-5` becomes `lg:grid-cols-3`.

## Verification

- `npx tsc --noEmit` clean.
- `npm run build` exit 0.
- Browser: Quick Actions show three across on desktop, the fourth and fifth wrap
  to a second row (two cards, left aligned); mobile stacks to one column, tablet
  shows two columns.

## Out of scope

- P9 will later remove the Ask AI card and add a floating chat bubble. P7 keeps
  all five cards. We do not pre build for P9 here.
