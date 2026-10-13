# Step 9 — Playwright E2E regression pass

**Goal:** A full end-to-end regression that proves the core NeuraMeet flow works in a real
browser against the running app + live backend. Two specs:

1. **Keep** `tests/auth.spec.ts` (unauthenticated regression — protected-route redirects,
   sign-in/sign-up/forgot-password/landing/404). This is the Step 0.5 baseline; do not remove it.
2. **Add** `tests/e2e.spec.ts` — an **authenticated** regression that walks the four build-plan
   happy paths:
   - Join meeting (room page renders)
   - Upload transcript → insights appear
   - Ask a question in AI Chat → streamed answer
   - Mark a follow-up complete

This is the final checkpoint before Step 9.5 / Step 10. No new product features.

---

## Read before coding

- `playwright.config.ts` (current config — `testDir: "./tests"`, `baseURL: localhost:3000`,
  auto-starts `npm run dev`, `reuseExistingServer` on).
- `tests/auth.spec.ts` (existing spec — keep intact, mirror its style).
- `src/components/UploadTranscriptModal.tsx` (the upload→process→embed→redirect flow; what the
  E2E will drive).
- `src/components/meeting-intelligence/MeetingDetail.tsx`, `MeetingTabs.tsx`, `AiChatTab.tsx`,
  `ChatPanel.tsx` (detail/tabs/chat UI the E2E asserts against).
- `src/components/follow-ups/FollowUpList.tsx`, `FollowUpDetails.tsx` (status controls).
- `src/components/MeetingSetup.tsx` / `MeetingRoom.tsx` (what "Join meeting" renders).
- `AGENTS.md` Security section — every AI/DB call stays server-side; the E2E only drives the UI
  and relies on the already-built API routes. No secrets in the test file.

---

## Authentication strategy (the key decision)

Use Clerk's official **`@clerk/test`** package: `clerkSetup()` in config `globalSetup` +
`setupClerkTestingToken({ page })` per authenticated test. This programmatically signs the test
browser into a Clerk **test-mode** session — no real credentials, no CAPTCHA, no email verification.
It requires:

- Install `@clerk/test` (devDependency).
- `CLERK_SECRET_KEY` (already in `.env.local`) available to the **Playwright runner process** — the
  config loads `.env.local` (dotenv) so `setupClerkTestingToken` can call Clerk's backend.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` must be `pk_test_…` (Clerk dev/test instance — it is, per AGENTS.md).
- The signed-in test user is a **fresh Clerk test user** (no pre-existing meetings) — fine, because
  the E2E *creates* its own meeting via upload, so Follow-ups/Chat assertions use data the test made.

Fallback (only if `setupClerkTestingToken` is unavailable in this Clerk version): drive the real
Clerk sign-in form with credentials from `E2E_CLERK_EMAIL` / `E2E_CLERK_PASSWORD` env vars (a
pre-created dev user; dev email-verification is OFF, so no verification step). State which path was
used in the final report.

---

## Part 1 — Config changes (`playwright.config.ts`)

- Import `dotenv/config` (or `dotenv`) at top so `CLERK_SECRET_KEY` is present for the runner.
- Add `globalSetup: "./tests/clerk.global-setup.ts"` that calls `clerkSetup()`.
- Add a `tests/clerk.global-setup.ts`:
  ```ts
  import { clerkSetup } from "@clerk/test";
  export default async function globalSetup() {
    await clerkSetup();
  }
  ```
- Keep `webServer`, `baseURL`, reporter, project as-is. Bump `timeout` if needed (AI steps are slow).

---

## Part 2 — Authenticated E2E (`tests/e2e.spec.ts`)

Wrap the whole file's auth in a `test.beforeEach` (or a `test.describe` with `beforeAll`) that calls
`await setupClerkTestingToken({ page })`, then `await page.goto("/dashboard")` (must NOT redirect to
`/sign-in` — asserts auth works).

Use **generous timeouts** (e.g. `test.setTimeout(90000)`) because upload→Gemini process→embed and
AI Chat streaming are live and slow. Use stable selectors (roles/text), not CSS internals.

