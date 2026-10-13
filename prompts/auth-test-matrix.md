# Auth Test Matrix — Step 0.5 Completion

## Goal
Complete the auth system verification that was marked premature. Run automated Playwright tests for everything CAPTCHA permits, then provide manual test steps for the rest.

## What gets built

### 1. Playwright installation + config
- `npm install -D @playwright/test`
- `npx playwright install chromium`
- `playwright.config.ts` — baseURL `http://localhost:3000`, projects: chromium only

### 2. Test file: `tests/auth.spec.ts`

**Automated tests (Playwright):**
| # | Test | Expected |
|---|------|----------|
| 1 | Visit `/dashboard` unauthenticated | Redirects to `/sign-in` |
| 2 | Visit `/personal-room` unauthenticated | Redirects to `/sign-in` |
| 3 | Visit `/previous` unauthenticated | Redirects to `/sign-in` |
| 4 | Visit `/recording` unauthenticated | Redirects to `/sign-in` |
| 5 | Visit `/upcoming` unauthenticated | Redirects to `/sign-in` |
| 6 | Visit `/meeting-intelligence` unauthenticated | Redirects to `/sign-in` |
| 7 | Visit `/follow-ups` unauthenticated | Redirects to `/sign-in` |
| 8 | Visit `/ai-chat` unauthenticated | Redirects to `/sign-in` |
| 9 | Visit `/settings` unauthenticated | Redirects to `/sign-in` |
| 10 | `/sign-in` page loads | Form visible, Google OAuth button, GitHub OAuth button, "Sign up" link, "Forgot password?" link |
| 11 | `/sign-up` page loads | Form visible, Google OAuth button, GitHub OAuth button, "Sign in" link |
| 12 | `/forgot-password` page loads | Email input, Submit button |
| 13 | `/sign-in` → "Sign up" link navigates to `/sign-up` | URL changes |
| 14 | `/sign-up` → "Sign in" link navigates to `/sign-in` | URL changes |
| 15 | `/sign-in` → "Forgot password?" link navigates to `/forgot-password` | URL changes |
| 16 | `/` (landing) loads for unauthenticated user | Landing page renders |
| 17 | Visit `/nonexistent-route` | 404 page or redirect |

**Manual tests (developer runs in browser):**
| # | Test | Steps |
|---|------|-------|
| M1 | Sign up with email | Fill form, complete CAPTCHA, submit → verify redirect to dashboard |
| M2 | Sign in with created account | Fill form, complete CAPTCHA, submit → verify redirect to dashboard |
| M3 | OAuth Google | Click Google button → complete OAuth → verify redirect to dashboard |
| M4 | OAuth GitHub | Click GitHub button → complete OAuth → verify redirect to dashboard |
| M5 | Session persistence | Sign in, close tab, reopen /dashboard → still signed in |
| M6 | Sign out | Click sign-out in sidebar → verify redirect to /sign-in, /dashboard blocked |
| M7 | Forgot password flow | Enter email → receive code → reset password → sign in with new password |
| M8 | Protected route after sign out | Sign out, visit /dashboard → redirected to /sign-in |

### 3. npm script
Add `"test": "npx playwright test"` to package.json scripts.

## Files modified
- `package.json` — add test script, add @playwright/test devDep
- `playwright.config.ts` — new
- `tests/auth.spec.ts` — new

## Verification
1. `npx playwright test` — all 17 automated tests pass
2. Developer runs M1–M8 manually in browser and checks off each
3. Update progress-tracker.md to mark Step 0.5 truly complete
