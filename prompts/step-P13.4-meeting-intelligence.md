# Step P13.4 — Meeting Intelligence list + tabs (responsive)

## Goal
Responsive verification pass over the Meeting Intelligence list (`/meeting-intelligence`) and its
tabbed detail view (`/meeting-intelligence/[id]`). The P13.0 audit classified this screen as
"already responsive"; this step fixes the one genuine small-screen defect (Overview attendance
card squeezing its Download button at 375px), confirms the list reflow and tab strip at 375/768,
and locks responsive tokens with unit tests as revert guards.

## Context (read order)
1. AGENTS.md → workflow + code standards
2. context/ui-tokens.md, context/ui-rules.md (tokens only; no hex, no raw Tailwind colors)
3. context/progress-tracker.md → P13.0 audit verdict (MI list "already responsive")
4. src/components/meeting-intelligence/MeetingList.tsx
5. src/components/meeting-intelligence/MeetingTabs.tsx
6. src/components/meeting-intelligence/MeetingDetail.tsx
7. src/components/meeting-intelligence/OverviewTab.tsx (the real fix)
8. P13.2 / P13.3 for the established responsive-token unit test pattern

## Decisions (from /architect)
- List: KEEP the existing `md:` col-span grid reflow (mirrors Previous/Upcoming/Recordings/
  Follow-ups). No conversion to stacked cards. Verification-only + fix genuine defects.
- Tabs: KEEP `overflow-x-auto` horizontal scroll (standard mobile pattern, contained to its own
  scroll area, no page-level overflow).

## Build steps
1. OverviewTab.tsx — attendance-report card: change
   `flex items-center justify-between gap-4`
   to `flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`
   so the Download button drops below the two-line text at 375 and sits right at `sm+`. Tokens only.
2. MeetingList.tsx — no structural change; confirm header/row reflow tokens:
   Meeting `col-span-6 md:col-span-4`, Date `col-span-6 md:col-span-2`,
   Action `col-span-12 md:col-span-4 md:mt-0 md:flex-nowrap`, Category `hidden md:flex`.
3. MeetingTabs.tsx — keep `overflow-x-auto`; confirm the strip is the scroll container and does
   not propagate horizontal overflow to the page. No structural change.

## Tests (new, tokens only — jsdom has no layout engine)
- src/components/meeting-intelligence/MeetingList.test.tsx
    - mock next/navigation, @clerk/nextjs; stub GET /api/meetings → [{id,title,startedAt,createdAt}]
    - assert header Meeting cell `col-span-6 md:col-span-4`, Date `col-span-6 md:col-span-2`,
      Action `col-span-12 md:col-span-4`; row action cell `col-span-12 md:col-span-4 md:flex-nowrap`.
- src/components/meeting-intelligence/MeetingTabs.test.tsx
    - render with isOwner=true so the Recording tab is visible; mock minimal props
    - assert the tab strip element carries `overflow-x-auto`
    - assert the Overview attendance card carries `flex-col sm:flex-row` (import OverviewTab or
      render MeetingTabs with active Overview and assert the card class)
- Full suite: `npx vitest run` expected 109 + N green.

## Verify (manual, /check verify at true mobile width)
- [ ] /meeting-intelligence at 375px: rows reflow (title+date top row, action drops full width
      below); no horizontal scroll; Category hidden.
- [ ] /meeting-intelligence/[id] at 375px: tab strip scrolls horizontally, all 7 tabs reachable,
      no page-level horizontal overflow.
- [ ] Overview tab at 375px: Download button sits below the attendance text, not squeezed.
- [ ] Stat grid stacks 1-col; Action Items stack; Engagement cards 1-col; chat panel fits.

## Commands
- `npx tsc --noEmit` → clean
- `npx vitest run` → green
- `npm run build` → exit 0

## Out of scope
- Stacked-card rewrite of the list (rejected — keep grid reflow).
- Any change to tab logic, AI/DB calls, or the shared dropdown token fix (P13.10).
