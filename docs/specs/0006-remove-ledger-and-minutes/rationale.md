# 0006. Rationale

## Context

Three signature features (Promise Ledger 0001, Live Ledger 0002, Tasdeeq 0003) were built before Phase W. Phase W later took the Promise Ledger tables as part of its Proof Chain. The Decisions and Promises tab, the Kept step on the task Outcome card, the "merge may keep a promise" notification, project decision counts, and the GitHub merge function (`add_code_ledger_links`) all read or write `ledger_items` and `ledger_links`.

You want all three features gone without breaking anything else. The risk sits in the shared touch points: the meeting pipeline writes minutes and ledger items in the same AI call that produces the summary; five routes block on a minutes review or seal; and the GitHub completion SQL function calls a ledger function. If a table is dropped before every reader is gone, live paths break at runtime, and the type checker cannot catch that.

## Options considered

### Option 1: Full removal, slim Proof Chain, code first then drop (chosen)
Remove everything. The Outcome card keeps Said, Task, and Shipped, with Said read from the task and action item quote fields that already exist. The drop happens after the deploy.
**Pros**: No dead schema, a clean product, the conversation to code chain still works, and phase 1 can be rolled back.
**Cons**: You lose the Kept step, and the data loss is permanent.

### Option 2: Remove the Outcome card too
**Pros**: Less code to rewrite.
**Cons**: It throws away a working Phase W surface (quote to task to PR) that does not need the ledger.

### Option 3: Keep the ledger tables for Phase W only
**Pros**: Keeps the Decisions tab and Kept step.
**Cons**: It is a half removal. The extraction, matching, and review machinery would have to stay, so most of the complexity remains.

## Rationale

The Proof Chain's value is the evidence that links a spoken quote to a merged PR. The quote already lives on `action_items` and `tasks` (W4), so the Promise Ledger is only needed for the final Kept judgment. Cutting that one step keeps most of Phase W at a fraction of the code.

Code first, then drop, follows the safe sequence for production database changes: stop reading, deploy, then remove the schema. Rewriting the two merge functions before the drop keeps the GitHub flow working at every point in between.

## Inventory (evidence)

These are the files that are touched or deleted, from a code scan on 2026-11-21:
- Only used by these features: `src/agent/{ledger,ledger-match,minutes,minutes-seed}.ts`; `src/lib/{ledger-client,ledger-match-client,ledger-eval-metrics,live-ledger-*,minutes-*,proof-types}.ts`; `src/hooks/useLiveLedger.ts`; `src/components/live-ledger/*`; `src/components/meeting-intelligence/{LedgerTab,MinutesTab,MinutesReview}.tsx`; `src/components/projects/DecisionsTab.tsx`; `src/app/api/ledger/**`; `src/app/api/minutes/**`; `src/app/api/projects/[id]/ledger/`; `src/app/minutes/verify/[sealId]/`; `scripts/{ledger-eval,tasdeeq-seed}.ts`.
- Shared files to edit: `meeting-pipeline.ts`, `proposals.ts`, `agent/types.ts`, `pipeline-steps.ts`, `proof-chain.ts`, `project-cards.ts`, `project-activity.ts`, `activity-text.ts`, `notification-events.ts`, `project-assistant.ts`, `project-select.ts`, `project-client.ts`, `meeting-list.ts`, `meeting-types.ts`, `task-types.ts`; the routes `ai/process`, `prep`, `transcript/{upload,download,status}`, `meetings/[id]`, `meetings/[id]/project`, `projects/[id]`, `projects/[id]/activity`, `projects/search`, `tasks/[id]`; and the components `MeetingTabs`, `MeetingDetail`, `MeetingRoom`, `GuestStreamClientProvider`, `UploadTranscriptModal`, `PrepPage`, `OutcomeCard`, `TaskDrawer`, `ActivityTab`, `ProjectHeader`, `OverviewTab`, `ProjectSettingsTab`, `ProjectAssistant`, `AssistantTab`, `LandingHero`, `TabbedShowcase`.
- SQL: `supabase/schema.sql`, the ledger section (around line 352), the live ledger section (around 537), the minutes section (around 590), the project scope rewrite of `match_ledger_candidates` (around 778), and the W5 code link and merge functions (around 1457 to 1590).
- Packages: `pdf-parse` (dev, minutes test only) is removed. `pdf-lib` is kept for the attendance report.
