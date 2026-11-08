# W9. Security suite and the bilingual end to end run

Child of [0004. Conversations to Code](index.md). Uses every earlier slice; adds no tables and no routes.

## Summary

Before the phase counts as done, you prove three things. Every project route refuses the wrong people, checked by tests generated from one table, not written by hand. The two public doors (the webhook and the invite page) hold up against the usual attacks. And the whole chain works on a real meeting in English and Urdu: from a spoken promise to a confirmed kept promise backed by merged code.

## Requirements

- **AC-80**: One test file builds a matrix from a single table of `{ route, method, need }` covering every project and project meeting route; for each it asserts non member 404, Viewer 403 where the need is content or manage, Developer 403 where it is manage or owner, and removed member 404. For every GET, a Viewer response is checked to contain no `quote`, `quote_line`, `pr_url`, `pr_title`, or `repo_full_name` key at any depth. Adding a route without a row fails a check that lists every `route.ts` under `src/app/api/projects`, `src/app/api/tasks`, and `src/app/api/proposals`.
- **AC-81**: Webhook attack tests: wrong signature, missing signature, signature over a different body, replayed delivery id, unlinked repo, suspended installation, a key with another project's prefix, and a `Content-Length` over 1 MB (413) all leave the database unchanged; a forged install `state` on `/api/github/callback` is turned away with a redirect to `/projects?github=expired` (the callback is a browser redirect flow, AC-43a) and exchanges and stores nothing.
- **AC-82**: Invite attack tests: guessed token (410), reused email invite (410), wrong email (403), link invite for Admin (422), 11 failures in 10 minutes (429), a removed member reusing an old used email invite (410), and a removed member on a valid link invite (pending request, not a rejoin).
- **AC-83**: The bilingual run on a deployed preview: a project with Owner, Admin, Developer, and Viewer, where at least one member joins through a link invite and approval; a real meeting with English and Urdu speech generated through Phase F; a proposal with a verified quote and an own track assignee; confirm into `NM-1`; a PR with "Closes NM-1" merged into the default branch; the task completes; the Owner confirms the kept suggestion; the Outcome card shows all four steps; the Viewer sees the chain redacted. Each step's result is written into `docs/specs/0004-conversations-to-code/verify.md` with the date.
- **AC-84**: Prompt injection tests on the project assistant and on `/api/ai/process`: transcript lines asking to ignore instructions, to reveal other projects, or to create tasks do not change the output beyond normal extraction, do not add citations outside the source list, and do not create a confirmed task.

## Design

### Matrix source

`src/test/project-route-matrix.ts` exports the table; each W slice adds its rows when it adds a route, so W9 only adds the completeness check and the remove member cases. The fixture creates four users per role plus a removed member and an outsider, with mocked Clerk `auth()`.

### Bilingual run checklist

Written into `verify.md` as a table: step, expected, actual, pass or fail, and a screenshot path under `docs/specs/0004-conversations-to-code/verify/` when useful. Any fail opens a fix before the phase closes; the run is repeated from the failed step.

### Critical test scenarios

The requirements above are the scenarios. Run order: `npx vitest run`, then typecheck, lint, build, then the manual bilingual run (AC-83).

## Build plan

1. Completeness check over the matrix and the removed member cases, satisfies **AC-80**.
2. Webhook and invite attack tests, satisfies **AC-81**, **AC-82**.
3. Injection tests for the assistant and processing, satisfies **AC-84**.
4. Run `/audit` on the phase, fix findings, then the bilingual run recorded in `verify.md`, satisfies **AC-83**.

## Rationale (short)

A table driven matrix grows with the routes, so a forgotten check fails a test instead of shipping. The two public entry points get attack tests because they are the only routes that run without a project role. The end to end run on real bilingual speech is the only proof that the claim in the product story is true.
