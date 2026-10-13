# Prompt 06 — Auth Pages (Split-Screen Layout)

## Goal

Replace the existing `MainAuth` component with a proper split-screen auth layout and updated sign-in/sign-up pages, matching the design spec in `context/ui-rules.md`.

---

## What Exists Today

- `src/components/MainAuth.tsx` — simple two-column layout using `BackgroundLines` animation on the left and raw Clerk `<SignIn>`/`<SignUp>` on the right. No split-screen hero panel, no custom forms, no social login buttons beyond Clerk defaults.
- `src/app/(auth)/sign-in/[[...sign-in]]/page.tsx` — wraps `MainAuth` in a flex container.
- `src/app/(auth)/sign-up/[[...sign-up]]/page.tsx` — same pattern.
- `src/app/(auth)/main_auth/page.tsx` — default sign-in page.

---

## Design Spec (from context/ui-rules.md)

### Split-Screen Layout (Auth Pages)

Two-panel layout:

- **Left panel (hero):** `bg-dark-1` with purple gradient overlay. Contains NeuraMeet logo, heading text, subtitle, social login icons (Google, Microsoft, GitHub). Fixed height, full viewport height on desktop.
- **Right panel (form):** `bg-surface` (white) or `bg-dark-3` (dark). Contains the auth form. Scrollable if content overflows.
- **Desktop:** Side-by-side, 50/50 split.
- **Mobile:** Stacked vertically, hero on top, form below.
- **Divider:** No visible divider — clean edge.
- **Left panel buttons:** Social login icons as circular buttons with dark bg + white icon.
- **Input fields:** Full-width, `rounded-lg`, `border border-sky-2`, `px-4 py-3`, placeholder `text-sky-1`.
- **Primary CTA in form:** `bg-green-1 text-white rounded-xl px-4 py-2 font-medium` ("Send Code" / "Get Started Free").
- **Secondary CTA in form:** `bg-purple-1 text-white rounded-xl px-4 py-2 font-medium` ("Create Account" / "Sign In").
- **Links:** `text-blue-1 hover:underline` for "Forgot Password?", "Sign up", "Sign in".

---

## Implementation Plan

### 1. Create `src/components/auth/AuthLayout.tsx`

Split-screen layout component. Accepts `children` for the right panel content.

```
"use client"

Props: { children: React.ReactNode }

Structure:
- Outer: flex h-screen w-full
- Left panel (hidden on mobile, visible lg:flex):
  - bg-dark-1, flex-1, relative overflow-hidden
  - Purple gradient overlay (absolute inset-0, bg-gradient-to-br from-purple-1/20 via-transparent to-purple-1/10)
  - Content (relative z-10, flex flex-col items-center justify-center h-full px-8):
    - Logo image (next/image, 48x48)
    - Heading: "Welcome to NeuraMeet" (text-white, text-3xl font-bold)
    - Subtitle: "Built for teams that value clarity and speed." (text-sky-1, text-lg)
    - Social login icons row: Google, GitHub, Microsoft as circular buttons (bg-dark-3, hover:bg-dark-4, text-white, rounded-full, p-3)
      - Use IconBrandGoogle, IconBrandGithub, IconBrandMicrosoft from @tabler/icons-react
- Right panel:
  - flex-1, flex items-center justify-center bg-dark-2 (or surface for light mode)
  - p-8, max-w-md w-full
  - Renders {children}
```

### 2. Create `src/components/auth/SignInForm.tsx`

Custom sign-in form using Clerk's `useSignIn` hook.

