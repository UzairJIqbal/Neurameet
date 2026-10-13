# Debug Fix: Guest Stream User Id Rewrapping

## Root Cause

`GuestStreamClientProvider` connects an already server minted Stream guest as:

```ts
{ type: "guest", id: guestUserId, name: guestDisplayName }
```

The installed Stream SDK treats `type: "guest"` as a special branch that calls the public `/guest` endpoint again before connecting. This wraps the existing server minted guest id inside a new Stream guest id. Repeated use yields chained ids such as:

```txt
guest-e80bf13d-...-guest-f7cd40fc-...-guest-8f3415b6
```

Evidence:

- `src/app/api/guest/request-join/route.ts` mints once with `createGuestUser()` and stores `created.user.id`.
- `src/components/GuestStreamClientProvider.tsx` passes that id with `type: "guest"`.
- Installed SDK source:
  - `StreamVideoClient.connectUser()` routes `user.type === "guest"` to `client.connectGuestUser(user)`.
  - `connectGuestUser()` posts to `/guest` and then connects with the newly returned user and token.

## Fix

Connect the already minted guest through the authenticated token path by omitting `type` and passing the existing id plus access token:

```ts
c.connectUser({ id: guestUserId, name: guestDisplayName }, accessToken)
```

This avoids the SDK guest creation branch and uses `client.connectUser(user, tokenOrProvider)` directly.

## Scope

- Update only `src/components/GuestStreamClientProvider.tsx`.
- Update comments to explain why `type: "guest"` must not be used after server side minting.
- Add or update a focused regression test so this cannot quietly regress.

## Verification

- Confirm source contains no `type: "guest"` in `GuestStreamClientProvider`.
- `npx tsc --noEmit`
- targeted vitest for guest provider / responsive tests
- full vitest if practical
- `npm run build`
- live check fresh guest join:
  - `attendance_events.stream_user_id` is one clean server minted guest id, not a chained id.
  - participant count still updates.
  - after meeting redirect still works.
  - guest recordings panel / recordings query is not attempted for guests or still shows a non owner permission denial with a clean id if forced.
