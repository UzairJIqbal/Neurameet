# Step A4 + A5 — Dashboard dead-control cleanup

Last updated: 2026-08-16

## Context

The A0 functional UI audit (verified) flagged several dead controls on the Dashboard.
A1, A2, A3 made the three Settings toggles functional and verified end to end.
A4 and A5 close the remaining Dashboard dead controls. This prompt also folds in
the orphaned-component cleanup that was deferred from the A3 review-fix (per memory.md
"Next session starts with").

All work here is UI-only wiring. No business logic, no DB, no AI. Per AGENTS.md,
components must not call the DB or AI SDK directly — and this task does not need to.
Routes already exist: `/meeting-intelligence`, `/meeting-intelligence/[id]`,
`/follow-ups`, `/follow-ups/[id]`, `/ai-chat`, `/join-meeting`.

## Scope (in)

- `src/components/DashboardContent.tsx`
  - A4: the two "View All" `<a href="#">` links → real `next/link` routes.
    - Meeting Intelligence "View All" → `/meeting-intelligence`
    - Meeting Follow-ups "View All" → `/follow-ups`
  - A5: the "Open Insights" buttons (currently a `<button>` with no `onClick`) →
    `router.push("/meeting-intelligence")`. (Dashboard uses sample data today, so the
    list route is correct; when Dashboard moves to live data these should target
    `/meeting-intelligence/[id]` — leave a short comment noting that.)
  - A5: the follow-up card CTA buttons (currently `<button>` with no `onClick`, labels
    "View Task" / "Review") → `router.push("/follow-ups")`. (Same future-[id] note.)
  - Deferred cleanup: quick-actions grid is `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`
    but now has 5 cards (A3 added Schedule Meeting). Change `lg:grid-cols-4` →
    `lg:grid-cols-5` so the 5th card sits on the same row instead of wrapping alone.
- Delete orphaned components (imported nowhere, and `HomeCard` imports a non-existent
  `../../constants` `meetingCardDetails`; the real one is at repo-root `./constants`):
  - `src/components/HomeCard.tsx`
  - `src/components/MeetingTypeLists.tsx`
  - The `meetingCardDetails` array in repo-root `./constants/index.tsx` is only consumed
    by `HomeCard`, so remove that array too (leave the rest of the shared constants file
    untouched).

## Scope (out)

- A6 global search (needs a short `/architect` pass — deferred, separate prompt).
- A7 landing footer dead links (separate prompt, has its own routing decision).
- Do NOT touch the top-bar global search `<input>` (A6 territory).
- Do NOT add any new routes, pages, or API calls.

## Acceptance criteria

1. Both Dashboard "View All" links navigate to the correct real pages
   (`/meeting-intelligence`, `/follow-ups`) and no longer use `href="#"`.
2. Each "Open Insights" button opens `/meeting-intelligence`.
3. Each follow-up CTA button ("View Task" / "Review") opens `/follow-ups`.
4. The 5 quick-action cards render on one `lg` row (5 columns).
5. `HomeCard.tsx` and `MeetingTypeLists.tsx` are deleted and not imported anywhere.
6. `npx tsc --noEmit` is clean and `npx next build` exits 0.

## Verification

- `npx tsc --noEmit`
- `npx next build` (lint is skipped by the build in this sandbox; re-run `npm run lint`
  in the user's real environment if it hangs here).
- Manual: open Dashboard, click both "View All" links, click an "Open Insights" button,
  click a follow-up CTA; confirm each navigates to the right page. Confirm the quick
  actions row shows 5 cards at `lg` width.
