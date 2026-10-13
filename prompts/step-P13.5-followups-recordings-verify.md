# Verify: P13.5 Follow-ups + Recordings reflow · updated 2026-08-29
_Steps derived from the P13.5 prompt acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [ ] Visit `/follow-ups` at 375px width → Action item and Meeting columns stack, Open and Delete buttons drop below the row and stay reachable, no horizontal scroll → P13.5
- [ ] Visit `/recording` at 375px width → Recording and Date columns stack, Play, Delete, and View insights buttons reflow below and stay reachable, the filter input fits the screen, no horizontal scroll → P13.5
- [ ] Repeat both at 768px → tablet layout intact, no horizontal scroll → P13.5

## Commands
- [ ] `npx vitest run` → 117 passed (4 new P13.5 revert-guard tests in FollowUpList.test.tsx and RecordingPage.test.tsx) → P13.5
- [ ] `npx tsc --noEmit` → clean → P13.5
- [ ] `npm run build` → exit 0, compiled successfully → P13.5

## Acceptance-criteria coverage
- P13.5 reflow to stacked cards · covered by /follow-ups and /recording UI steps
- P13.5 per row controls reachable as touch targets · covered by the control drop below steps
- P13.5 fit the Recordings filter · covered by the /recording filter input step
