# Step W2: Invitations, invite preview, and join requests

Spec: `docs/specs/0004-conversations-to-code/0004-invitations.md` (child of the umbrella `index.md`, Status In Progress, tier GA), updated and accepted at `/architect` on 2026-11-03. This prompt covers the whole W2 Build plan (items 1 to 5) and satisfies AC-13 to AC-22c, including AC-13a, AC-16a, AC-21a, AC-22a, AC-22b. The spec is the contract: where this prompt is shorter, the spec wins.

Rules in force: Next.js 15 App Router, strict TypeScript, no `any`, plain JSON errors, every UI load uses `useLoadingTimeout` plus `LoadError`, tokens only (no hex, no raw color classes) in app UI, react-hot-toast only, zod for input validation. No new dependency, no new provider. One new optional env var: `RESEND_WORKSPACE_FROM`. Work on `main`, no branch, no PR. Ask before commit and push.

## 0. Before code

- AGENTS.md API Contracts: add one line under the invitation routes, exactly:
  `GET  /api/invitations/preview      → signed in: ?token=, project name, role, kind, status for the invite page; consumes nothing`
  Nothing else in AGENTS.md changes. (`RESEND_WORKSPACE_FROM` is a sender address, not a secret, so the Security list stays as is.)
- Mark Step W2 in `context/build-plan.md` as in progress.

## 1. Schema (`supabase/schema.sql`), Build plan item 1

Append a `-- ===== W2. Invitations =====` section with exactly the umbrella's W2 SQL block (tables `project_invitations` with `check (email = lower(email))`, `project_join_requests`, indexes `project_join_requests_one_pending`, `project_invitations_one_live_email`, `project_join_requests_invitation`) plus `audit_log_actor_action` on `audit_log (actor_id, action, created_at desc)`. RLS on both tables, no policies, `grant all ... to service_role`, same style as W1.

Four rpc functions, each `security definer`, `set search_path = public`, execute revoked from `public, anon, authenticated` and granted to `service_role` only (same as W1):

| Function | What it does atomically |
|---|---|
| `create_project_invitation(p_project, p_kind, p_email, p_role, p_token_hash, p_created_by, p_expires_at, p_max_active)` | `pg_advisory_xact_lock(hashtext('invite:' \|\| p_project::text))`; for email kind, revoke any live invite for that email in the project (AC-13a); count active invites (`revoked_at is null and used_at is null and expires_at > now()`), raise `cap_reached` when at `p_max_active` (AC-13); insert; write `audit_log` `invite.created` (detail: kind, role, invitation id; never the token or email); return the row |
| `accept_email_invitation(p_invitation, p_user)` | `update ... set used_at = now(), used_by = p_user where id = p_invitation and used_at is null and revoked_at is null and expires_at > now()`; if no row, raise `gone`; upsert `project_members` (role from the invite, `removed_at = null`, `removed_by = null`, `added_by` = invite `created_by`); write `member.added` or `member.restored` (AC-17, AC-20) |
| `revoke_project_invitation(p_invitation, p_project, p_actor)` | not in this project: raise `not_found`; already revoked: return ok (idempotent); set `revoked_at`; for link kind, deny every pending request from it (`decided_by = p_actor`); write `invite.revoked` and one `join_request.denied` per denied row (AC-21a) |
| `decide_join_request(p_request, p_project, p_actor, p_decision)` | lock the row; not pending: raise `already_decided` (409); approve upserts `project_members` (role from the request, `removed_at = null`, `added_by = p_actor`) and never touches an active member's role; write `join_request.approved` or `join_request.denied` (AC-21) |

Never write an email into `audit_log` detail (the umbrella allowlist already hides these rows from the Activity timeline).

I show you the SQL, apply it to the live NeuraMeet Supabase project (`lsjiwxohfpzdvenbxpeu`) only with your OK, then confirm the tables, indexes, functions, RLS, and that `anon` cannot run the functions.

## 2. `src/lib/invitations.ts` (server only), Build plan item 2