### Test 1 — Upload transcript → insights appear
1. From `/dashboard`, click the **Upload Transcript** quick-action card (opens `UploadTranscriptModal`).
2. Assert modal visible. Fill the **title** input and the **transcript** textarea with a realistic
   sample (a few paragraphs of meeting dialogue).
3. Click **Upload & Process**.
4. Assert redirect to `/meeting-intelligence/<id>` (URL matches `/\/meeting-intelligence\/.+/`).
5. On the detail page, assert the **meeting title** (the one just entered) is visible.
6. Assert the tabs render: **Overview / Summary / Action Items / Recording / Category / AI Chat**.
7. (Optional, more brittle) Click **Summary** tab and assert a non-empty summary block appears
   within a timeout. Keep this assertion soft — if the live Gemini call is slow, the page still
   proves the pipeline ran because the detail route resolved.

### Test 2 — Ask a question in AI Chat → streamed answer
1. Still on the detail page, click the **AI Chat** tab → `ChatPanel` renders.
2. Type a question referencing the uploaded transcript (e.g. "What decisions were made?") into the
   chat input, press the send button.
3. Assert an **assistant message** eventually appears (the panel shows a bot response / the input
   becomes editable again after streaming). Depends on `meeting_chunks` from the upload's embed step
   + live Gemini chat — both already verified working in Step 5/6.

### Test 3 — Mark a follow-up complete
1. Navigate to `/follow-ups`.
2. Assert at least one follow-up row is present (the upload auto-generated `follow_ups` from its
   `action_items` — verified in Step 7).
3. Click the first follow-up's **status control → Mark complete** (or navigate into its detail and
   use the 3-button status control wired to `updateFollowUpStatus`).
4. Assert the row/detail now shows **completed** status (re-fetch / revalidate).

### Test 4 — Join meeting (room renders)
1. Navigate to `/personal-room`.
2. Click **Start Meeting** (→ routes to `/meeting/<id>`).
3. Assert the **Meeting Setup / Room** UI renders (controls, participant area, or the in-call shell
   `bg-inverse-surface`) — i.e. the page did not 500 or bounce to an error.
4. **Do NOT** assert a real WebRTC call connects (camera/mic/network is flaky in headless). This is a
   render/route assertion only. Close the page.

---

## Tokens / rules (must hold)

- Test file contains **no secrets** — reads `CLERK_SECRET_KEY` only via the runner env (never logs it).
- Only stable locators (`getByRole`, `getByText`, `getByPlaceholder`, explicit `data-testid` if a
  component already has one). Do not select by hashed Tailwind classes.
- Each E2E test is independent and resilient: if a live AI step is slow, rely on route/title
  assertions, not exact generated text.
- Keep `tests/auth.spec.ts` byte-for-byte intact.
- No product code changes. This step is verification only. (If you *discover* a real bug while
  running, report it — do not silently patch product code in this step.)

## Files

- **Modify:** `playwright.config.ts` (dotenv load + `globalSetup`).
- **Create:** `tests/clerk.global-setup.ts`, `tests/e2e.spec.ts`.
- **Install:** `@clerk/test` (devDependency).
- (No `src/` changes.)

## Out of scope (do not build in this step)

- Step 9.5 deferred features (functional Settings toggles, general `/ai-chat`, change-category write)
  — those are a later placeholder pass.
- Fixing discovered product bugs (report them; fix in a follow-up step).
- Real WebRTC call-connection assertions.

## Verification

1. `npx tsc --noEmit` — clean (the test files typecheck; `@clerk/test` ships types).
2. `npx playwright test` — both specs run:
   - `auth.spec.ts`: still green (unauthenticated regression).
   - `e2e.spec.ts`: the 4 authenticated tests pass against the live dev server (auto-started by
     Playwright) with live Gemini + Supabase.
3. If `setupClerkTestingToken` cannot run in this Clerk version, fall back to env-credential
   sign-in (Part 0) and note it in the report.
4. Report: which auth path was used, pass/fail per test, and any product bugs surfaced (none expected).
5. Update `progress-tracker.md` (close Step 9 ✅) and leave Step 9.5 ⬜ referenced. No `ui-registry`
   change (no new UI component).
