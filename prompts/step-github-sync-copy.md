# GitHub Sync: say clearly that commits alone do not sync

## Why
Testers push commits straight to a branch, click Sync now, and see "Read 0 PRs". Sync reads pull requests only (`recentPulls` in `src/lib/github.ts`); raw commit ingestion is Cut in Phase W (AGENTS.md). Behavior stays; the copy is misleading by omission. Decision locked 2026-11-09: option A.

## Scope (copy only, no logic, no routes, no API contract change)
1. `src/components/projects/GitHubPanel.tsx` `NO_PULLS` (line ~186): "No pull requests are linked yet. Pushing commits alone does not sync. Open a pull request that names a task key to link it."
2. `src/components/projects/GitHubTab.tsx` (~line 220) "Connect GitHub" blurb: add one sentence "Commits pushed without a pull request are not tracked."
3. Update any assertion in `GitHubPanel.test.tsx` that matches the old string.

## Out of scope
Commit ingestion, `push` webhook, completion rules.

## Checks
`npx tsc --noEmit`, lint, `npx vitest run`, build. Update `progress-tracker.md` (and `ui-registry.md` if the copy is recorded there).

## Manual test
Open a project GitHub tab with no linked PRs: new copy shows. Open a PR titled `KEY-1 ...`, Sync now: Read 1, Linked 1.
