# 0004. Conversations to Code: rationale

Decision record for [index.md](index.md). The build spec is in `index.md` and its children; this file explains why.

## Context

NeuraMeet already turns a meeting into a summary, action items, follow ups, and a Promise Ledger with quote proof (0001), takes the ledger into the live call (0002), and lets attendees verify sealed minutes (0003). All of it is personal: one owner per meeting, checked by hand in each route with `meetings.user_id`.

The PDF `NeuraMeet UI Overview` and `reports/Conversations to code workspace.md` propose a project workspace: a team, roles, a task board, and GitHub, so a promise spoken in a meeting can be followed to the code that kept it. The report found that tools like Huly, Linear, and Jira with Loom or Rovo already ship each screen on its own; what none of the products reviewed ship is the chain from a code verified quote to a merged PR to a confirmed kept promise. That chain (the Proof Chain) is the reason for this phase.

Locked before this spec: projects and roles in our own Supabase tables (not Clerk Organizations), the Stitch tokens stay, live captions are out of the core, and the ledger, Live Ledger, and Tasdeeq stay. Every tool must be free with no card on file.

## Options considered

### Option A: Clerk Organizations for projects and roles

Use Clerk's organization, membership, and invitation features.

- Pro: invitations, membership UI, and role claims in the session come ready made.
- Con: custom roles and permissions beyond the basic ones sit on paid plans, and the role would live outside the database that every query filters on, so each route would join two sources of truth. It was ruled out by the locked decision on 2026-11-02.

### Option B: own Supabase tables, one shared role check, review gate, GitHub App (chosen)

Projects, members, invitations, and tasks in Supabase; `requireProjectRole` and `requireMeetingAccess` on every route; AI proposals reviewed by a person before they become tasks; a GitHub App with webhooks completing tasks on a qualifying merge and suggesting (not confirming) the kept promise.

- Pro: one source of truth, enforced on the server, free; the role check replaces about 30 copied owner checks; the Proof Chain lives in tables we already have (`action_items`, `ledger_items`, `ledger_links`).
- Con: we build invitations, the board, and webhook handling ourselves, which is the largest phase so far, and W1 touches almost every API route.

### Option C: AI creates tasks directly, no review gate

Keep today's flow (action items become follow ups automatically) and just add a project and a board.

- Pro: least work; no proposals screen.
- Con: a wrong quote, a wrong assignee, or a duplicate goes straight onto a shared board where the whole team sees it, and the Proof Chain would start from text nobody checked. That breaks the one claim this phase exists to make.

### Option D: GitHub Issues or Actions instead of a GitHub App

Mirror tasks as GitHub Issues, or have a GitHub Action call NeuraMeet on merge.

- Pro: Issues give a familiar UI; an Action needs no App registration.
- Con: Issues need write access to every repo and split the task's truth between two systems; an Action must be added to each repo by hand and its secret copied into each one. An App gives read only, per repo access with one webhook secret and short lived tokens.

## Rationale

Option B wins because it is the only one that keeps a single source of truth for access (basis: AGENTS.md locked decisions, 2026-11-02) and keeps the Proof Chain honest from end to end.

- **One server side role check.** Access is decided by `project_members` on every request, with no cache, so a removed member is out on the next request (basis: least privilege; invariant 3).
- **404 for non members.** Hiding which projects exist costs nothing and removes a probing signal (basis: OWASP guidance on access control error handling).
- **Review gate.** The quote is located by code with the existing `findQuoteLines` and counts only on exactly one match, the assignee is suggested only on the own track rule, and duplicates are checked with the existing pgvector setup. A person confirms. This is the same pattern the Promise Ledger uses for links (basis: spec 0001).
- **Merge completes the task, the promise waits for a person.** Merged code is strong evidence the task is done, but not always that the promise was kept as spoken, so the ledger gets a suggestion that the Owner or Admin confirms (basis: user decision in the W0 interview; spec 0001 link review).
- **Webhook safety.** HMAC SHA-256 over the raw body with a constant time compare, dedupe on the delivery id, work after the 202, and completion under a row lock so out of order or parallel deliveries agree (basis: GitHub webhook validation guidance; idempotency key practice).
- **One install callback.** With user authorization on, GitHub skips the Setup URL, so one callback proves the installation with the user's own token and a signed `state`; no GitHub account table is kept (basis: GitHub App installation flow; cross check finding).
- **Reprocess locked after review.** Once a person reviewed a proposal, rerunning the AI would break the quote to task to promise chain, so it is refused (basis: cross check finding).
- **Hashed single use invite tokens.** Only the SHA-256 of a 32 byte random token is stored, so a database leak does not leak working invites (basis: the same practice used for password reset tokens).
- **Assistant safety.** Project filter inside SQL, retrieved text wrapped as data, citations built in code, no write tools (basis: OWASP LLM01 prompt injection).
- **Zero cost.** GitHub App and webhooks, Vercel Hobby with one daily cron, Supabase, Gemini and Groq, Stream, Clerk free, and Resend free with no card (basis: AGENTS.md zero cost rule and the A2 precedent).

## References

### Project sources

- `AGENTS.md`: Phase W scope, locked decisions, zero cost rule, API contracts list.
- `docs/specs/0001-promise-ledger/index.md`: ledger items, links, and the review flow this phase extends.
- `docs/specs/0002-live-ledger/index.md`: live marks and the owner rules that move onto the shared role check.
- `docs/specs/0003-tasdeeq-verified-minutes/index.md`: minutes review rules that block a meeting move.
- `reports/Conversations to code workspace.md`: the competitor review, the narrow claim wording, and the verified source links for every product and practice named here.
- `research_notes/Conversations to code workspace/`: the raw research behind the report.
- `supabase/schema.sql`: the current tables the W blocks extend.

### Practices

- Webhook signature validation with HMAC SHA-256 over the raw body and a constant time compare.
- Idempotency keys for at most once processing of delivered events.
- OWASP LLM01, prompt injection: treat retrieved content as data, restrict tools, validate output.
- Least privilege and deny by default access control.
- Hashed, single use, expiring tokens for invitations.
