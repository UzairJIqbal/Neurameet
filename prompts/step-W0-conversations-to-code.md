# Step W-pre plus W0: close in flight work, then architect the Project Workspace (Conversations to Code)

Source: the PDF `NeuraMeet UI Overview` (21 screens) and the research report `reports/Conversations to code workspace.md` (notes in `research_notes/Conversations to code workspace/`). Scope rows #20 to #27, tier GA. Decisions already locked on 2026-11-02 (do not reopen): projects and roles live in our own Supabase tables, not Clerk Organizations; the locked Stitch tokens stay and the PDF sets layout only; live captions are out of the core; Promise Ledger, Live Ledger, and Tasdeeq all stay.

This step writes **no product code**. It closes the open work, then produces the spec that every W1 to W9 prompt will be written from.

## Part A: W-pre (close in flight work)

1. Show `git status` and `git diff --stat`. The Live Ledger and Tasdeeq files are untracked and 33 tracked files have uncommitted edits.
2. Run `npx tsc --noEmit`, `npx vitest run`, `npm run build`, and report the results exactly.
3. If all three are green, propose two branches and commits (Live Ledger on `feat/live-ledger`, Tasdeeq on `feat/tasdeeq`, with the shared edits placed where they belong) and **ask before committing or pushing**. Exclude the helper scripts marked "do not commit" in the tracker.
4. You run LL5 (signed in user + guest) and the Tasdeeq three person live run yourself; I record the results in the tracker and tick scope #18 LL5. If you want to skip the live runs for now, say so and I mark them owed, not done.

## Part B: W0 (`/architect conversations to code`)

Run `/architect conversations to code` and write `docs/specs/0004-conversations-to-code/index.md` plus `rationale.md`. Inputs: the report, the four research notes, `context/architecture.md` (Project Workspace draft), the PDF. Before deciding anything Stream related, load the `stream-react` skill; before `after()` or route handlers, read `node_modules/next/dist/docs/`.

The spec must decide, with acceptance criteria for each:

1. **Role matrix:** what Owner, Admin, Developer, and Viewer can see and do on every project tab, including who confirms AI proposals, who reviews ledger links, who connects GitHub, and whether Viewers see transcripts and recordings.
2. **Data model:** final SQL for `projects`, `project_members`, `project_invitations`, `tasks` (key counter per project), `task_events`, `meeting_participants`, `github_installations`, `github_repos`, `github_deliveries`, `task_links`, `notifications`, `audit_log`; `meetings.project_id` (nullable) and `action_items.review_state`; how `follow_ups` migrate; how `ledger_items` gain code evidence. RLS on, service role only, as today.
3. **Authorization:** the shared `requireProjectRole` helper and the list of the ~29 routes that move from `meetings.user_id` checks, with a non member test for each.
4. **Invitations:** token format (256 bit, stored hashed), expiry, single use, email binding, owner approval default, Resend sending domain or copy link only.
5. **Review gate:** proposal shape (quote, speaker, timestamp, suggested assignee rule from own audio track or Tasdeeq claim), duplicate check threshold, what happens to the current auto created follow ups.
6. **GitHub:** GitHub App permissions and events; install flow; webhook verification and dedupe; the completion rule set (closing reference, `merged == true`, default branch, all linked PRs done; draft, closed unmerged, revert); whether a merge completes directly or as "done pending owner confirm"; one repo per project or shared; member mapping by numeric GitHub id; Sync reconcile.
7. **Project assistant:** the project scoped RPC, sources, citation building in code, untrusted data wrapping, "not found" fallback, and how `/api/ai/chat` and `/api/search` take `projectId`.
8. **Offboarding and retention:** what a removed member keeps and loses, recording retention period, consent notice text.
9. **Notifications:** events that notify, the one daily digest via the Vercel Hobby cron.
10. **Free tier budget:** extra Gemini and Groq calls per meeting and per webhook, Supabase size growth, Resend daily cap.
11. **API contracts and secrets:** every new route as one line for the AGENTS.md API Contracts list, and new secrets (GitHub App private key, webhook secret, app id) for the Security never expose list. Add both to AGENTS.md as part of this step.
12. **Build plan:** split W1 to W9 into slices with acceptance criteria ids, so each later prompt maps to one slice.

Then update `docs/scope/scope.md` (tick the W0 Design it box and link the spec), `context/build-plan.md`, and `context/progress-tracker.md`.

## Out of scope for this step

Any change in `src/` or `supabase/schema.sql`, any new dependency, any token change, any live captions work.

## Checks

Part A: tsc, vitest, build results shown verbatim. Part B: spec has every section above, every new route is in AGENTS.md, and no tool outside the zero cost list is named.
