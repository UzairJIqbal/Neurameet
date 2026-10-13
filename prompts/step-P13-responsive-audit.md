# P13.0 — Responsive Audit (canonical defect list)

Audit of every NeuraMeet screen at three breakpoints: mobile 375px, tablet 768px, desktop 1440px.
Tailwind breakpoints in play: sm=640, md=768, lg=1024, xl=1280.

## Method
Agreed method was "code review plus spot checks". The read only explorer subagents were
throttled by the upstream provider (HTTP 429) across all six screen groups, so the audit
was performed as a direct code review on the main thread instead. Every finding below cites
a file and line. Live viewport confirmation at true mobile width is intentionally deferred to
the per fix `/check verify` steps (P13.1 to P13.10), per the agreed plan.

## How to read the findings
- Priority: by usage frequency. Dashboard, Meeting Intelligence, and Meeting Room rank highest.
- Severity: Blocker (unusable), Major (broken but reachable), Minor (cosmetic or low impact).
- Each item names the screen, breakpoint, symptom, file:line, and a fix direction.

## Confirmed defects (the real work)

### D1 — Sidebar overlaps all content below lg (1024px)  [P13.1, Priority: Highest, Severity: Blocker]
- Screen: every authenticated page (Dashboard, Meeting Intelligence, Follow ups, Recordings,
  Personal Room, Settings, Search, Prep, Meeting Room, Meeting Setup).
- Breakpoint: 375 and 768 (blocker at both).
- Symptom: `Sidebar.tsx:54` is `fixed left-0 top-0 z-40 ... w-[260px]`. The content wrapper
  (`Sidebar.tsx:158`) uses `ml-0 ... lg:ml-[260px]`. So below `lg` the 260px sidebar is
  permanently fixed and covers the left 260px of every page. There is no hamburger and no
  off canvas toggle anywhere in the shell. At 768px and 375px the content under the sidebar
  is unusable.
- Current mobile behavior (documented): sidebar is always visible and overlapping; no way to
  dismiss it. This is the foundational P13.1 finding.
- Fix direction: below `lg`, hide the fixed rail and reveal it through a hamburger button or
  an off canvas drawer that toggles open. Keep the fixed 260px rail unchanged at and above
  `lg`. The `Navbar` rendered in the shell should host the hamburger on small screens.

### D2 — Shared dropdown menu + popover use inert shadcn tokens  [P13.10, Priority: High, Severity: Major]
- Screen: every dropdown and popover app wide: account menu, Meeting Setup device and audio
  selectors, any category selector, plus the AI chat / support popovers.
- Breakpoint: all (worst on mobile where the broken background is most visible).
- Symptom: `ui/dropdown-menu.tsx` references tokens that are not defined in the project token
  system (`context/ui-tokens.md`):
  - `bg-popover` and `text-popover-foreground` at lines 50 and 68 (dropdown content has no
    background, so menu items float on whatever is behind them).
  - `bg-accent` and `text-accent-foreground` at lines 30, 87, 103, 127 (no hover or focus
    highlight on items).
  - `bg-muted` at line 166 (separator invisible or wrong color).
  - `ui/popover.tsx:24` repeats `bg-popover` / `text-popover-foreground`.
  The account menu trigger in `Sidebar.tsx:124` is locally fixed with `bg-inverse-surface`,
  but its opened content still uses the broken `bg-popover` from this component.
- Fix direction: map the shadcn tokens to `context/ui-tokens.md` values, for example
  `bg-popover` to `bg-inverse-surface` (or `bg-surface-container-lowest`), `bg-accent` to
  `bg-surface-container-low`, `text-accent-foreground` to `text-on-surface`, `bg-muted` to
  `bg-surface-container`. Apply the same mapping in `ui/popover.tsx`. This underpins the
  correct rendering of the Settings related selectors, Meeting Setup selectors, and the
  account menu.

### D3 — Dashboard inline lists use a non responsive grid  [P13.1 (dashboard), Priority: High, Severity: Major on 375]
- Screen: Dashboard (the mini Meeting Intelligence and Follow ups lists).
- Breakpoint: 375 (major), 768 (minor).
- Symptom: `DashboardContent.tsx` renders its own mini lists with `grid grid-cols-12` and
  fixed `col-span-6 / col-span-3 / col-span-3` (header at lines 320 to 323 and 414 to 417;
  rows at lines 362, 372, 379, 449, 464, 469). There are no `md:` breakpoints and no wrapping
  action row. On 375px the title (~50%), date (~25%), and the "Open Insights" / "Open" button
  (~25%) cramp together and the action button gets squished or overflows.
  Note the contrast: the dedicated list pages (MeetingList, UpcomingPage, PreviousPage,
  RecordingPage, FollowUpList) all use the responsive pattern (`md:` col spans plus a
  `col-span-12 mt-2 flex flex-wrap` action cell). The dashboard simply did not get that
  treatment.
- Also: the dashboard search input is `hidden md:block` (`DashboardContent.tsx:250`), so
  mobile users have no search entry on the dashboard.
- Fix direction: apply the same responsive row pattern used by `MeetingList.tsx` (lines 102
  to 153) to the dashboard inline rows. Consider a mobile search entry point.

