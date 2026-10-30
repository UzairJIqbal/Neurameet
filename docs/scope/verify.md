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

---

# Verify: Promise Ledger slice 2 · Match · updated 2026-10-30
_Steps derived from spec 0001 slice 2 (AC-6, AC-7, AC-8, AC-14). `/check verify` runs these; `/test` locks the durable ones. Matching only looks at meetings that started earlier, so upload A before B._

## UI / manual
- [ ] Upload meeting A with the line `Ali: main Friday tak survey bhej dunga` → A's Ledger tab lists the promise under "Said in this meeting" → AC-6
- [ ] Upload meeting B with the line `Ali: survey bhej diya tha kal` → B's Ledger tab, "Matches found in this meeting", shows a Kept pill, a Suggested pill, the earlier quote from A next to B's quote with its speaker and line → AC-6, AC-7
- [ ] Open A's Ledger tab → the promise lists the later meeting link (kept · suggested) → AC-6
- [ ] On B, press **Check again** twice → button reads "Checking…" while it runs, the list still shows one match for the pair → AC-8
- [ ] Put invalid values in both `GOOGLE_GENERATIVE_AI_API_KEY` and `GROQ_API_KEY` in `.env.local`, restart, press Check again on B → toast "Promise matching did not finish. Open the Ledger tab and press Check again.", route answers 502, existing matches unchanged, Summary and AI Chat still load; restore the keys → AC-14
- [ ] On B, press **Retry summary generation** in the Summary tab → summary regenerates, Ledger tab refetches with the match still present → AC-6, AC-14

## Database (Supabase SQL editor)
- [ ] `select item_id, evidence_meeting_id, relation, quote, line_number, confidence, state from ledger_links where evidence_meeting_id = '<B id>';` → one row for the pair, `confidence >= 0.7`, the quote appears in B's transcript at `line_number` → AC-7
- [ ] `update ledger_links set state = 'confirmed', decided_at = now() where evidence_meeting_id = '<B id>';` then press Check again on B → the row keeps `state = 'confirmed'` and its quote → AC-8
- [ ] `select proname, proconfig from pg_proc where proname = 'match_ledger_candidates';` → one row, `search_path=public` → RPC live

## API
- [ ] `POST /api/ledger/match` signed out → 401
- [ ] `POST /api/ledger/match` with `{}` → 400
- [ ] `POST /api/ledger/match` for your meeting while signed in as another user → 404
- [ ] `POST /api/ledger/match` on a meeting with no transcript, or not yet indexed for chat → 409

## Commands
- [ ] `npx vitest run src/agent/ledger.test.ts src/agent/ledger-match.test.ts src/app/api/ledger/match/route.test.ts` → all pass → verdict filter, lock rule, route codes
- [ ] `npx tsc --noEmit` → clean → types
- [ ] `npm run build` → exit 0, `/api/ledger/match` listed → builds

## Acceptance-criteria coverage
- AC-6 later meeting evidence becomes a suggested kept or reversed link · covered by UI steps 1-3, 6
- AC-7 only confident (≥ 0.7), verified quotes with line and speaker are stored · covered by UI step 2, database step 1, `filterVerdicts` tests
- AC-8 reruns never duplicate and never touch confirmed or rejected links · covered by UI step 4, database step 2, `runLedgerMatch` tests
- AC-14 a judge failure writes nothing and never blocks summary or chat · covered by UI step 5, route 502 test, `runLedgerMatch` judge failure test
- Known limit: meetings processed before this slice have no item embeddings; press Check again or Retry summary on the earlier meeting once before matching against it

---

# Verify: Promise Ledger slice 3 · Review, overdue, reversal alert · updated 2026-10-30
_Steps derived from spec 0001 slice 3 (AC-9, AC-10, AC-11). Reuse meetings A and B from slice 2. For the reversal steps, also upload meeting C (started after A) with a line that undoes A's decision, such as `Sara: Vercel nahi, hum Netlify use karenge`, when A holds `Sara: ہم Vercel استعمال کریں گے`._

