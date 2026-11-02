# W2. Invitations and join requests

Child of [0004. Conversations to Code](index.md). Uses the W2 SQL block and the invite rules in the umbrella security model.

## Summary

An Owner or Admin invites people two ways. An email invite is for one named person: it works once, only for the account whose verified email matches, and joins them straight away. A link invite is for sharing in a group chat: anyone can open it for 7 days, but each person lands in a waiting list until an Owner or Admin approves them. Both give you a link to copy. An email is sent only once you set up a sender on your own domain, because Resend's free test sender can only email you.

## Requirements

- **AC-13**: `POST /api/projects/[id]/invitations` (Owner or Admin) creates an invitation with a 32 byte random token, stores only its SHA-256 hex, sets `expires_at` to 7 days, and returns the full link `NEXT_PUBLIC_APP_URL/invite/<token>` once; `GET` never returns a token or hash. A project holds at most 50 active invites (`revoked_at is null and used_at is null and expires_at > now()`); one more returns 422. The count runs inside the create rpc under a per project advisory lock, so it and the insert are atomic. The email is trimmed and lowercased before save, validated with zod (email format, at most 254 characters), and the column has `check (email = lower(email))`. Inviting an address that already belongs to an active member is allowed (no Clerk lookup at create, so the form cannot be used to probe who has an account); accepting it just returns `joined` (AC-20).
- **AC-14**: Only the Owner may create an invite with role `admin`, and only as an email invite; a link invite with `admin` returns 422, an Admin asking for `admin` returns 403.
- **AC-15**: When `RESEND_WORKSPACE_FROM` is set, an email invite also sends a Resend email with the link; a sent email writes `audit_log` `invite.emailed` and counts toward the workspace email budget of 60 a UTC day (umbrella Free tier table); when it is unset, the budget is spent, or the send fails, the invite still succeeds and the UI shows "Email not sent, copy the link" (the copy link always works).
- **AC-13a**: Inviting an email that already has a live invite (not revoked, not used) in the same project revokes that invite and issues a new one with a fresh 7 day expiry and the newly chosen role, in the same request; the old link then returns 410. The create rpc first takes one per project lock, `pg_advisory_xact_lock(hashtext('invite:' || project_id::text))` (the same lock the AC-13 cap uses), so two clicks at once run one after the other and the last one wins (the earlier link returns 410). The unique index on live email invites stays as a backstop: a `23505` that still slips through returns 409.
- **AC-16a**: `GET /api/invitations/preview?token=` (signed in) returns `{ projectName, role, kind, status }` where status is `valid`, `member` (you are already an active member), `pending` (you already have a pending request from this project), or `gone`. It follows the AC-19 lookup order, never returns the invited email, the inviter, or any member data, consumes nothing, and an unknown or dead token gives the same 410 as accept. The `/invite/[token]` page renders from it.
- **AC-16**: `/invite/[token]` requires sign in: `/invite(.*)` is added to `isProtectedRoute` in `src/middleware.ts` (never to `isPublicRoute`), and sign in returns to the same invite page.
- **AC-17**: Accepting an email invite joins the caller with the invite's role and marks it used, only when the caller's Clerk primary email, with status `verified`, equals the invite email (case insensitive); otherwise 403 "This invite is for a different email" and the invite stays unused.
- **AC-18**: Accepting a link invite creates one pending join request with the invite's role (Developer or Viewer) and returns `pending`; opening it again returns the same pending request, never a second one. A user who already has a pending request in the project and opens a different link keeps the first request (its role and invitation), not a new one. Pending requests stay approvable after their link expires (they asked in time), and only revoking the link denies them (AC-21a).
- **AC-19**: Checks run in this order: an unknown token returns 410; an active member gets `joined` (AC-20); then a revoked, used, or expired invite returns 410. Every 410 has the same plain message (no hint that a token never existed).
- **AC-20**: An already active member accepting any invite gets `joined` with no role change; a removed member accepting a valid email invite is restored with the invite's role (`removed_at` cleared, `added_by` set to the inviter, `audit_log` `member.restored`); the Owner can never be in the removed state, because the Owner must transfer before leaving; a removed member on a link invite gets a pending join request like anyone else.
- **AC-21**: Owner or Admin sees pending join requests and approves (member added, request `approved`) or denies; deciding twice returns 409; both write `audit_log`. Approve sets `added_by` to the approver. The list is Owner or Admin only and returns `{ id, displayName, email, role, createdAt }` per request; the email is never copied into `audit_log` detail. Invariant: no pending request can point at a revoked invite (AC-21a). (The requester and approver notifications arrive in W8, AC-71; until then the invite page shows the request state.)
- **AC-21a**: `DELETE /api/projects/[id]/invitations/[invitationId]` sets `revoked_at`; revoking a link invite also denies every pending join request made from it (`status = 'denied'`, `decided_by` = the revoker), and both write `audit_log` (`invite.revoked`, `join_request.denied`).
- **AC-22**: More than 10 failed accepts by one user in 10 minutes returns 429 (counted from `audit_log` rows `invite.accept_failed` by `actor_id` in the last 10 minutes, served by the `audit_log_actor_action` index). Every 410 or 403 from accept or preview writes one `invite.accept_failed` row (`actor_id` = caller, `project_id` null when the token is unknown, otherwise the project). The count is checked before any token work; a successful accept does not reset it.
- **AC-22a**: The raw token is never logged and never stored in `audit_log` (rows carry the invitation id only). `/invite/*` responses send `Referrer-Policy: no-referrer`. Opening the link (GET) never consumes it; only the POST accept does, so chat app link previews are harmless.
- **AC-22b**: The dev rule that accepts an unverified primary email lives in one function, `emailMatchesInvite`, in `src/lib/invitations.ts` with unit tests. It is lenient only when `NODE_ENV` is exactly `development` or `test`, and strict when `NODE_ENV` is missing or anything else (fails closed).
- **AC-22c**: Route shapes: create returns 201 `{ invitation: { id, kind, email, role, expiresAt }, link, emailSent }`; list returns active invitations `[{ id, kind, email, role, expiresAt, createdAt, createdByName }]`; revoke returns 200 `{ ok: true }`, again 200 when already revoked, 404 when the invitation is in another project; accept returns 200 `{ status: "joined" | "pending", projectId }`; approve or deny returns the updated request.

