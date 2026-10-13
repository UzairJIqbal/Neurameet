# Memory — Guest Stream Identity Rewrapping Fix

Last updated: 2026-09-19T12:18:24+05:00

## What was built

- Updated [src/components/GuestStreamClientProvider.tsx](./src/components/GuestStreamClientProvider.tsx) so an already server-minted guest connects with `{ id, name }` and its access token, without a client-side guest type marker.
- Added [src/components/GuestStreamClientProvider.test.tsx](./src/components/GuestStreamClientProvider.test.tsx) regression guards for the authenticated connection shape and absence of the guest marker.
- Updated [context/progress-tracker.md](./context/progress-tracker.md) with the identity rewrapping fix and verification status.

## Decisions made

- `POST /api/guest/request-join` remains the single guest-minting point. The client must use the returned Stream user id and token directly.
- Do not pass `type: "guest"` to the installed Stream SDK after server-side minting. That SDK branch calls `/guest` again and creates a second wrapped guest identity.
- Guest permissions remain server-authorized by the access token and Stream call permissions; omitting the client-side type does not promote the guest to a full user.

## Problems solved

- Prevented chained Stream ids such as `guest-...-guest-...`, which were caused by the SDK re-minting a guest when the provider passed the guest type.
- Preserved the existing guest display name, participant flow, admission flow, redirect logic, and owner-only recordings UI.

## Current state

- Installed SDK source was verified:
  - `StreamVideoClient.connectUser()` routes users with `type === "guest"` to `connectGuestUser()`.
  - `connectGuestUser()` POSTs to `/guest` and connects with the newly returned credentials.
  - Omitting `type` uses the normal authenticated `connectUser(user, token)` path.
- No `type: "guest"` remains in `GuestStreamClientProvider`.
- Verification passed:
  - `npx tsc --noEmit`
  - Focused guest tests: 16/16
  - Full Vitest: 204/204
  - `npm run build`
- A live Clerk/Stream meeting was not available in this environment, so fresh guest id persistence, participant count, after-meeting redirect, and recordings denial still need real-account verification.
- The worktree contains unrelated pre-existing changes; do not revert them.

## Next session starts with

1. Run the owner-controlled live G9 guest walkthrough with real Clerk, Stream, and Supabase credentials.
2. Verify a fresh guest join creates one clean `stream_user_id` with no concatenated guest id.
3. Confirm the owner sees exactly one participant, the guest reaches the after-meeting redirect, and the guest cannot access recordings while the owner can.
4. If live verification passes, update the pending G9 status in [context/progress-tracker.md](./context/progress-tracker.md) and run the final checks again.

## Open questions

- Live end-to-end behavior remains unconfirmed because no authenticated meeting session was available during this session.
