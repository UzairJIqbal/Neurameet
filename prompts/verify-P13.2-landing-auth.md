# Verify: P13.2 Landing page + auth pages · 2026-08-29
_Steps derived from the P13.2 scope line ("fix overflow, cramped copy, broken hero/footer grids, unusable inputs at 375/768"). `/check verify` runs these; `/test` locks the durable ones._

## UI / manual (at true mobile width)
- [ ] 375px, landing `/`: hero dashboard mockup shows the 3 stat cards at a readable width (the inner sidebar is hidden below `sm`), no ~7px slivers. → P13.2 hero mockup
- [ ] 375px, landing `/`: Meeting Intelligence mockup — the "Search meetings…" and "Filter" pills sit on their own wrapped row, not clipped on the right edge. → P13.2 history mockup
- [ ] 375px, landing `/`: nav renders the hamburger (desktop nav hidden); opening it shows the menu; no horizontal page scroll anywhere. → P13.2 nav + no scroll
- [ ] 375px, landing `/`: FeatureGrid / SocialProof / EnterpriseGrid / AiArchitecture / Footer all stack to their mobile column counts (1 or 2), nothing overflows. → P13.2 grids
- [ ] 375px, `/sign-in` and `/sign-up`: form is full width, inputs fill the column (`w-full`), right walkthrough panel is hidden, no horizontal scroll, CTAs full width. → P13.2 auth inputs
- [ ] 375px, `/forgot-password` and `/verify-email`: same as above — full width form, no horizontal scroll, inputs usable. → P13.2 auth inputs
- [ ] 768px, landing `/` and `/sign-in` + `/sign-up`: layouts match the `md` breakpoint (nav visible, auth splits to form + walkthrough, grids step up); no overlap, no horizontal scroll. → P13.2 tablet
- [ ] 1440px: landing and auth render exactly as before the change (desktop unchanged). → P13.2 desktop intact

## Commands
- [ ] `npx tsc --noEmit` → exit 0
- [ ] `npm run build` → exit 0

## Acceptance-criteria coverage
- P13.2 hero mockup: step 1 · P13.2 history mockup: step 2 · P13.2 nav + no scroll: step 3 · P13.2 grids: step 4 · P13.2 auth inputs: steps 5 and 6 · P13.2 tablet: step 7 · P13.2 desktop intact: step 8.
