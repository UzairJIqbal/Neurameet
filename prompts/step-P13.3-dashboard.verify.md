# Verify: P13.3 Dashboard responsive (inline rows + mobile search + floating chat cap) · plan step-P13.3-dashboard.md · updated 2026-08-29
_Steps derived from the P13.3 architect plan. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual (true mobile width)
- [ ] Visit Dashboard at 375px → the two inline lists show title and date on the top line and Open Insights / Open on its own full width row below, no squish, no horizontal scroll. → row reflow
- [ ] At 375px the list header shows Meeting Title and Date only; the Action header column is hidden. → header
- [ ] At 375px a full width search bar appears above Quick Actions; type a title → both panels filter live; the clear X clears it. → mobile search
- [ ] At 768px the desktop header search shows and the mobile bar is hidden; rows use the 5/3/4 md layout. → breakpoint
- [ ] Open the floating chat at 375px → the expanded panel no longer covers the screen; the top of the page stays visible. → floating chat cap

## Commands
- [ ] `npx tsc --noEmit` → clean → build
- [ ] `npx vitest run` → 104 pass → build
- [ ] `npm run build` → exit 0 → build

## Acceptance-criteria coverage
- row reflow covered by step 1, 2 · mobile search covered by step 3 · floating chat cap covered by step 5 · build green covered by commands 1 to 3.
