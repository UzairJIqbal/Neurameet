# 0006. Remove Promise Ledger, Live Ledger, and Tasdeeq

**Date**: 2026-11-21
**Status**: In Progress (phase 1 in code; unlink migration and phase 2 drop pending)

## Summary

This spec takes three signature features out of NeuraMeet: the Promise Ledger, the Live Ledger, and Tasdeeq verified minutes. Every route, screen, helper, test, and database table that exists only for them goes away. Everything else keeps working: the meeting pipeline, tasks, GitHub, prep, search, and meeting delete.
Phase W's Proof Chain (the chain from what was said, to a task, to a merged PR) loses only its last step, "Kept". The work ships in two parts. First the code is removed and deployed. Then a separate migration drops the tables on Supabase.

## Requirements

**User stories**:
- As the project owner, I want the three features gone so that the product is smaller, easier to explain, and has less code to maintain.
- As a user of any other feature, I want nothing else to change so that meetings, transcripts, summaries, tasks, GitHub, and projects work exactly as before.

**Acceptance criteria**:
- **AC-1**: None of these routes exist any more: `/api/ledger`, `/api/ledger/match`, `/api/ledger/links/[id]/review`, `/api/ledger/live/*` (`checkin`, `card`, `agreement`, `vote`, and the root), `/api/minutes/*` (`review`, `claim`, `attest`, `suggestion`, `seal`, `verify`, `pdf`, and the root), and `/api/projects/[id]/ledger`. Calling any of them returns 404.
- **AC-2**: The page `/minutes/verify/[sealId]` is gone. No screen shows a Ledger tab, a Minutes tab, the Live Ledger panel inside a call, the Agreement prompt, the project Decisions and Promises tab, or the Prep page "Promise Ledger" section. No link, nav item, or `?tab=promises` link points at a removed screen.
- **AC-3**: The meeting pipeline (`/api/ai/process` and the server pipeline from spec 0005) still writes the summary, key points, decisions text, action items (or proposals on a project meeting), and category. It writes no `minutes_draft`, no ledger items, and runs no ledger match step. The AI prompt no longer asks for `ledgerItems` or the minutes only fields: line attribution and dissent suggestions.
- **AC-4**: These minutes review guards are removed: the 409s in `/api/ai/process`, `/api/transcript/upload`, `/api/transcript/download`, `POST /api/meetings/[id]/project`, `DELETE /api/meetings/[id]`, and `DELETE /api/projects/[id]`. Each route now behaves as it would with no review present. Meeting delete stays owner only.
- **AC-5**: A task's Outcome card shows three steps, Said, Task, and Shipped, with no Kept step. Said takes its quote from the task's own source (the task quote fields, else the earliest merged action item's `quote`, `quote_speaker`, `quote_line`). Viewer redaction works exactly as it does today.
- **AC-6**: A closing PR that merges into the default branch still completes the task (`apply_merge_completion` returns `completed`). A merged revert still reopens it (`apply_merge_revert` returns `reopened`). Neither function touches a ledger table.
- **AC-7**: `/api/prep` returns `{ suggestions }` with no `ledgerItems`. The project assistant (`/api/ai/chat` with `projectId`), `/api/search`, and `/api/projects/search` work without ledger data. The Ctrl K palette no longer lists decision statements.
- **AC-8**: Project details, cards, activity, and notifications no longer include `decisionCount`, ledger activity kinds (`ledger.*`), or the "A merge may keep a promise" notification. The activity and notification category counts still add up to the shown totals.
- **AC-9**: After the code deploy, a migration drops these from Supabase: `ledger_items`, `ledger_links`, `ledger_live_marks`, `ledger_agreements`, `ledger_agreement_votes`, `minutes_reviews`, `minutes_lines`, `minutes_attesters`, `minutes_speaker_claims`, `minutes_attestations`, `minutes_dissent_suggestions`, `minutes_seals`, the column `meeting_insights.minutes_draft`, and every ledger or minutes SQL function and trigger. It also deletes the `kept_suggestion` notification rows and recreates the `notifications.kind` check constraint without that value. No drop uses CASCADE, so a missed dependency fails loudly instead of silently removing a view. `supabase/schema.sql` matches the result.
- **AC-10**: Typecheck, lint (no new warnings), `npx vitest run`, and `next build` all pass. No test file is left that imports a deleted module.
- **AC-11**: Docs match the code. Specs 0001, 0002, and 0003 read `Removed by [0006](../0006-remove-ledger-and-minutes/index.md)`. In AGENTS.md, the three Signature Feature scope sections and their API contract lines are removed, and the Phase W "Promise Ledger, Live Ledger, and Tasdeeq stay" decision is updated. `MINUTES_SIGNING_PRIVATE_KEY` leaves the Security list. The scope rows are marked removed, and the context files (`architecture.md`, `ui-registry.md`, `progress-tracker.md`, `project-overview.md`, `build-plan.md`) are updated. Landing page copy no longer advertises the removed features.

## Decision

**Chosen option**: Option 1: Full removal with a slimmed Proof Chain, code first, then drop.

Delete all three features in the code, rewrite the shared touch points so they no longer depend on them, ship that, then drop the tables in a second migration.

## Feature design

**Data model sketch** (the target after the migration):
- Removed tables: the 12 tables listed in AC-9 (each has RLS and service role grants that go with it).
- Removed column: `meeting_insights.minutes_draft`.
- Removed SQL functions and triggers: `match_ledger_candidates` (both definitions, around lines 395 and 778, with their grants), `match_ledger_prep_items`, `ledger_recompute_item_status`, `ledger_links_after_delete` with `trg_ledger_links_after_delete`, `add_code_ledger_links` (around 1473, with its revoke at 1580 and grant at 1584), plus any other minutes or live ledger helper function found in `schema.sql`. Also removed from `schema.sql`: the `alter table ledger_items` block that adds `source`, `agreed_count`, `total_count` (around 577), the `alter table ledger_links` block and the `ledger_links_confirmed` index (around 1590), and the code link columns and `ledger_links_code_unique` index (around 1457).
- Removed notification kind: `kept_suggestion` (from the `notifications.kind` check constraint around line 1647, and from the category map in `src/lib/notifications.ts`).
- Rewritten view: `project_activity` (around line 1596) loses its `'ll:'` union branch that reads `ledger_links` and `ledger_items`. The other branches stay as they are.
- Rewritten SQL functions (same signature, same return values): `move_meeting_to_project` (drop the `minutes_reviews` check and the `minutes_review` exception); `apply_merge_completion` (drop both `perform add_code_ledger_links` calls, and the `t.status = 'completed'` branch still returns `already_completed`); `apply_merge_revert` (drop the `ledger_links` delete, the update loop, and the `ledger_recompute_item_status` call).
- Kept, unchanged: `meeting_insights.key_points` and `decisions` (summary text), `action_items.quote*`, `tasks`, `task_links`, `proposals`, and every GitHub table.
- Pipeline step key: remove `"ledger"` from the `PipelineStep` union in `src/lib/pipeline-steps.ts`. Steps live in the `transcripts.pipeline` JSON column (no table, no constraint), so the drop migration removes the `steps.ledger` key with `pipeline #- '{steps,ledger}'`. The `claim_pipeline_step` function stays (its comment is reworded).

**API surface** (changes only):
| Endpoint | Method | Change |
|---|---|---|
| All routes in AC-1 | any | Deleted (404) |
| `/api/ai/process` | POST | No minutes 409, no ledger write, no `minutes_draft` |
| `/api/transcript/upload`, `/api/transcript/download` | POST | No minutes 409 |
| `/api/meetings/[id]` | DELETE | No sealed 409 |
| `/api/meetings/[id]/project` | POST | No minutes review 409 |
| `/api/projects/[id]` | GET, DELETE | GET drops `decisionCount`; DELETE has no sealed 409 |
| `/api/tasks/[id]` | GET | `outcome` loses `kept` |
| `/api/prep` | POST | Response is `{ suggestions }` only |
| `/api/projects/search` | GET | Drops decision statement results |
| `/api/projects/[id]/activity` | GET | No `ledger.*` kinds or category |
| `/api/notifications` | GET | No ledger suggestion notifications |

**Value sourcing**:
| Action | Value | Source |
|---|---|---|
| Outcome card, Said | quote, speaker, line | `tasks` quote fields (today's `input.quote`), else the earliest `action_items` row with `merged_into_task_id = task.id` (`quote`, `quote_speaker`, `quote_line`), else `typed` |
| Outcome card, Said | meeting id and title | the task's source action item meeting, else the earliest merged action item's meeting |
| Outcome card, Shipped | PR state | `task_links` plus `github_repos.default_branch` (unchanged) |
| Pipeline | key points, decisions text | the same AI call; the `minutes` schema is cut down to `keyPoints` and `decisions` text only |
| Proposal speaker match | the user behind a speaker label | attendance names only (the `minutes_speaker_claims` lookup in `proposals.ts` is removed; this is already the path for any meeting that never had a minutes review) |
| Proposal quote check | quote line match | `findQuoteLines` and `normalizeForMatch`, moved out of `src/agent/ledger.ts` into a new `src/agent/quote-match.ts` |

**Key invariants**:
- No surviving file imports from a deleted module (check with a grep for `ledger`, `minutes`, `live-ledger`, `proof-types`, `kept`).
- `move_meeting_to_project`, `apply_merge_completion`, and `apply_merge_revert` keep their names, arguments, and return strings, so `src/lib/github*.ts` needs no change.
- The code deploy must run cleanly against a database that still has the old tables. Nothing new reads or writes them, so the drop migration can run at any time after the deploy.

**Security model**: There is no new surface. The public `/api/minutes/verify` endpoint and its page go away, so there is one less unauthenticated route. Remove `MINUTES_SIGNING_PRIVATE_KEY` from Vercel and from `.env.local` after the drop. Every other role rule (Owner, Admin, Developer, Viewer) stays as it is.

**Critical test scenarios**:
- Happy path: upload a transcript to a personal meeting and get the summary, action items, and category. On a project meeting you get proposals. Verifies **AC-3**.
- GitHub: a merged closing PR completes the task and a revert reopens it, checked with the existing github tests updated plus a live run. Verifies **AC-6**.
- Outcome card: a task with a quoted source shows Said, Task, and Shipped, and a Viewer sees `hidden`. Verifies **AC-5**.
- Removed routes return 404, and no UI tab renders. Verifies **AC-1**, **AC-2**.
- Meeting delete and project delete succeed with no sealed guard. Verifies **AC-4**.

## Build plan

Build approach: Extend (the project default). This plan works from the outside in, so every step leaves the build green.

1. Move `findQuoteLines` and `normalizeForMatch` (plus any helper they need) from `src/agent/ledger.ts` into `src/agent/quote-match.ts`. Update `src/agent/proposals.ts` and the tests. In the same file, remove the `minutes_reviews` and `minutes_speaker_claims` speaker lookup (around line 96) so speaker matching uses attendance names only, satisfies **AC-3**, **AC-10**.
2. Remove the UI: delete `src/components/live-ledger/`, `useLiveLedger`, `LedgerTab`, `MinutesTab`, `MinutesReview`, `DecisionsTab`, and the `/minutes/verify` page. Unwire them from `MeetingTabs`, `MeetingDetail`, `MeetingRoom`, `UploadTranscriptModal`, `PrepPage`, `ProjectHeader`, `OverviewTab`, `ProjectSettingsTab`, `ProjectAssistant`, `AssistantTab`, and the landing copy (`LandingHero`, `TabbedShowcase`), satisfies **AC-2**, **AC-11**.
3. Slim the Proof Chain: in `proof-chain.ts`, drop `keptForItem`, `keptForTask`, `loadSuggested`, `outcomesForItems`, `saidForItem`, and `taskStepForItem`. `outcomeForTask` builds Said from the task and merged action items (see Value sourcing), and the `kept` field leaves the `Outcome` type. Update `OutcomeCard` and `TaskDrawer` to three steps, satisfies **AC-5**.
4. Remove the routes in AC-1 and their tests, plus the client modules (`ledger-client`, `ledger-match-client`, `live-ledger-*`, `minutes-*`, `proof-types` if nothing is left in it), and the Tasdeeq emails in `src/lib/email.ts` (around lines 90 to 204: the review open email, `sendMinutesSealedEmail`, `sendTasdeeqEmail`, and the verify URL helper), satisfies **AC-1**.
5. Clean the pipeline: in `meeting-pipeline.ts`, drop the minutes lock checks, the minutes draft, `writeLedgerItems`, the ledger match step, and the `ledgerItems` and minutes only prompt fields. Keep `keyPoints` and `decisions`. Remove `maybeRunLedgerMatch` and its `after(...)` call from `src/app/api/ai/embed/route.ts`. Remove `"ledger"` from `pipeline-steps.ts`. Delete `src/agent/ledger*.ts`, `src/agent/minutes*.ts`, `src/lib/ledger-eval-metrics.ts` and its test, `scripts/ledger-eval.ts`, `scripts/ledger-demo/`, `scripts/tasdeeq-seed.ts`, and the `eval:ledger` script. Reword the Promise Ledger comment in `src/lib/meeting-date.ts`, satisfies **AC-3**.
6. Remove the 409 guards in the routes listed in AC-4, satisfies **AC-4**.
7. Clean the shared readers: `prep` (route, agent, `PrepLedgerItem` type), `project-assistant`, `projects/search`, `project-cards` (`decisionCount`), `project-activity`, `activity-text`, `ActivityTab`, `notification-events`, `notifications` (the `kept_suggestion` category entry), `meeting-list`, `meeting-types`, `task-types`, `project-select`, `project-client`, `agent/types`, the test helpers (`project-route-matrix`, `supabase-queue-mock`), and the surviving tests that reference removed data (`meetings/route.test.ts`, `projects/projects.test.ts`, `tasks/tasks.test.ts`, `notification-events.test.ts`), satisfies **AC-7**, **AC-8**.
8. In `schema.sql`, rewrite `apply_merge_completion` and `apply_merge_revert` without the ledger calls, `move_meeting_to_project` without the minutes check, and the `project_activity` view without its `'ll:'` branch. Apply these as one migration now. It is safe while the tables still exist, satisfies **AC-4**, **AC-6**, **AC-8**.
9. Remove the `pdf-parse` devDependency (only the minutes PDF test uses it). Keep `pdf-lib`, because the attendance report needs it. Run typecheck, lint, `npx vitest run`, and `next build`, then commit, push, and deploy, satisfies **AC-10**.
10. After the deploy shows Ready and a smoke test passes, apply the drop migration (AC-9) on Supabase and update `schema.sql` so it no longer creates or alters the dropped objects, satisfies **AC-9**.
11. Update the docs (AC-11) and the progress tracker, satisfies **AC-11**.

## Migration plan

**Strategy**: Code first, then drop (two deployments).
**Phases**:
1. Code removal plus the rewritten merge and revert functions (steps 1 to 9). The old tables stay in place but nothing uses them.
2. The drop migration (step 10), once phase 1 is live.

**Rollback**: You can roll back phase 1 by reverting the commit. Both old function bodies still work, because the tables exist until phase 2. Phase 2 cannot be undone, and the ledger and minutes data is lost (the user accepted this; there is no export).
**Risks**: A database object that still depends on a dropped table (a view, function, or foreign key) would block the drop. The drop uses no CASCADE, so it fails loudly instead of removing something silently. If it fails, fix that object, then run the drop again. A missed reference to a dropped table fails at runtime only after phase 2. Before applying phase 2, a repo wide grep for every dropped table and function name must return nothing outside `schema.sql` and docs.

## Consequences

**Positive**:
- Roughly 60 files, 12 tables, 15 routes, a signing secret, and a public endpoint go away. The product story becomes simpler: meetings, then AI insights, then project tasks, then code.
- One less AI output to parse in the pipeline, so the prompt is a little shorter.

**Negative / tradeoffs**:
- The Proof Chain no longer closes the loop to "promise kept". It ends at "PR merged", which weakens the Phase W claim.
- All existing ledger items, live marks, votes, and sealed minutes are permanently lost after phase 2.
- The FYP loses three features already presented as signature work, so the report and demo script need updating.

**Neutral**:
- `meeting_insights.decisions` (plain summary text) stays and is unrelated to ledger decisions.

## Follow-up

- [ ] Remove `MINUTES_SIGNING_PRIVATE_KEY` from Vercel env after phase 2.
- [ ] Update the FYP report and demo script that mention these features.
- [ ] Enroll a scope row for this removal if you want `/develop` to track it.

## Rationale

See [rationale.md](rationale.md).
