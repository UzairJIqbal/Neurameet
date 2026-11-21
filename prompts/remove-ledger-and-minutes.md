# Remove Promise Ledger, Live Ledger, and Tasdeeq (spec 0006)

## Goal

Remove the Promise Ledger, the Live Ledger, and Tasdeeq verified minutes completely, and leave every other flow working: the meeting pipeline, tasks and proposals, GitHub merge and revert, Prep, search, the project assistant, Activity, notifications, and meeting and project delete. The Proof Chain Outcome card ends at Shipped (Said, Task, Shipped).

Spec: `docs/specs/0006-remove-ledger-and-minutes/index.md`. The acceptance criteria (AC-1 to AC-11) and the build plan there are the source of truth. This prompt is the order of work and the checks.

## Context to read first

- The spec `index.md` (ACs, Feature design, Value sourcing, Build plan) and `rationale.md` (inventory).
- `src/agent/meeting-pipeline.ts`, `src/agent/proposals.ts`, `src/lib/proof-chain.ts`, `src/lib/project-activity.ts`, `src/lib/notification-events.ts`, `src/lib/notifications.ts`.
- `supabase/schema.sql`: `move_meeting_to_project` (around 1340), `apply_merge_completion` and `apply_merge_revert` (around 1490 to 1560), the `project_activity` view (around 1596), and the `notifications.kind` constraint (around 1647).
- The Stream skill `stream-react` before touching `MeetingRoom.tsx`. This change only removes the Live Ledger panel and hook. No Stream call or device logic changes, so check that nothing else in the call lifecycle depended on `useLiveLedger` (custom event listeners).

## Phase 1: code (one commit, deployed before any table drop)

Work in this order. Run `npx tsc --noEmit` after each step so breakage shows up close to its cause.

1. **Quote helpers.** Create `src/agent/quote-match.ts` with `findQuoteLines`, `normalizeForMatch`, and any private helper they use, moved unchanged from `src/agent/ledger.ts`, with their tests moved to `quote-match.test.ts`. Point `src/agent/proposals.ts` at it. In `proposals.ts`, remove the `minutes_reviews` and `minutes_speaker_claims` lookup (around line 96) so speaker matching uses attendance names only. Update the proposals tests that mock those tables.
2. **UI removal.** Delete:
   - `src/components/live-ledger/`
   - `src/hooks/useLiveLedger.ts`
   - `LedgerTab`, `MinutesTab`, `MinutesReview`, `DecisionsTab`
   - `src/app/minutes/verify/[sealId]/`

   Unwire them from `MeetingTabs`, `MeetingDetail`, `MeetingRoom`, `UploadTranscriptModal` (keep `meetingDate`, drop only the ledger wording), `PrepPage` (drop `LedgerPrepRow` and the ledger state), `ProjectHeader`, `OverviewTab`, `ProjectSettingsTab`, `ProjectAssistant`, `AssistantTab`, and the project tabs (no `promises` tab and no `?tab=promises` link). Remove the landing copy in `LandingHero` and `TabbedShowcase` that sells these features, keeping the layout intact.
3. **Proof Chain.** In `proof-chain.ts`, delete `keptForItem`, `keptForTask`, `loadSuggested`, `outcomesForItems`, `saidForItem`, `taskStepForItem`, and every `ledger_items` or `ledger_links` read. `outcomeForTask` builds Said following the spec's Value sourcing table: task quote fields, else the earliest merged `action_items` quote, else `typed`. Keep viewer redaction as it is. Remove `kept` from the `Outcome` type. Update `OutcomeCard`, `TaskDrawer`, `src/app/api/tasks/[id]/route.ts`, and their tests to show three steps.
4. **Routes and client modules.** Delete:
   - `src/app/api/ledger/**`
   - `src/app/api/minutes/**`
   - `src/app/api/projects/[id]/ledger/`
   - `src/lib/ledger-client.ts`, `ledger-match-client.ts`, `live-ledger-*.ts`, and `minutes-*.ts`
   - `proof-types.ts`, but only if nothing still uses it
   - the Tasdeeq emails in `src/lib/email.ts`: the review open email, `sendMinutesSealedEmail`, `sendTasdeeqEmail`, and the verify URL helper

   Delete all their tests.
5. **Pipeline.** In `meeting-pipeline.ts`:
   - Drop the minutes lock checks, `buildMinutesDraft`, `cutMinutes`, the `minutes_draft` write, `writeLedgerItems`, the ledger match step, and `maybeRunLedgerMatch`.
   - Cut the AI schema down: keep `minutes.keyPoints` and `minutes.decisions` (or flatten them to top level `keyPoints` and `decisions`, whichever touches less code). Remove `ledgerItems`, line attribution, and dissent suggestions.
   - Keep writing `meeting_insights.key_points` and `decisions` exactly as today.

   Outside the pipeline:
   - Remove the `maybeRunLedgerMatch` import and its `after(...)` call from `src/app/api/ai/embed/route.ts`.
   - Remove `"ledger"` from `src/lib/pipeline-steps.ts` and its test.
   - Delete `src/agent/ledger.ts`, `ledger-match.ts`, `minutes.ts`, and `minutes-seed.ts`, plus `src/lib/ledger-eval-metrics.ts` and their tests.
   - Delete `scripts/ledger-eval.ts`, `scripts/ledger-demo/`, and `scripts/tasdeeq-seed.ts`.
   - Remove the `eval:ledger` script from package.json.
   - Reword the comment in `src/lib/meeting-date.ts`.
6. **Guards.** Remove the minutes review and sealed 409s from:
   - `/api/ai/process`
   - `/api/transcript/upload`
   - `/api/transcript/download`
   - `POST /api/meetings/[id]/project` (including the `minutes_review` error mapping)
   - `DELETE /api/meetings/[id]`
   - `DELETE /api/projects/[id]`

   Update the matching tests so they assert the plain success path.