## UI / manual
- [ ] On B's Ledger tab, a suggested match shows **Confirm** and **Not a match** → AC-9
- [ ] Press **Confirm** → the button reads "Saving…", both buttons disable, then the card shows a Confirmed pill and an **Undo** button, with no full page spinner → AC-9
- [ ] Open A's Ledger tab → the promise status pill reads Kept → AC-9
- [ ] On B, press **Undo** → the card goes back to Suggested with Confirm and Not a match; A's promise is Open (or Overdue) again → AC-9
- [ ] On B, press **Not a match** → the state pill reads "Not a match", A's promise stays Open → AC-9
- [ ] Upload a meeting with `Ali: main kal tak report bhej dunga` dated in the past (or set its `due_date` to yesterday in SQL) → its Ledger tab shows an Overdue pill; set `due_date` to today → it shows Open → AC-10
- [ ] Open C's Ledger tab → a red card above the matches reads "1 earlier decision was reversed in this meeting", with A's statement and both quotes, and the Ledger tab label shows a red "1" pill → AC-11
- [ ] On C, press **Not a match** on the reversed match → the red card and the tab pill disappear without a page reload → AC-11
- [ ] Press **Undo** on it → the red card and the "1" pill come back → AC-11
- [ ] Turn off the network (DevTools offline) and press Confirm → toast "Could not save your review. Try again.", the card stays as it was → error path
- [ ] Sign in as a guest or another user on C → no Ledger tab and no pill → owner only

## Database (Supabase SQL editor)
- [ ] After Confirm on B: `select state, decided_at from ledger_links where evidence_meeting_id = '<B id>';` → `confirmed`, `decided_at` set; `select status from ledger_items where id = '<A item id>';` → `kept` → AC-9
- [ ] After Undo: same queries → `suggested`, `decided_at` null; item `open` → AC-9
- [ ] `select count(*) from ledger_items where status = 'overdue';` → 0 (overdue is never stored) → AC-10

## API
- [ ] `POST /api/ledger/links/<id>/review` signed out → 401
- [ ] With `{ "decision": "approve" }` → 400
- [ ] With an id that is not a UUID, or another user's link → 404 with `{ "error": "Link not found" }` both times
- [ ] With `{ "decision": "confirm" }` on your own link → 200 `{ id, state: "confirmed" }`

## Commands
- [ ] `npx vitest run src/agent/ledger.test.ts "src/app/api/ledger/links/[id]/review/route.test.ts" src/components/meeting-intelligence/LedgerTab.test.tsx src/components/meeting-intelligence/MeetingTabs.test.tsx` → all pass → route codes, recompute, buttons, card, badge
- [ ] `npx tsc --noEmit` → clean → types
- [ ] `npm run build` → exit 0, `/api/ledger/links/[id]/review` listed → builds

## Acceptance-criteria coverage
- AC-9 confirm, reject (Not a match), and undo, with item status recomputed every time · covered by UI steps 1-5, database steps 1-2, route and recompute tests
- AC-10 overdue is derived on read from your local date and never stored · covered by UI step 6, database step 3, `deriveLedgerStatus` tests
- AC-11 a reversed decision raises a card and a tab badge, both hidden once you mark it Not a match · covered by UI steps 7-9, LedgerTab and MeetingTabs badge tests

# Verify: Promise Ledger slice 4 · Meeting date on upload, plus the prep hook · updated 2026-10-30
_Steps derived from spec 0001 slice 4 (AC-5, AC-15). Run the dev server on port 3100 (3000 is taken)._

