# W2. Invitations and join requests

Child of [0004. Conversations to Code](index.md). Uses the W2 SQL block and the invite rules in the umbrella security model.

## Summary

An Owner or Admin invites people two ways. An email invite is for one named person: it works once, only for the account whose verified email matches, and joins them straight away. A link invite is for sharing in a group chat: anyone can open it for 7 days, but each person lands in a waiting list until an Owner or Admin approves them. Both give you a link to copy. An email is sent only once you set up a sender on your own domain, because Resend's free test sender can only email you.

## Requirements

- **AC-13**: `POST /api/projects/[id]/invitations` (Owner or Admin) creates an invitation with a 32 byte random token, stores only its SHA-256 hex, sets `expires_at` to 7 days, and returns the full link `NEXT_PUBLIC_APP_URL/invite/<token>` once; `GET` never returns a token or hash.
- **AC-14**: Only the Owner may create an invite with role `admin`, and only as an email invite; a link invite with `admin` returns 422, an Admin asking for `admin` returns 403.
- **AC-15**: When `RESEND_WORKSPACE_FROM` is set, an email invite also sends a Resend email with the link; when it is unset or the send fails, the invite still succeeds and the UI shows "Email not sent, copy the link" (the copy link always works).
- **AC-16**: `/invite/[token]` requires sign in: `/invite(.*)` is added to `isProtectedRoute` in `src/middleware.ts` (never to `isPublicRoute`), and sign in returns to the same invite page.
- **AC-17**: Accepting an email invite joins the caller with the invite's role and marks it used, only when the caller's Clerk primary email, with status `verified`, equals the invite email (case insensitive); otherwise 403 "This invite is for a different email" and the invite stays unused.
- **AC-18**: Accepting a link invite creates one pending join request with the invite's role (Developer or Viewer) and returns `pending`; opening it again returns the same pending request, never a second one.
- **AC-19**: Checks run in this order: an unknown token returns 410; an active member gets `joined` (AC-20); then a revoked, used, or expired invite returns 410. Every 410 has the same plain message (no hint that a token never existed).
- **AC-20**: An already active member accepting any invite gets `joined` with no role change; a removed member accepting a valid email invite is restored with the invite's role (`removed_at` cleared); a removed member on a link invite gets a pending join request like anyone else.
- **AC-21**: Owner or Admin sees pending join requests and approves (member added, request `approved`) or denies; deciding twice returns 409; both write `audit_log`. (The requester and approver notifications arrive in W8, AC-71; until then the invite page shows the request state.)
- **AC-22**: More than 10 failed accepts by one user in 10 minutes returns 429 (counted from `audit_log` rows `invite.accept_failed`).

## Design

### Flow

1. Create: `crypto.randomBytes(32).toString("base64url")` → token; `createHash("sha256").update(token).digest("hex")` → `token_hash`.
2. Accept: `POST /api/invitations/accept { token }` → hash → look up (unknown: 410) → active member: `joined` → check `revoked_at`, `used_at`, `expires_at` (410) → branch on kind.
3. Email kind: the update is `update project_invitations set used_at = now(), used_by = $user where id = $id and used_at is null` and the join happens only when that update hit one row, so two tabs cannot both use it.
4. Link kind: insert into `project_join_requests` with `on conflict do nothing` on the one pending index, then read the pending row back.
5. Approve: upsert `project_members` (`removed_at = null`, role from the request), mark the request approved.

### Value sourcing

| Action | Value | Source |
|---|---|---|
| Accept (email kind) | caller's email | Clerk `getUser(userId).primaryEmailAddress` with `verification.status === "verified"` |
| Join request | display name, email | Clerk user at request time, stored as a snapshot for the approver list; name falls back fullName, then username, then the email part before `@` |
| Invite email | project name, inviter name | `projects.name`, Clerk user of `created_by` |
| Expiry | 7 days | constant `INVITE_TTL_DAYS = 7` in `src/lib/invitations.ts` |

Dev note: Clerk email verification is off in dev, so in dev a primary email may show `unverified`. Until Deploy turns verification back on, the check accepts an unverified primary email only when `NODE_ENV !== "production"`, and logs a warning. In production it is strict.

### UI

Members tab: Invite button (email or link, role picker limited by your role), active invites list with Copy and Revoke, and a Join requests list with Approve and Deny. `/invite/[token]` page: project name, role, and a Join button; it then shows "You joined" or "Waiting for approval".

### Critical test scenarios

- Happy path email: Owner invites `a@x.com` as Developer, that user accepts, joins, verifies **AC-13**, **AC-17**.
- Happy path link: two users open a link, both pending, Admin approves one and denies one, verifies **AC-18**, **AC-21**.
- Failure: wrong email 403, reuse 410, expired 410, double approve 409, two tabs accept the same email invite and only one joins, verifies **AC-17**, **AC-19**, **AC-21**.
- Auth: Developer creates an invite (403), Admin creates an Admin invite (403), link invite with admin (422), verifies **AC-14**.
- Abuse: 11 bad tokens in 10 minutes gives 429, verifies **AC-22**.

## Build plan

1. W2 SQL block with RLS and grants, satisfies **AC-13**, **AC-18**.
2. `src/lib/invitations.ts` (token, hash, TTL, accept logic) with unit tests, satisfies **AC-13**, **AC-17** to **AC-20**, **AC-22**.
3. Invitation, accept, and join request routes, satisfies **AC-13** to **AC-21**.
4. Invite email through the existing Resend helper pattern in `src/lib/email.ts`, gated on `RESEND_WORKSPACE_FROM`, satisfies **AC-15**.
5. Members tab invite UI and the `/invite/[token]` page, satisfies **AC-16**, **AC-18**.

## Rationale (short)

Two invite kinds match two real uses: a named person, and a link pasted in a group. Approval on links means a forwarded link is harmless. Storing only the hash means a database leak does not leak working invites. Copy link first keeps W2 shippable without a domain.