## Design

### Flow

1. Create: `crypto.randomBytes(32).toString("base64url")` → token; `createHash("sha256").update(token).digest("hex")` → `token_hash`.
1a. Email kind create: in one rpc, `update project_invitations set revoked_at = now() where project_id = $p and kind = 'email' and email = $email and revoked_at is null and used_at is null`, then insert the new row (AC-13a). The active cap is counted before the insert.
2. Accept: `POST /api/invitations/accept { token }` → hash → look up (unknown: 410) → active member: `joined` → check `revoked_at`, `used_at`, `expires_at` (410) → branch on kind.
3. Email kind: the update is `update project_invitations set used_at = now(), used_by = $user where id = $id and used_at is null` and the join happens only when that update hit one row, so two tabs cannot both use it.
4. Link kind: insert into `project_join_requests` with `on conflict do nothing` on the one pending index, then read the pending row back.
5. Revoke: set `revoked_at`; for a link invite also `update project_join_requests set status = 'denied', decided_by = $user, decided_at = now() where invitation_id = $id and status = 'pending'` (AC-21a).
6. Approve: upsert `project_members` (`removed_at = null`, role from the request), mark the request approved.

### Value sourcing

| Action | Value | Source |
|---|---|---|
| Accept (email kind) | caller's email | Clerk `getUser(userId).primaryEmailAddress` with `verification.status === "verified"` |
| Join request | display name, email | Clerk user at request time, stored as a snapshot for the approver list; name falls back fullName, then username, then the email part before `@` |
| Invite email | project name, inviter name | `projects.name`, Clerk user of `created_by` |
| Invite page | project name, role, status | `GET /api/invitations/preview` (AC-16a): `projects.name`, `project_invitations.role` and `kind`, membership and pending request of the caller |
| Expiry | 7 days | constant `INVITE_TTL_DAYS = 7` in `src/lib/invitations.ts` |
| Active invite cap | 50 per project | constant `MAX_ACTIVE_INVITES = 50` in `src/lib/invitations.ts` |
| Email sender | from address | `RESEND_WORKSPACE_FROM` (no fallback to the `onboarding@resend.dev` test sender used by `RESEND_FROM`) |

