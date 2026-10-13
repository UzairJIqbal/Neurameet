# G1.5 — Signed-out call room redirect to guest lobby

**Status**: code complete, pending live verification

## Context

G1 built `/meeting/:id/guest` as a public route so unauthenticated visitors could
join a meeting without a Clerk account. But the shared meeting link itself is
`/meeting/[id]` (the call room). Before this step, a signed-out visitor clicking
that link was bounced to Clerk sign-in instead of the guest lobby — breaking the
G0 §1 requirement ("unauthenticated participant clicks a *shared meeting link*
lands on Guest Setup page").

## Requirement

The **same** shared link (`/meeting/[id]`) must route signed-out visitors to the
guest lobby (`/meeting/[id]/guest`). Signed-in visitors continue unchanged to
the meeting setup / call room.

## Decisions locked (per /architect review)

1. **Strict regex, not split-length guard.** Use
   `/^\/meeting\/[^/]+\/?$/.test(req.nextUrl.pathname)` to match only the bare
   call-room path. This correctly:
   - matches `/meeting/abc123` and `/meeting/abc123/`
   - excludes `/meeting/abc123/guest` (already public)
   - excludes `/meeting/abc123/anything-else`
   - excludes `/meeting-intelligence/...` (protected, unaffected)

2. **Unauthenticated check before protect().** The redirect runs before
   `auth.protect()` so the signed-in path is unchanged — if `userId` is present,
   the regex branch is skipped and `auth.protect()` handles the route normally.

3. **Single middleware branch.** No new route, no new provider. Just the one
   `if` block in `src/middleware.ts` before `isProtectedRoute` check.

## Route tree confirmed

```
src/app/(root)/meeting/
  [id]/
    page.tsx          ← call room (redirect target for unauthenticated)
    guest/
      page.tsx         ← guest lobby (public route)
```

`meeting-intelligence` lives under `(root)/` directly, not under `meeting/`, so
the regex cannot accidentally make it public.

## Implementation (applied)

```typescript
// src/middleware.ts — added before isProtectedRoute check
if (/^\/meeting\/[^/]+\/?$/.test(req.nextUrl.pathname) && !userId) {
  const meetingId = req.nextUrl.pathname.split("/")[2];
  return NextURL(`/meeting/${meetingId}/guest`, req.url);
}
```

## Verification (TODO — live)

- [ ] signed-out, `/meeting/[id]` → lands on guest lobby
- [ ] signed-in, `/meeting/[id]` → lands on MeetingSetup (unchanged)
- [ ] `/meeting-intelligence/[id]` → still protected, unaffected
- [ ] tsc clean (`npx tsc --noEmit`)
- [ ] build exit 0 (`npm run build`)
