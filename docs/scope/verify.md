# Verify: P13.6 · Meeting Room + Meeting Setup · updated 2026-08-29
_Steps derived from P13.6 scope (side panels usable on small screens without breaking the call; Meeting Setup fits 375). `/check verify` runs these; `/test` locks the durable ones._

## UI / manual (true 375px width)
- [ ] Open a meeting room at 375px → People / Recordings / Reactions / Layout controls reachable in the wrapped control bar → side panels usable
- [ ] Tap **People** → panel slides in from the right, fits the width, dim backdrop appears behind it, long list scrolls inside → panel usable
- [ ] Tap the dim backdrop → panel closes → dismissible on phone
- [ ] As owner, tap **Recordings** → panel appears with dismiss backdrop; tap backdrop to close → dismissible
- [ ] Confirm the wrapped two-row control bar does not cover the panel's lower rows (panel clears it via `bottom-32`) → not covered
- [ ] Open **Meeting Setup** at 375px → device preview, stacked camera/mic dropdowns, toggles, full-width Join all fit; device/audio dropdowns render broken (shared `ui/dropdown-menu.tsx` inert tokens, owned by P13.10) → Setup fits 375

## Commands
- [ ] `npx vitest run src/components/MeetingRoom.test.tsx` → 10 pass (5 new revert-guard tests) → tokens locked
- [ ] `npx tsc --noEmit` → clean → types
- [ ] `npm run build` → exit 0 → builds

## Acceptance-criteria coverage
- side panels usable on small screens (People/Recordings open, fit, scroll, dismiss) · covered by UI steps 1-4 + command steps
- control bar / video not broken by panels (`bottom-32` clears bar) · covered by UI step 5
- Meeting Setup device preview fits 375 · covered by UI step 6
- no Stream call behavior changed · covered by command steps (tsc + build green, no event/hook/lifecycle edits)

---

# Verify: P13.8 · Search + Prep + After-meeting recap · updated 2026-08-30
_Steps derived from P13.8 scope (every enrolled screen usable at 375/768 with no horizontal overflow). `/check verify` runs these; `/test` locks the durable ones._

## UI / manual (true 375px width)
- [ ] Visit `/search` at 375px, type a query, submit → search bar stays on one row, input shrinks, no horizontal scroll → P13.8
- [ ] Visit `/prep` at 375px → form stacks vertically, Generate prep button inline → P13.8
- [ ] Visit an `/after-meeting/[id]` page at 375px → stats grid at 2 columns, participant rows and transcript buttons do not overflow → P13.8

## Commands
- [ ] `npx vitest run src/components/SearchPage.test.tsx src/components/PrepPage.test.tsx src/components/meeting-intelligence/AfterMeetingRecap.test.tsx` → 10 pass → P13.8
- [ ] `npx tsc --noEmit` → clean → types
- [ ] `npm run build` → exit 0 → builds

## Acceptance-criteria coverage
- Search bar usable at 375 (`min-w-0` input, single row, no overflow) · covered by UI step 1 + command steps
- Prep form stacks and Generate button inline at 375 · covered by UI step 2 + command steps
- Recap stats grid reflows 2→3 cols, rows/buttons wrap at 375 · covered by UI step 3 + command steps
