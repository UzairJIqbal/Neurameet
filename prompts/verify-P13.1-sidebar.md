# Verify: P13.1 Sidebar mobile behavior · updated 2026-08-29
_Steps derived from the P13.1 scope line ("add collapse/hamburger/off canvas if missing, keep desktop intact, keep account + sign out reachable"). `/check verify` runs these; `/test` locks the durable ones._

## UI / manual (at true mobile width)
- [ ] 375px, any (home) page (e.g. /dashboard): hamburger visible top-left → tap → off-canvas sidebar slides in from left, dim backdrop shows, no horizontal page scroll. → P13.1 open
- [ ] 375px, drawer open: tap a nav link (e.g. Follow ups) → drawer closes, route changes, content full width (nothing sits under the rail). → P13.1 route-close + no overlap
- [ ] 375px, drawer open: tap backdrop → drawer closes; press Escape → drawer closes. → P13.1 close affordances
- [ ] 375px, drawer open: open account menu (avatar) → Manage account + Sign out reachable. → P13.1 account + sign out reachable
- [ ] 768px: same hamburger drawer behavior; content full width when closed. → P13.1 tablet
- [ ] 1440px: sidebar is the 260px rail as before, no hamburger, content offset by 260px, layout identical to pre-change. → P13.1 desktop intact
- [ ] 375px and 768px with drawer closed: no horizontal scrollbar anywhere (overflow-x-clip working). → P13.1 no page scroll

## Commands
- [ ] `npx tsc --noEmit` → exit 0
- [ ] `npm run build` → exit 0

## Acceptance-criteria coverage
- P13.1 open: step 1 · P13.1 route-close + no overlap: step 2 · P13.1 close affordances: step 3 · P13.1 account + sign out reachable: step 4 · P13.1 tablet: step 5 · P13.1 desktop intact: step 6 · P13.1 no page scroll: step 7.
