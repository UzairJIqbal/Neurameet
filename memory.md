# Memory — Phase W, Step W2 invitations (done, on main)

Last updated: 2026-11-03

## What was built

- W2 built from `prompts/step-W2-invitations.md` (approved). Commit `05fca83`, pushed straight to `main`. Working tree clean.
  - SQL `supabase/schema.sql` (W2 block): tables `project_invitations`, `project_join_requests`; 4 indexes; rpc `upsert_project_member`, `create_project_invitation`, `accept_email_invitation`, `request_project_join`, `revoke_project_invitation`, `decide_join_request`.
  - Server lib `src/lib/invitations.ts` (token hashing, expiry, email binding, rate limit, email budget, Clerk caller profile).
  - Routes: `src/app/api/projects/[id]/invitations/` (POST, GET, `[invitationId]` DELETE), `src/app/api/invitations/preview` (GET), `src/app/api/invitations/accept` (POST), `src/app/api/projects/[id]/join-requests/` (GET, `[requestId]` POST).
  - Email: `sendProjectInviteEmail` + `workspaceEmailConfigured` in `src/lib/email.ts`, gated on `RESEND_WORKSPACE_FROM`.
  - UI: `src/components/projects/InviteDialog.tsx`, `InvitesPanel.tsx` (inside MembersTab, Owner/Admin only), `InviteView.tsx`, page `src/app/(root)/(home)/invite/[token]/page.tsx`.
  - `/invite(.*)` added to `isProtectedRoute` in `src/middleware.ts`; `headers()` in `next.config.ts` sets `Referrer-Policy: no-referrer` on `/invite/:path*`.
  - Client functions in `src/lib/project-client.ts`; types and `inviteRoleOptions` / `canManageInvites` in `project-types.ts`.
  - Tests: `src/lib/invitations.test.ts`, `src/app/api/invitations/invitations.test.ts`, `src/components/projects/invites-ui.test.tsx`.
- AGENTS.md API Contracts gained `GET /api/invitations/preview` (returns projectId only when already a member).
- Docs updated: progress-tracker (W2 DONE), build-plan (W2 ✅), scope (W2 ticked), ui-registry (Invitations section).

## Decisions made

- W2 SQL functions are invoker (like W1), not security definer; execute granted to service_role only.
- A pending join request short circuits only for link invites.
- Default invite role in the dialog is Developer; Admin only for the Owner on email invites; links never grant Admin.
- Audit names for joining: `member.joined` / `member.restored`. Email budget counts `invite.emailed` audit rows (60 a day) until W8 adds notifications.

## Problems solved

- `src/middleware.ts` uses CRLF line endings; python rewrites convert them. Restore CRLF after editing or the diff balloons.
- eslint on bracket paths: run with `-f json` and filter; prettier `--write` fixes the formatting errors.
- No `timeout` command on this Mac.
- Smoke testing SQL live: use a `do $$ ... raise exception 'SMOKE_OK' $$` block so everything rolls back (insert a temp project inside it; there are no projects live yet).

## Current state

- W2 SQL applied live to `lsjiwxohfpzdvenbxpeu` as migration `w2_invitations` and verified (RLS on, anon cannot read tables or run functions, rollback smoke test of every function passed, no data left).
- Tests 839/839, tsc clean, lint clean on changed files, `npm run build` passes.
- Not yet done: the two account manual test of W2 (steps at the end of `prompts/step-W2-invitations.md`). Without `RESEND_WORKSPACE_FROM`, every email invite shows "Email not sent, copy the link" (expected).
- Carried gaps: Viewer sees an empty action item list until W4; guests on project calls until W3; freezeAttesters, seal `owner_id`, live events still use the creator id.
- LL5 and Tasdeeq live runs still owed (W-pre).

## Next session starts with

1. Ask whether the W2 two account manual test passed; fix anything found.
2. Step W3, project meetings + consent notice: write `prompts/step-W3-...md` from `docs/specs/0004-conversations-to-code/` (W3 child spec), get approval, build.

## Open questions

- by-call DELETE Owner only on project meetings was confirmed by the user; the by-call GET returning `{ meetingId }` was not explicitly confirmed.
- When to do the LL5 and Tasdeeq live runs.
- Rules that hold: work on `main` and push there, no branches or PRs; ask before commit/push; SQL to live Supabase only with explicit OK; never read or touch `.env` files; plain words, no dashes; end reports with a 2 line summary.