### D4 — Floating chat expanded panel obstructs small phones  [P13.9, Priority: Medium, Severity: Major on 375]
- Screen: Floating chat (P9 support chat), when expanded.
- Breakpoint: 375 (major), 768 (minor).
- Symptom: `FloatingChat.tsx:122` is `fixed bottom-6 right-6 ... min-h-[600px] w-[380px]
  max-w-[calc(100vw-3rem)]`. The width cap is good (about 327px on a 375px phone), but
  `min-h-[600px]` makes the panel almost the full height of a 375x667 phone, covering most of
  the screen and obstructing content underneath.
- Fix direction: cap the height on small screens, for example use
  `max-h-[calc(100vh-3rem)]` (or `h-[80vh]` on mobile) instead of a hard `min-h-[600px]`, so
  the panel never exceeds the viewport and scrolls internally.

### D5 — Meeting Room side panels hidden below sm (640px)  [P13.2, Priority: High, Severity: Major on 375]
- Screen: Meeting Room (in call).
- Breakpoint: 375 (major).
- Symptom: `MeetingRoom.tsx:505` and `:515` define the participants and transcript/chat side
  panels as `hidden ... sm:static`. Below 640px they are entirely hidden, so on a phone a
  caller cannot see the participant roster or the live transcript during the call.
- Fix direction: give small screens a way to reach participants and transcript, for example a
  bottom sheet or a tab toggle, instead of hiding the panels completely below `sm`.

### D6 — Meeting Room control bar and participant grid (verify)  [P13.2, Priority: Medium, Severity: Minor / verify]
- Screen: Meeting Room.
- Breakpoint: 375 (verify), 768 (ok).
- Symptom: the control bar (`MeetingRoom.tsx:534` to `:535`) is `fixed inset-x-0 bottom-0 ...
  flex w-fit flex-wrap`. With many controls it wraps to multiple rows on a 375px phone and may
  grow tall enough to overlap the video. The participant area uses `grid grid-cols-12`
  (line 92) and should be confirmed to collapse to a single column on mobile.
- Fix direction: confirm control bar height at 375px; ensure it condenses or scrolls; confirm
  the participant grid is single column on mobile. Treat as verification during P13.2.

### D7 — Meeting Intelligence tab bar scrolls horizontally  [P13.4, Priority: Low, Severity: Minor]
- Screen: Meeting Intelligence detail (tabs).
- Breakpoint: 375 and 768 (minor).
- Symptom: `meeting-intelligence/MeetingTabs.tsx:56` is `flex gap-1 overflow-x-auto` with
  seven tabs (Overview, Summary, Action Items, Recording, Category, AI Chat, Engagement). On
  mobile the later tabs require horizontal scrolling with no position indicator.
- Fix direction: acceptable as a scroll pattern, but consider scroll snap or a "more" affordance.
  Low priority.

## Screens verified responsive (light or no fix needed)
- Landing (`landing/LandingHero.tsx` and siblings): decorative blobs are clipped by
  `overflow-hidden` on the hero (`LandingHero.tsx:9`); headline scales `text-5xl md:text-6xl
  lg:text-7xl`; CTAs stack on mobile (`flex-col sm:flex-row`); mockup uses abstract
  placeholder bars. OK.
- Auth (`auth/AuthLayout.tsx`): form is full width on mobile, branding panel `hidden md:flex`
  (lines 67 to 72). OK.
- Meeting Setup (`MeetingSetup.tsx`): device dropdowns `w-full ... sm:w-auto` (line 52); toggle
  labels `hidden sm:inline` (line 100); controls stack on mobile (line 429); Join button
  `w-full sm:w-auto` (line 467); video preview `aspect-video w-full`. OK.
- Meeting Intelligence list, Upcoming, Previous, Recordings, Follow ups lists: all use the
  responsive `grid-cols-12` with `md:` col spans and a wrapping `col-span-12` action row
  (e.g. `MeetingList.tsx:102` to `153`, `UpcomingPage.tsx:100` to `177`,
  `PreviousPage.tsx:113` to `177`, `RecordingPage.tsx:205` to `234`,
  `FollowUpList.tsx:111` to `153`). OK.
- Settings (`SettingsPage.tsx`): simple stacked cards with toggles; no dropdowns on this page
  (its related selectors live in Meeting Setup and use the D2 component). OK; P13.10 covers the
  shared dropdown tokens it would otherwise rely on.
- Modals (`ui/animated-modal.tsx:91`): `w-full max-w-xl ... lg:max-w-[42rem]` with
  `max-h-[90vh]`; Meeting Model (schedule) and Upload Transcript modal use it. Verify the
  schedule and upload modals render within the viewport on 375px during P13.8.

## Resulting priority order for P13.1 to P13.10
1. P13.1 — Sidebar off canvas / hamburger (D1) plus Dashboard inline list reflow (D3).
2. P13.10 — Shared dropdown + popover tokens (D2).
3. P13.2 — Meeting Room mobile (D5 side panels, D6 control bar verify).
4. P13.9 — Floating chat height cap (D4).
5. P13.4 — Meeting Intelligence tabs (D7) plus a light list check.
6. P13.3 / P13.5 / P13.6 / P13.7 / P13.8 — mostly light or verification passes on already
   responsive screens (landing/auth, follow ups/recordings/personal room, settings/search/prep,
   modals). Keep as verification steps; close them quickly if the live check confirms OK.
