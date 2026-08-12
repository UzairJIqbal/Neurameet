# Step 0.5 — Auth System Fixes

**Goal:** Fix the three auth gaps found during Step 0.5 code verification so the full test matrix passes.

---

## Gap 1: No Sign-Out Button

**Problem:** No sign-out mechanism exists anywhere in the app. Users cannot sign out.

**Fix:** Add a sign-out button to the Sidebar component. The Sidebar is the persistent navigation shell — it's the right place for a sign-out action.

**File:** `src/components/Sidebar.tsx`

**Implementation:**
- Add a "Sign Out" item at the bottom of the sidebar navigation list
- Use Clerk's `useClerk()` hook — call `signOut()` on click
- Use `IconLogout` from `@tabler/icons-react` (consistent with existing Tabler icons)
- Style: same as other nav items but visually separated (add a top border separator before it)
- After sign-out, Clerk will redirect to the sign-in page automatically (default behavior)

**Pattern to follow:** Match the existing nav item pattern in the Sidebar — `SidebarLink` or equivalent item with icon + label. Place it after the Settings link with a visual separator.

**Icon:** All sidebar nav icons use `next/image` with PNGs from `/icons/sidebar/`. No logout asset exists and I can't create PNGs. Use an **inline SVG** (20×20, `className="invert brightness-0"` to match the existing treatment) — a simple door/arrow-right icon. This keeps the entry inside `sidebarLinks` without introducing Tabler icons alongside Image icons. See the existing `sidebarLinks` pattern in `constants/index.tsx` for the exact structure.

---

## Gap 2: Missing `/forgot-password` Route

**Problem:** `SignInForm.tsx` links to `/forgot-password` (line 184) but no such page exists — clicking it 404s.

**Fix:** Create a minimal forgot-password page using Clerk's `useSignIn` with `prepareEmailAddressReset`.

**File to create:** `src/app/(auth)/forgot-password/page.tsx`
**File to create:** `src/components/auth/ForgotPasswordForm.tsx`

**Implementation:**
- Create a simple form: email input + submit button
- On submit: call `signIn.create({ strategy: "reset_password_email_code", identifier: email })` then `signIn.prepareEmailAddressReset({ strategy: "reset_password_email_code" })`
- Show a success toast: "Check your email for a password reset link"
- Include a "Back to sign in" link
- Reuse `AuthLayout` with `variant="sign-in"` for consistent split-screen layout
- Follow the same styling patterns as SignInForm (same tokens, same spacing)
- Use `react-hot-toast` for the success toast (consistent with SignInForm/SignUpForm — no sonner)

**Note:** This is a minimal implementation. Clerk handles the actual reset flow via email. We just need the entry point.

---

## Gap 3: Missing Protected Routes in Middleware

**Problem:** Several routes exist but aren't in `isProtectedRoute` — an unauthenticated user could access them directly.

**Fix:** Add missing routes to the middleware's protected routes list.

**File:** `src/middleware.ts`

**Current list:**
```ts
const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/personal-room(.*)",
  "/previous(.*)",
  "/recording(.*)",
  "/upcoming(.*)",
  "/meeting(.*)",
]);
```

**Add these:**
```ts
"/meeting-intelligence(.*)",
"/follow-ups(.*)",
"/ai-chat",
"/settings",
```

These match the routes defined in `context/architecture.md`'s folder structure. Use `(.*)` suffix on all to protect sub-routes (e.g., `/meeting-intelligence/[id]`).

---

## Verification

After implementing, verify:
1. Sign-out button visible in sidebar, clicking it signs out and redirects to `/sign-in`
2. `/forgot-password` renders the form, submitting shows toast, "Back to sign in" link works
3. Direct URL to `/meeting-intelligence`, `/ai-chat`, `/follow-ups`, `/settings` while unauthenticated bounces to sign-in
4. `npx tsc --noEmit` passes with no errors
