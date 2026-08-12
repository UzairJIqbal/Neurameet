# Memory — Auth System Complete (Step 0.5)

Last updated: 2026-08-11

## What was built

- **20/20 Playwright auth tests** (`tests/auth.spec.ts`) — all passing. Tests cover: protected route redirects (9 routes), sign-in page (4 tests), sign-up page (3 tests), forgot-password (2 tests), landing page, 404 handling. Config at `playwright.config.ts`, runs via `npm test`.
- **Email verification flow** — new `/verify-email` page with code entry, resend, and back-to-sign-in. Created `components/auth/VerifyEmailForm.tsx` and `app/(auth)/verify-email/page.tsx`.
- **CAPTCHA integration** — added `<div id="clerk-captcha" />` to both `SignInForm.tsx` and `SignUpForm.tsx`.
- **Non-complete status handling** — both forms now handle `missing_requirements` and other statuses with appropriate toasts instead of silently failing.

## Decisions made

- **Email verification page approach** — built a custom `/verify-email` page rather than using Clerk's prebuilt components, to match the existing custom auth UI pattern.
- **`/verify-email` is a public route** — added to `isPublicRoute` in `middleware.ts` because the user isn't signed in yet during verification.
- **Redirect after sign-up** — goes to `/verify-email` (not `/sign-in`) when email verification is required. Previous redirect to `/sign-in` caused "Couldn't find your account" error.
- **OAuth cancel behavior** — Clerk dashboard Paths config is the fix, not code. Development host paths must point to custom app routes.

## Problems solved

1. **CAPTCHA warning** ("Cannot initialize Smart CAPTCHA widget") — fixed by adding `clerk-captcha` div to forms.
2. **Sign-up not redirecting to dashboard** — `signUp.create()` returned `missing_requirements` not `complete`. Added handling for both statuses.
3. **No verification code entry page** — user received code but had nowhere to enter it. Created `/verify-email` page.
4. **"Couldn't find your account" after sign-up** — caused by redirecting to `/sign-in` instead of `/verify-email`. Fixed redirect path.
5. **GitHub OAuth rejected** ("oauth_github does not match allowed values") — GitHub OAuth was not enabled in Clerk Dashboard. Configuration fix, not code.
6. **OAuth cancel redirects to Clerk hosted page** (`crucial-eel-24.accounts.dev/sign-up`) — Clerk dashboard Paths → Component paths → `<SignIn />` and `<SignUp />` development host fields were empty, so Clerk fell back to Account Portal URLs.

## Current state

- **Step 0.5 fully complete** — all 20 Playwright tests passing, all manual tests (M1–M8) verified.
- **OAuth working** — Google and GitHub both tested end-to-end.
- **Email verification working** — sign-up → email code → `/verify-email` → enter code → dashboard.
- **CAPTCHA working** — no more Clerk CAPTCHA warnings.
- **Dev server** must be running for Playwright tests (`npm run dev`).

## Next session starts with

**Step 3.5 — Feature audit + redesign** (8 features, sequential). Start with **Meeting Room**. Read `context/designs/` for Meeting Room design files before building. Each feature: test current → fix → redesign to match `ui-tokens.md` + design files → verify.

## Open questions

- Should email verification be temporarily disabled in Clerk Dashboard for easier dev testing? (Currently works but adds a step to every test sign-up.)
- Supabase project setup (Step 1) — does a project exist yet, or does that need to be created? Schema tables are referenced in API routes but no migrations exist in the repo.