7. **Shared readers.**
   - **Prep:** `/api/prep` returns `{ suggestions }`. Remove `PrepLedgerItem` and the `match_ledger_prep_items` call, and update `PrepPage.test.tsx`.
   - **Search and assistant:** remove the ledger context from `project-assistant.ts` and the decision search from `projects/search`.
   - **Project counts:** remove `decisionCount` from `project-cards.ts`, `/api/projects/[id]`, and their types.
   - **Activity:** remove the `ledger.*` kinds, the `ledger_item` subject, and the category from `project-activity.ts`, `activity-text.ts`, `ActivityTab`, and the activity route.
   - **Notifications:** remove the `kept_suggestion` builder from `notification-events.ts` and its entry from `notifications.ts`.
   - **Types and selects:** clean `meeting-list.ts`, `meeting-types.ts`, `task-types.ts`, `project-select.ts`, `project-client.ts`, and `src/agent/types.ts`.
   - **Tests:** clean the helpers `project-route-matrix.ts` and `supabase-queue-mock.ts`, plus `meetings/route.test.ts`, `projects/projects.test.ts`, `tasks/tasks.test.ts`, and `notification-events.test.ts`.
8. **SQL that is safe now.** Edit `schema.sql` and apply a migration named `0006_unlink_ledger_minutes` through the Supabase MCP `apply_migration`. It contains these `create or replace` statements:
   - `move_meeting_to_project`, without the `minutes_reviews` check
   - `apply_merge_completion`, without either `perform add_code_ledger_links`
   - `apply_merge_revert`, without the `ledger_links` delete, the update loop, or `ledger_recompute_item_status`
   - the `project_activity` view, without the `'ll:'` branch

   Names, arguments, return strings, grants, and `security_invoker` all stay the same. Nothing is dropped yet.
9. **Package and checks.** Remove the `pdf-parse` devDependency (`npm uninstall pdf-parse`). Keep `pdf-lib`. Then:
   - `grep -rniE "ledger|minutes_|minutesLock|tasdeeq|liveLedger|proof-types|kept_suggestion|decisionCount" src scripts` should return nothing except intentional leftovers. List any leftovers in the report with a reason, for example `meeting_insights.decisions`.
   - `npx tsc --noEmit`, `npm run lint` (no new warnings), `npx vitest run`, and `npm run build`.
   - Run `npx prettier --write` only on files this change edited or created. Never run `eslint --fix`.

Then stop and ask before you commit and push to main. Never stage `neurameet-source.zip` or `reports/tasdeeq-seed-*.json`.

## Phase 2: drop (only after the phase 1 deploy is Ready and the smoke test passes)

10. Apply the migration `0006_drop_ledger_minutes` on Supabase, after asking first, because it cannot be undone. It must not use CASCADE. In order:
    1. Delete `notifications` rows where `kind = 'kept_suggestion'`, then recreate the `notifications.kind` check constraint without that value.
    2. Remove the old step key from the pipeline JSON: `update transcripts set pipeline = pipeline #- '{steps,ledger}' where pipeline->'steps' ? 'ledger';`. Steps live in `transcripts.pipeline`, not in a table.
    3. Drop the trigger `trg_ledger_links_after_delete`, then these functions: `ledger_links_after_delete`, `add_code_ledger_links`, `ledger_recompute_item_status`, `match_ledger_candidates` (every overload), `match_ledger_prep_items`, and every minutes or live ledger function.
    4. Drop the tables, children first: `minutes_dissent_suggestions`, `minutes_attestations`, `minutes_speaker_claims`, `minutes_attesters`, `minutes_lines`, `minutes_seals`, `minutes_reviews`, `ledger_agreement_votes`, `ledger_agreements`, `ledger_live_marks`, `ledger_links`, `ledger_items`.
    5. `alter table meeting_insights drop column minutes_draft`.

    If a drop fails because something depends on the table, stop, report the object, and fix it. Do not add CASCADE. After that, edit `schema.sql` so it no longer creates or alters any dropped object, then run `get_advisors` (security) to confirm nothing new shows up.

## Phase 3: docs

11. Docs:
    - Set specs 0001, 0002, and 0003 to `**Status**: Removed by [0006](../0006-remove-ledger-and-minutes/index.md)`. Spec 0004 gets a one line note that its Kept step and Decisions tab were removed by 0006.
    - Set spec 0006 to Accepted once both phases are live.
    - Mark the scope rows as removed in `docs/scope/scope.md`.
    - Update `context/architecture.md` (tables and routes), `ui-registry.md`, `progress-tracker.md`, `project-overview.md`, and `build-plan.md`.
    - AGENTS.md: remove the three Signature Feature sections, their API contract lines, the extended lines that only mention ledger or minutes, and `MINUTES_SIGNING_PRIVATE_KEY` from Security. Reword the Phase W "stay" decision and the Proof Chain sentence so the chain ends at the merged PR. Do this the way `/sync` would, keeping every other line unchanged.

## Test steps to share at the end

1. Upload a transcript to a personal meeting. Summary, key points, action items, category, and AI Chat all work, and there is no Ledger or Minutes tab.
2. Upload a transcript to a project meeting. Proposals appear. Confirm one to make a task, and the Outcome card shows Said (with the quote), Task, and Shipped.
3. Merge a PR that closes the task. The task completes. Revert it and the task reopens.
4. Move a personal meeting into a project, delete a meeting, and delete a project. All three succeed.
5. Open Prep, the Ctrl K palette, the project assistant, Activity, and notifications. None of them error or mention promises.
6. Join a call. There is no Live Ledger panel, and the call controls work as before.
7. `/api/ledger` and `/api/minutes` return 404.
