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

## W3 call gate

Added 2026-11-03, when W3 settled the two Stream checks the umbrella left owed. Verified against the `stream-react` skill (`references/VIDEO.md`: capabilities are grants per role per call type, checked by Stream on the server, so hiding a button is not a gate) and the installed `@stream-io/node-sdk` 0.7.3 types (`createCallType`, `getCallType`, `updateCallMembers`, `kickUser`, `blockUser`).

- **Option 1, members only `project` call type (chosen).** A copy of `default` with `join-call` removed from `user` and `guest`. Only people our server adds as call members can join: members after a fresh consent tick, guests when admitted. Offboarding removes them from open project calls. Strongest guarantee; costs a call type value passed through about fifteen files and a one time setup script. Moved meetings keep `default` (Stream cannot change a call's type).
- **Option 2, keep `default` and block on removal (runner up, and the fallback if Stream refuses the call type).** Consent enforced only in our screen and `/members`; a token holder can still join through the API. Removal calls `blockUser` on the project's open calls. Far fewer changes, weaker guarantee.
- **Option 3, keep `default` and document only.** The first version of this spec. No Stream changes, both gaps stay open.

Option 1 won because the consent notice is the one thing in W3 that protects other people's personal data, and Stream enforcing it is the only version that is true when someone bypasses our UI.

## W5 GitHub

Added 2026-11-05, when `/architect` compared the W5 spec with the W4 code and GitHub's App documentation. W0's choices stay: a GitHub App with no Octokit, one repo to one project, a qualifying merge completes the task, the promise only gets a suggestion. The comparison found gaps in how those rules behave when events repeat, arrive out of order, or are undone, and these choices close them.

- **Proving an installation: a claims table (chosen).** With "Request user authorization during installation" on, GitHub skips the Setup URL (basis: GitHub App installation flow and Setup URL docs). The callback checks the installation id against the user's own installations with their token, then discards the token. `installed_by` alone locked out a second Owner on the same installation, so `github_installation_claims` records each person who proved access, and an `authorizeUrl` button lets them prove an existing one. Runner up: store a GitHub account mapping. W0 ruled that out, and a claim stores no GitHub identity.
- **Status moves: SQL functions (chosen).** `update_task` needs an actor and `ifVersion`, and a webhook has neither (basis: W4 `update_task`). `apply_github_move` and `apply_merge_revert` lock the row and bump `version`, so an open board gets the normal 409. Runner up: relax `update_task` to accept a system caller, which weakens the rule every person's move relies on.
- **Reopen and revert: read the event history (chosen).** A merge older than the latest reopen is spent, so a person's reopen sticks and a redelivered event cannot complete the task again. A revert reopens only when that link is the merge that completed the task. Runner up: a `completion_locked` flag, which is one more piece of state that can drift from the events.
- **Blocking links: only live repos and non forks (chosen).** A link in an unlinked repo or under a removed installation can never change, so it would block completion forever. Anyone can open a fork PR naming a key, so a fork PR moves nothing and blocks nothing, and completes only after a maintainer merges it. Runner up: ignore forks entirely, which would miss real contributions.
- **Sync: read recent PRs too (chosen).** Refreshing only known links misses a PR opened while webhooks were down, so Sync also reads the 30 most recent PRs per repo, capped at 100 reads and 45 seconds, and reports `partial` when cut short (basis: GitHub List pull requests docs). Runner up: page through every PR, which risks the Vercel time limit.
- **One App per environment (chosen).** An App has one webhook URL, so development and production each get their own (basis: GitHub callback URL and webhook docs). Runner up: repoint one App at each deploy, which breaks whichever side is not pointed at.
- **Task drawer and Ledger display inside W5 (chosen).** The first code link has no `meeting` or `line_number`, and the current Ledger tab assumes both. Merged PRs also need somewhere to appear. Shipping both here keeps W5 testable by hand. Runner up: wait for W6, which would leave broken rows on the Ledger tab in between.

The cost is more SQL and a second App at Deploy. In exchange every event, redelivery, and Sync runs through one rule path, and each change happens under a row lock.

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
