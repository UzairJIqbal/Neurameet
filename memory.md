# Memory — Promise Ledger: commit + `/check verify promise ledger` (in progress)

Last updated: 2026-10-30 (evening, about 16:40 UTC)

## What was built

- Slices 1 to 5 committed on branch `feat/promise-ledger`, commit `8f419a0` (not pushed, no PR). `reports/` and `research_notes/` left untracked on purpose.
- Installed the `anthropics/skills@webapp-testing` skill for browser verification (Claude in Chrome cannot reach localhost).
- Temporary verify harness (gitignored, delete when done): `.claude/verify-tmp/`
  - `pw.config.ts`: reuses `playwright.config`, baseURL `http://localhost:3100`, no webServer, `setup` project = `tests/auth.setup.ts` (Clerk e2e user, saves `tests/.clerk/e2e-auth.json`), `verify` project matches `*.verify.ts`. Absolute paths are required (relative storageState gave ENOENT).
  - `upload.verify.ts` (UI upload via dashboard modal, API fallback), `finish.verify.ts` (embed + match + Ledger tab capture; env MID, TAG, FILE, TITLE, DATE), `review.verify.ts` (guards, confirm/undo, check again, prep), `cleanup.verify.ts` (DEL_IDS), `peek.verify.ts`.
  - Run: `OUT_DIR=<ev dir> npx playwright test -c .claude/verify-tmp/pw.config.ts --project=verify <name>.verify`
- Evidence dir (session scratchpad, may be gone next session): `/private/tmp/claude-502/-Users-UzairIqbal-Projects-neurameet/3fa3f89e-e798-43f7-a570-6a619bb75984/scratchpad/ev/` (meetings.jsonl, review.log, run*.log, screenshots and page text).

## Demo meetings in Supabase (owner: e2e user `user_3HuHMuZsWgk0kXD0Aog93H5GgzT`)

- M1 "Launch planning" 2026-10-01: `434407e2-292e-4414-a3c5-f3682cf683e0`. 4 items (Sara Vercel decision line 5; Ali survey due 2026-10-02 line 8; Hina copy due 2026-10-05 line 10; Bilal line 11). Three promises linked to action items. Ali and Hina show Overdue.
- M2 "Infra review" 2026-10-08: `fd15c050-5a3e-488f-ac36-d691d1007d09`. 3 items. Links: Vercel decision reversed (0.95), Hina kept (line 11), Bilal monitoring kept (line 13). Ali correctly not matched. Tab label showed "Ledger1" (reversal badge).
- M3 "Launch check" 2026-10-15: `a0b2d445-5c6b-4d2d-bbb7-bb3a62d04270`. 4 links: M1 Vercel reversed again (line 2), M2 AWS decision kept, Ali survey kept from both M1 and M2 (line 5). Bilal's M2 migration plan promise not matched (judge miss, note for eval).
- Foreign meeting for owner checks: `6a4124fa-93d6-426f-a8c1-2731e8005403` (another user). Do not modify it.
- Ask the user before deleting M1 to M3; they may want them for the demo.

## Evidence so far (per AC)

- Static: tsc clean, vitest 47 files / 311 tests pass. Live schema: all ledger tables, RPCs, trigger, RLS present.
- AC-1, AC-2, AC-3, AC-4: pass on M1 and M2 (verified quotes with line numbers, language tags, action_item_id, due dates from meeting date).
- AC-5: started_at = 2026-10-01 12:00 UTC; future date 2099-01-01 returns 400 "Meeting date cannot be in the future".
- AC-6, AC-7: pass (links on M2 and M3, confidence >= 0.9, quotes and lines verified).
- AC-10: M1 Ledger tab shows Overdue for Ali and Hina; API returns derivedStatus overdue.
- AC-11: M2 tab label "Ledger1" seen.
- AC-12: signed out 401 on all three routes; foreign meeting GET and match 404, zero-uuid review 404, bad `today` 400, foreign page has no Ledger tab.
- Pending at save time: the rest of review.verify (M2 confirm/undo, Check again idempotence AC-8, M3 confirm, M1 final Kept/Reversed AC-9, prep AC-15), reprocess AC-13, failure isolation AC-14 (manual, needs bad keys), AC-16 eval, AC-17 static (grep found no hex, raw colors or sonner in LedgerTab/MeetingTabs).

## Findings (for the report; `/check verify` does not edit app code)

1. Gemini hang: `generateStructuredWithFallback` in `src/agent/models.ts:103` has no timeout on the Gemini call. Gemini stalled until the 300 s undici headers timeout, then Groq answered. Processing and match each took 5+ min. The upload modal's shared 120 s AbortController (upload + process + embed) aborts first, so the UI never redirects and match never runs from the UI; the server still finishes. Next dev logs "200 in ~119 s" for the aborted client, which is misleading. Suggested fix: about 30 s abort on the primary call.
2. Empty body `{}` on match and review returns 400 before the auth check (401 with a valid body). Minor.
3. In review.verify, "Undo" was not visible right after the first Confirm on M2 (count 0). Not yet explained: check m2-after-first-confirm.txt; it may be the reversal card or a re-render timing issue.

## Current state

- `/check verify promise ledger` finished 2026-10-30: pass with findings. Build passes. Scope box `Verify it` ticked; 41 verified steps ticked in docs/scope/verify.md. Temp harness `.claude/verify-tmp/` and `test-results/` deleted.
- Finding 3 (Undo after Confirm) explained: a review takes about 3 s and the test only waited 2.5 s. Not an app bug.
- AC-8, AC-9, AC-11, AC-13, AC-15 all passed live. Not run: AC-14 bad keys step, full AC-16 eval, offline toast, Check again twice, 409 route case.

## Next session starts with

1. Decide on finding 1 (add about a 30 s timeout on the Gemini call in `src/agent/models.ts`).
2. Decide whether to keep or delete demo meetings M1 to M3.
3. Label review plus full `npm run eval:ledger`, then `/test`, `/check review`, `/document`.

## Open questions

- Fix the Gemini timeout now (separate small task) or note it only?
- Who is the second labeller for `label_b`?
- Keep or delete demo meetings M1 to M3 after verification?