```
"use client"

Structure (inside AuthLayout):
- Heading: "Sign in to NeuraMeet" (text-white, text-2xl font-bold, mb-2)
- Subtitle: "Welcome back. Enter your details." (text-sky-1, mb-8)
- Form:
  - Email field: input type="email", placeholder "Enter your email"
    - Styling: w-full bg-dark-3 border border-sky-2 rounded-lg px-4 py-3 text-white placeholder:text-sky-1 focus:outline-none focus:ring-2 focus:ring-purple-1
  - "Send Code" button: bg-green-1 text-white rounded-xl px-4 py-2 font-medium w-full
    - Calls signIn.create({ strategy: "email_code", identifier: email })
    - On success, show OTP input
  - OTP input (conditional, shown after code sent):
    - 6-digit code input
    - "Verify" button: bg-purple-1 text-white
    - Calls signIn.attemptFirstFactor({ strategy: "email_code", code })
    - On success, redirect to /dashboard
  - "Continue with Password" link: text-blue-1 hover:underline, text-sm
    - Toggles to password mode
  - Password field (conditional, shown in password mode):
    - input type="password", same styling as email
    - "Sign In" button: bg-purple-1 text-white
    - Calls signIn.create({ strategy: "password", identifier: email, password })
  - Divider: "Or sign in with" with horizontal lines
  - Social buttons row: Google, GitHub, Microsoft
    - Each calls signIn.authenticate({ strategy: "oauth_<provider>" })
  - Footer: "Don't have an account? " + link to /sign-up (text-blue-1)
```

Use Clerk's `useSignIn()` hook from `@clerk/nextjs`. Handle errors with `react-hot-toast`.

### 3. Create `src/components/auth/SignUpForm.tsx`

Custom sign-up form using Clerk's `useSignUp` hook.

```
"use client"

Structure (inside AuthLayout):
- Heading: "Create your account" (text-white, text-2xl font-bold, mb-2)
- Subtitle: "Get started with NeuraMeet for free." (text-sky-1, mb-8)
- Form:
  - Name field: input type="text", placeholder "Full name"
  - Email field: input type="email", placeholder "Enter your email"
  - "Send Code" button: bg-green-1 text-white
    - Calls signUp.create({ emailAddress: email, firstName, lastName })
    - Then signUp.prepareEmailAddressVerification({ strategy: "email_code" })
  - OTP input (conditional, shown after code sent):
    - 6-digit code input
    - "Verify & Create Account" button: bg-purple-1 text-white
    - Calls signUp.attemptEmailAddressVerification({ code })
    - On success, redirect to /dashboard
  - "Continue with Password" link: text-blue-1
  - Password field (conditional):
    - input type="password"
    - "Create Account" button: bg-purple-1 text-white
    - Calls signUp.create({ emailAddress: email, password, firstName, lastName })
  - Divider: "Or sign up with"
  - Social buttons row: Google, GitHub, Microsoft
  - Terms text: "By signing up, you agree to our Terms of Service and Privacy Policy"
  - Footer: "Already have an account? " + link to /sign-in (text-blue-1)
```

### 4. Update page files

- `src/app/(auth)/sign-in/[[...sign-in]]/page.tsx` — render `<SignInForm />`
- `src/app/(auth)/sign-up/[[...sign-up]]/page.tsx` — render `<SignUpForm />`
- Delete `src/app/(auth)/main_auth/page.tsx` (no longer needed)

### 5. Delete `src/components/MainAuth.tsx`

No longer used after the new auth components are in place.

---

## Files to Create/Modify

| Action | File |
|--------|------|
| Create | `src/components/auth/AuthLayout.tsx` |
| Create | `src/components/auth/SignInForm.tsx` |
| Create | `src/components/auth/SignUpForm.tsx` |
| Modify | `src/app/(auth)/sign-in/[[...sign-in]]/page.tsx` |
| Modify | `src/app/(auth)/sign-up/[[...sign-up]]/page.tsx` |
| Delete | `src/app/(auth)/main_auth/page.tsx` |
| Delete | `src/components/MainAuth.tsx` |

---

## Rules

- All components use `"use client"` (need `useState`, Clerk hooks)
- Use tokens from `context/ui-tokens.md` — no hardcoded hex, no raw Tailwind colors
- Icons from `@tabler/icons-react` with `Icon` prefix
- Error handling: wrap all Clerk calls in try/catch, show errors via `react-hot-toast`
- No `sonner` — use `react-hot-toast` only
- TypeScript strict, no `any`
- Reuse existing `stateful-button.tsx` if a loading state button is needed, otherwise simple styled buttons

---

## Verification

1. `npx tsc --noEmit` — no type errors
2. `npm run build` — clean build
3. Manual test: visit `/sign-in` — split-screen layout appears, form works
4. Manual test: visit `/sign-up` — split-screen layout appears, form works
5. Manual test: mobile viewport — hero stacks above form
6. Manual test: Clerk social login buttons work (Google, GitHub)