- Constants: `INVITE_TTL_DAYS = 7`, `MAX_ACTIVE_INVITES = 50`, `ACCEPT_FAIL_LIMIT = 10`, `ACCEPT_FAIL_WINDOW_MIN = 10`, and one `GONE_MESSAGE` used by every 410.
- `newInviteToken()`: `randomBytes(32).toString("base64url")` plus its `hashInviteToken()` (SHA-256 hex).
- `parseInviteEmail(value)`: zod email, trimmed, lowercased, at most 254 characters.
- `emailMatchesInvite(clerkUser, inviteEmail)`: compares the lowercased primary email. Verified always passes on match. Unverified passes only when `NODE_ENV` is exactly `development` or `test`, and logs a warning; missing or any other value is strict (AC-22b).
- `loadInviteByToken(supabase, token)`: hash, look up, and resolve state in the AC-19 order: unknown → `gone`; caller already an active member → `member`; caller has a pending request in this project → `pending`; revoked, used, or expired → `gone`; else `valid`.
- `recordAcceptFailure(supabase, userId, projectId | null)` and `isAcceptRateLimited(supabase, userId)`: write and count `invite.accept_failed` rows by `actor_id` in the last 10 minutes (AC-22). The count runs before any token work. A success does not reset it.
- `inviteLink(token)`: `${NEXT_PUBLIC_APP_URL}/invite/${token}`.
- Shared response types go in `src/lib/project-types.ts` (no `server-only`, the UI imports them): `InvitationSummary`, `CreateInvitationResponse`, `InvitePreview`, `AcceptInviteResponse`, `JoinRequestSummary`.
- Unit tests `src/lib/invitations.test.ts`: token shape and hash, email parsing (case, spaces, too long), `emailMatchesInvite` under `development`, `test`, `production`, and unset `NODE_ENV`, every branch of the lookup order, and the rate limit counter.

## 3. Routes, Build plan item 3

Every route uses Clerk `auth()`, never takes the caller id from the body, uses `requireProjectRole` and `accessErrorResponse` from W1, and never logs the raw token.

| Route | Rule |
|---|---|
| `POST /api/projects/[id]/invitations` | owner or admin. Body `{ kind, email?, role }`. Link kind with `admin` → 422. Admin asking for `admin` → 403. Email required for email kind, invalid → 422. Calls `create_project_invitation`; `cap_reached` → 422; `23505` → 409. Sends the email (section 4). Returns 201 `{ invitation: { id, kind, email, role, expiresAt }, link, emailSent }` (AC-13, AC-13a, AC-14, AC-22c) |
| `GET /api/projects/[id]/invitations` | owner or admin. Active invites only, `[{ id, kind, email, role, expiresAt, createdAt, createdByName }]`, never a token or hash. Names from `lookupProfiles` |
| `DELETE /api/projects/[id]/invitations/[invitationId]` | owner or admin. Calls `revoke_project_invitation`; `not_found` → 404; returns 200 `{ ok: true }`, also when already revoked |
| `GET /api/invitations/preview?token=` | signed in. Rate limit first (429). Returns `{ projectName, role, kind, status }` with status `valid`, `member`, `pending`; `gone` is a 410 with `GONE_MESSAGE` and writes `invite.accept_failed`. Never returns the invited email, the inviter, or member data (AC-16a) |
| `POST /api/invitations/accept` | signed in, body `{ token }`. Rate limit first (429). Lookup order per AC-19. `member` → 200 `joined`, no role change. Email kind: `emailMatchesInvite` false → 403 "This invite is for a different email" plus a failure row; then `accept_email_invitation`, `gone` → 410. Link kind: insert the join request with the Clerk name and email snapshot (name falls back fullName, username, the part before `@`), `on conflict do nothing` on the pending index, read the pending row back → 200 `pending`. Returns `{ status, projectId }` (AC-17 to AC-20) |
| `GET /api/projects/[id]/join-requests` | owner or admin. Pending only, `[{ id, displayName, email, role, createdAt }]` |
| `POST /api/projects/[id]/join-requests/[requestId]` | owner or admin, `{ decision: "approve" \| "deny" }`. Calls `decide_join_request`; `already_decided` → 409; returns the updated request (AC-21) |

Route tests next to each route, covering every case in the spec's *Critical test scenarios*: wrong email 403, reuse 410, expired 410, double approve 409, two accepts of one email invite (one joins), Developer creating an invite 403, Admin creating an Admin invite 403, admin link 422, re-invite (old link 410), revoke denies pending requests, 11 bad tokens → 429, preview never contains the email, removed member restored on an email invite, removed member gets a pending request on a link.