## UI
- [ ] Open **Upload Transcript** from the dashboard (no meeting attached) → a "Meeting date (optional)" field shows under the title, and the picker will not go past your local today → AC-5
- [ ] Open Upload from an existing meeting's page → the date field is hidden → AC-5
- [ ] Upload a transcript dated 2026-10-01 containing `Ali: main Friday tak survey bhej dunga` → in the Ledger tab the promise's due date is Fri 2 Oct 2026 (Friday after the meeting date, not after today) → AC-5
- [ ] Leave the date empty and upload → the meeting shows today's date, as before → AC-5
- [ ] Open **Prep**, enter a title close to that survey promise, press Generate prep → an "Open promises and decisions" card lists it with a red Overdue badge, the quote, Ali, the due date, and a "From <title>, <date>" link → AC-15
- [ ] Click that link → it opens the source meeting → AC-15
- [ ] Mark the promise kept (confirm a kept match), then generate prep again → it no longer appears → AC-15

## Database
- [ ] `select started_at from meetings where id = '<new meeting id>';` → `2026-10-01 12:00:00+00` → AC-5
- [ ] `select * from match_ledger_prep_items(<any 768 vector>, 'unknown-user', 5);` → 0 rows (owner scoped) → AC-15

## API
- [ ] `POST /api/transcript/upload` with `"meetingDate": "2026-02-30"` → 400 `{ "error": "Meeting date must be a valid date (YYYY-MM-DD)" }`, no meeting created → AC-5
- [ ] With a date two or more days ahead → 400 `{ "error": "Meeting date cannot be in the future" }` → AC-5
- [ ] With a `meetingId` and any `meetingDate` → the date is ignored, `started_at` unchanged → AC-5
- [ ] `POST /api/prep` → response has `suggestions` and `ledgerItems` (at most 5, open or overdue only) → AC-15

## Commands
- [ ] `npx vitest run src/lib/meeting-date.test.ts src/app/api/transcript/upload/route.test.ts src/agent/prep.test.ts src/components/PrepPage.test.tsx` → all pass
- [ ] `npx tsc --noEmit` → clean
- [ ] `npm run build` → exit 0

## Acceptance-criteria coverage
- AC-5 optional meeting date on new uploads, stored at noon UTC, anchors relative due dates, ignored on attach · covered by UI steps 1-4, database step 1, API steps 1-3, `parseMeetingDate` and upload route tests
- AC-15 prep shows up to 5 related open or overdue ledger items with a link to the source meeting, and never fails prep · covered by UI steps 5-7, database step 2, API step 4, prep and PrepPage tests

## Value sourcing
- Meeting date for the extraction prompt · `meetings.started_at`, set from `meetingDate` on upload (else now)
- Prep `ledgerItems` · `match_ledger_prep_items` RPC on the prep query embedding, overdue derived from the server UTC date

# Verify: Promise Ledger slice 5 · Evaluation script plus demo seed · updated 2026-10-30
_Steps derived from spec 0001 slice 5 (AC-16). Run the dev server on port 3100 (3000 is taken)._
## Commands
- [ ] `npx vitest run src/lib/ledger-eval-metrics.test.ts` → 8 tests pass (precision, recall, accuracy, kappa) → AC-16
- [ ] `npm run eval:ledger -- --limit 3` → prints a per language table for kept and reversed, accuracy, "needs label_b" for kappa, exit 0 → AC-16
- [ ] Review every `label_a` in `scripts/ledger-eval/pairs.json`, have a second person fill every `label_b` blind, then `npm run eval:ledger -- --out scripts/ledger-eval/results.json` → full table plus a kappa number over 40 pairs → AC-16
- [ ] Edit one `label_a` to an invalid value and run again → exit 1 naming the pair id; revert → AC-16
## UI / manual (demo seed)
- [ ] Follow `scripts/ledger-demo/README.md`: upload meeting 1 dated 2026-10-01 → Ali's survey promise due 2026-10-02, shown Overdue → AC-4, AC-10
- [ ] Upload meeting 2 dated 2026-10-08 → red reversal card plus tab badge for the Vercel decision → AC-11
- [ ] Upload meeting 3 dated 2026-10-15 → kept suggestion for the survey; confirm it; meeting 1 shows Kept → AC-6, AC-9
## Acceptance-criteria coverage
- AC-16 covered by the four command steps; the demo steps re-exercise AC-4, AC-6, AC-9, AC-10, AC-11 end to end.
