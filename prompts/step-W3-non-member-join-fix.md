# Fix: a signed in non member bounces to the dashboard instead of the guest lobby

Spec: `docs/specs/0004-conversations-to-code/0004-project-meetings.md`, AC-27. Rules in force: strict TypeScript, no `any`, small functions, no changes outside this task. Read the Clerk middleware behavior in the installed `@clerk/nextjs` types before editing. The `node_modules/next/dist/docs/` folder does not exist in this install, so say so in the report and check `middleware` behavior against the installed Next version instead.

## The bug

On a project meeting, a signed in user who is not a project member gets a 404 from `/consent` or `/members`. `MeetingSetup.sendToGuestFlow` (`src/components/MeetingSetup.tsx:95`) then does `router.push('/meeting/<callId>/guest')`. `src/middleware.ts:39-45` treats `/meeting/:id/guest` as a public route and redirects any signed in user to `/dashboard`. So the non member never reaches the guest lobby and the spec's AC-27 path is a dead end (found in the W3 test run).

## The change

1. `MeetingSetup.sendToGuestFlow`: push `/meeting/<callId>/guest?from=setup`.
2. `src/middleware.ts`: on the guest path, only redirect a signed in user to `/dashboard` when the `from=setup` query is absent. With the param, let them through. Signed out visitors are unchanged. All other routes unchanged.
3. Check the guest page (`src/app/(root)/meeting/[id]/guest/page.tsx`) works for a signed in visitor: it mints a guest identity through `/api/guest/request-join` (which requires `consented: true` on a project meeting) and never uses their Clerk user. If it assumes signed out, fix only what blocks that flow. Report anything bigger instead of fixing it.

Note: the param is spoofable, but it only lets a signed in person see the guest lobby, which they can already reach signed out. If you prefer, the simpler option is to drop the signed in redirect on the guest path entirely; pick the param version unless it causes trouble.

## Tests

- Add a middleware unit test or extend the existing W3 Playwright script (`tests/w-test/w3-project-meetings.spec.ts`) step 5: a signed in non member lands on the guest lobby, asks to join, the owner admits them, they join as a guest with consent recorded.
- Confirm signed in users opening the plain guest link still go to `/dashboard`.
- Run `npx vitest run`, typecheck, lint, build.

## Update

`context/progress-tracker.md` entry. `ui-registry.md` only if a component changes.

## Left out

Showing a clear "you are not a member" message in the lobby. Mention it as a follow up if it feels needed.
