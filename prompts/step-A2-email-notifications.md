# Step A2 — Make "Email notifications" toggle functional

**Skill used:** `/architect` (decision pass complete — mechanism chosen).
**Status:** Prompt written, awaiting approval. Do NOT implement until approved.

## Goal

Make the Settings "Email notifications" toggle actually email the user when a meeting
finishes processing. The toggle currently persists `emailNotifications` to `localStorage`
(`neurameet:prefs`) but is never read — so it gates nothing. This step wires it to a real,
zero-cost, server-side email send.

## Mechanism decision (from /architect)

- **Free-tier transactional email API = Resend** (free 3,000 emails/month). Swappable to
  Brevo; no new npm dependency — call the REST API with `fetch`.
- The email send happens **server-side only**, inside the existing `/api/ai/process` route.
- API key lives in a **server-only env var** (`RESEND_API_KEY`); never in the browser bundle.
- Accepted interpretation of the zero-cost rule: a free email-only API is within spirit —
  it is not a paid API and not a second AI/vector provider.

## Behavior

- Toggle **ON** + a meeting finishes processing → user receives an email:
  "Your NeuraMeet summary is ready" with the meeting title and a link to
  `/meeting-intelligence/[id]`.
- Toggle **OFF** → no email, under any path.
- The send is **non-fatal**: any failure (missing key, network error, Resend error) is
  logged and never blocks the processing result. Missing `RESEND_API_KEY` → log warning + skip.

## Files to create / modify

### New — `src/lib/email.ts` (`"server-only"`)
- `sendMeetingReadyEmail({ to: string; meetingTitle: string; meetingId: string }): Promise<boolean>`
- `POST https://api.resend.com/emails` with header `Authorization: Bearer ${process.env.RESEND_API_KEY}`.
- Body: `{ from: process.env.RESEND_FROM ?? "onboarding@resend.dev", to, subject: "Your NeuraMeet summary is ready", html: <summary-ready email with title + link> }`.
- Wrapped in try/catch; returns `true` on 2xx, `false` (after logging) on any failure.
- No new dependency — use `fetch`.

### Modify — `src/app/api/ai/process/route.ts`
- Accept `emailNotifications?: boolean` in the request body (alongside existing `meetingId`).
- After insights are written successfully (current success path), if `emailNotifications === true`:
  - Resolve recipient via `currentUser()` from `@clerk/nextjs/server` (primary email) — do NOT trust a client-supplied email.
  - Fetch the meeting title from `meetings` by `meetingId`.
  - Call `sendMeetingReadyEmail(...)` inside a try/catch; record `emailSent` boolean. Non-fatal.
  - Include `emailSent` in the JSON response.
- Keep all existing error handling and the follow-up auto-generation logic intact.

### Modify — `src/components/UploadTranscriptModal.tsx`
- Reuse `readUserPrefs()` from `@/lib/user-prefs` (already imported for A1).
- Read `emailNotifications` and pass it in the `/api/ai/process` request body when processing runs
  (the call is already gated on `aiAutoSummary` per A1 — when that is OFF, processing is skipped,
  so no email fires anyway).

### Env (setup, not code)
- `RESEND_API_KEY` — Vercel server env + `.env.local` (never committed).
- `RESEND_FROM` — Vercel server env + `.env.local` (test default `onboarding@resend.dev`;
  replace with a verified domain before production).

### Context updates
- `context/progress-tracker.md`: move A2 to In Progress, then Done after verification.
- `context/ui-registry.md`: likely unaffected (Settings behavior, no new component) — update only if a component changes.

## Constraints (never violate)

- Zero cost: Supabase, Gemini, Groq, Vercel, Stream, Clerk free tiers only. Never add a paid API.
- No keys in the browser. Email send is server-side with a server-only secret.
- Small functions, explicit `strict` TypeScript types, no `any`.
- Every external call (Resend) wrapped in try/catch, failures logged, never crash the run.
- No changes outside this task's scope. No unrelated refactors.

## Verification

1. `npx tsc --noEmit` — clean.
2. `npm run build` — exit 0.
3. Functional (requires `RESEND_API_KEY` set + a free Resend account):
   - Toggle ON → upload a transcript → processing completes → email arrives in the dev's inbox
     (subject "Your NeuraMeet summary is ready", correct title + link).
   - Toggle OFF → upload → processing completes → NO email sent.
   - Confirm `emailSent` flag reflects the toggle in the route response.
4. Resilience: with `RESEND_API_KEY` unset, processing still succeeds and the route does not crash.