Dev note: Clerk email verification is off in dev, so in dev a primary email may show `unverified`. Until Deploy turns verification back on, the check accepts an unverified primary email only when `NODE_ENV !== "production"`, and logs a warning. In production it is strict.

### UI

Members tab: Invite button (email or link, role picker limited by your role), active invites list with Copy and Revoke, and a Join requests list with Approve and Deny. `/invite/[token]` page: project name, role, and a Join button; it then shows "You joined" or "Waiting for approval".

### Critical test scenarios

- Happy path email: Owner invites `a@x.com` as Developer, that user accepts, joins, verifies **AC-13**, **AC-17**.
- Happy path link: two users open a link, both pending, Admin approves one and denies one, verifies **AC-18**, **AC-21**.
- Failure: wrong email 403, reuse 410, expired 410, double approve 409, two tabs accept the same email invite and only one joins, verifies **AC-17**, **AC-19**, **AC-21**.
- Auth: Developer creates an invite (403), Admin creates an Admin invite (403), link invite with admin (422), verifies **AC-14**.
- Re-invite: invite `a@x.com` as Viewer, then again as Developer; the first link gives 410, the second joins as Developer, verifies **AC-13a**.
- Revoke: two users wait on a link, Owner revokes it, both requests show denied and a third open gives 410, verifies **AC-21a**.
- Preview: a stranger with a dead token gets the same 410 as accept, and the response never contains the invited email, verifies **AC-16a**, **AC-22**.
- Race: two re-invites for the same email at once leave exactly one live invite, verifies **AC-13a**.
- Dev rule: `emailMatchesInvite` with an unverified email passes under `development`, fails under `production` and with `NODE_ENV` unset, verifies **AC-22b**.
- Abuse: 11 bad tokens in 10 minutes gives 429, verifies **AC-22**.

## Build plan

1. W2 SQL block with RLS and grants, the one live email invite index, the `audit_log_actor_action` index, and the re-invite rpc, satisfies **AC-13**, **AC-13a**, **AC-18**, **AC-22**.
2. `src/lib/invitations.ts` (token, hash, TTL, accept logic) with unit tests, satisfies **AC-13**, **AC-17** to **AC-20**, **AC-22**.
3. Invitation, preview, accept, and join request routes, satisfies **AC-13** to **AC-22c**. Add `GET /api/invitations/preview` to the AGENTS.md API Contracts list before coding.
4. Invite email through the existing Resend helper pattern in `src/lib/email.ts`, gated on `RESEND_WORKSPACE_FROM`, satisfies **AC-15**.
5. Members tab invite UI and the `/invite/[token]` page, satisfies **AC-16**, **AC-18**.

## Rationale (short)

Two invite kinds match two real uses: a named person, and a link pasted in a group. Approval on links means a forwarded link is harmless. Storing only the hash means a database leak does not leak working invites. Copy link first keeps W2 shippable without a domain. Re-inviting replaces the old invite, so resending or changing the role needs no extra button and never leaves two working links for one person. Revoking a leaked link denies its waiting requests, so a later careless Approve cannot let them in.

Updated 2026-11-03 at `/architect` W2: added AC-13a (re-invite replaces), AC-21a (revoke denies pending link requests), the 50 active invite cap, and three indexes. Nothing from W0 changed. Then a cross check (Sonnet) added AC-16a (preview route), AC-22a to AC-22c, and the lock, email, cap, restore, and pending request rules folded into AC-13, AC-13a, AC-18, AC-20, AC-21, AC-22.