## 4. Invite email, Build plan item 4

In `src/lib/email.ts`, add `sendProjectInviteEmail({ to, projectName, inviterName, role, link })`, using the existing `escapeHtml`, `button`, and fetch pattern. It sends only when `RESEND_API_KEY` and `RESEND_WORKSPACE_FROM` are both set, with no fallback to the `onboarding@resend.dev` test sender. Before sending, count today's (UTC) `invite.emailed` rows across the app; at 60 or more, skip. A sent email writes `audit_log` `invite.emailed`. Unset, over budget, or failed all return `emailSent: false` and the invite still succeeds (AC-15). Never throws. (The umbrella budget also counts `notifications.emailed_at`. That table arrives in W8, so W2 counts only `invite.emailed`, and W8 adds the second count.)

Add `RESEND_WORKSPACE_FROM=` (empty) to `.env.example` if that file exists. I never read or edit `.env`.

## 5. UI, Build plan item 5

- `src/middleware.ts`: add `/invite(.*)` to `isProtectedRoute` (never `isPublicRoute`), so sign in returns to the same invite page (AC-16).
- `next.config`: a `headers()` entry for `/invite/:path*` with `Referrer-Policy: no-referrer` (AC-22a). If a `headers()` already exists, I add to it.
- `/invite/[token]` page (`src/app/(root)/(home)/invite/[token]/page.tsx` or wherever the signed in shell puts it, matching `/projects`): loads the preview. `valid` shows the project name, the role, and a Join button. `member` shows "You're already in this project" with a link to it. `pending` shows "Waiting for approval". 410 shows the one plain "This invite is no longer valid" message. After Join: email kind → toast and go to `/projects/[id]`; link kind → "Waiting for approval". 403 shows the different email message. 429 shows "Too many tries, wait a few minutes".
- Members tab (owner and admin only; others see nothing new):
  - An **Invite** button opens a dialog. Choose email or link, then the role. The role picker offers Admin only to the Owner and only for the email kind. Shows the link once with a Copy button. When `emailSent` is false on an email invite, it shows "Email not sent, copy the link".
  - An **Active invites** list: kind, email or "Link", role, expiry, who made it, Revoke. Revoking a link warns that waiting requests from it are denied.
  - A **Join requests** list: name, email, role, when, Approve and Deny. After a decision the members list reloads.
- All calls go through new functions in `src/lib/project-client.ts`. Every load uses `useLoadingTimeout` plus `LoadError`. Toasts via react-hot-toast.
- Component tests (`// @vitest-environment jsdom`): the role picker limits by role and kind, the "Email not sent" note, the invite page states (valid, member, pending, gone).
- After the UI: run `/imprint` and update `context/ui-registry.md`.

## 6. Checks and close

- `npx tsc --noEmit`, eslint on the changed files (JSON output filtered to changed files, since bracket paths break the CLI), `npx vitest run`, `npm run build`. All must pass, and all 759 existing tests stay green.
- Update `context/progress-tracker.md`, `context/build-plan.md` (W2 done, W3 next), and tick W2 in `docs/scope/scope.md` row #20.
- Feature stays `in-progress` (GA tier): `/check verify` and `/test` close it.

## Test steps for you (after the build)

Use two accounts, A (Owner) and B. Set `RESEND_WORKSPACE_FROM` only if you have a verified domain; otherwise every email invite shows "Email not sent, copy the link", which is expected.

1. As A, open a project's Members tab and invite B's email as Developer. Copy the link.
2. Open the link signed out: you land on sign in, then back on the invite page.
3. Sign in as some third account C and open B's link: preview shows the project, Join gives "This invite is for a different email".
4. As B, open it: Join puts you in the project as Developer. Open the same link again: "You're already in this project".
5. As A, invite B's email again as Viewer, then again as Developer: the first of these links now says "no longer valid".
6. As A, make a link invite as Viewer. Open it as C: "Waiting for approval". As A, approve C: C is a Viewer. Approve again from a second tab: 409.
7. Make another link, have C's second account (or a fourth) request, then revoke the link: the request shows denied, and opening the link says "no longer valid".
8. Try a made up `/invite/xyz` eleven times quickly: you get "Too many tries".
9. As an Admin (not the Owner), open the Invite dialog: Admin is not in the role picker.
