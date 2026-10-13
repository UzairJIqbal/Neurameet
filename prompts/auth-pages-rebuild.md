# Auth Pages Rebuild — Sign-In + Sign-Up

## Goal
Rebuild `SignInForm.tsx`, `SignUpForm.tsx`, and `AuthLayout.tsx` to match `context/designs/sign-in.html` and `context/designs/sign-up.html` exactly, restyled with `context/ui-tokens.md` tokens only.

## Files to modify
1. `src/components/auth/AuthLayout.tsx` — Complete rewrite
2. `src/components/auth/SignInForm.tsx` — Restyle + fix content
3. `src/components/auth/SignUpForm.tsx` — Restyle + fix content

## Design Reference
- `context/designs/sign-in.html` — Base markup for sign-in layout structure
- `context/designs/sign-up.html` — Base markup for sign-up layout structure
- `context/designs/sign-in.png` — Visual reference for sign-in
- `context/designs/sign-up.png` — Visual reference for sign-up

## AuthLayout.tsx — Complete Rewrite

### Current problems
- Layout is inverted: dark panel LEFT, form RIGHT
- Design has: form panel LEFT (~40%), dark testimonial panel RIGHT (~60%)
- Uses retired tokens: `bg-dark-1`, `bg-surface-muted`, `text-sky-1`, `text-green-1`
- No testimonial content on right panel

### Target structure (from sign-in.html / sign-up.html)
```
<div class="flex h-screen w-full">
  <!-- LEFT: Form panel — bg-surface-container-lowest, ~40% -->
  <div class="flex-1 md:flex-none md:w-[40%] bg-surface-container-lowest flex flex-col items-center justify-center p-8">
    <!-- Logo -->
    <!-- Mobile heading (hidden on md+) -->
    <!-- {children} form content -->
    <!-- Footer link -->
  </div>

  <!-- RIGHT: Testimonial panel — bg-inverse-surface, ~60%, hidden on mobile -->
  <div class="hidden md:flex flex-1 md:w-[60%] bg-inverse-surface relative overflow-hidden items-center justify-center p-12">
    <!-- Decorative grid overlay -->
    <!-- Quote icon -->
    <!-- Testimonial blockquote -->
    <!-- Avatar + name/role -->
  </div>
</div>
```

### AuthLayout variant config
```ts
const variantContent = {
  "sign-in": {
    mobileHeading: "Welcome Back",
    mobileSubtitle: "Sign in to access your meetings...",
    testimonial: {
      quote: "NeuraMeet has completely transformed how our team runs meetings. The AI-generated summaries save us hours every week.",
      name: "Sarah Jenkins",
      role: "CTO at TechFlow",
      avatar: "https://i.pravatar.cc/150?img=32",
    },
  },
  "sign-up": {
    mobileHeading: "Get Started",
    mobileSubtitle: "Create your account to start...",
    testimonial: {
      quote: "The automated action items are incredibly accurate. It's like having an AI assistant in every meeting.",
      name: "David Chen",
      role: "VP Engineering at ScaleUp",
      avatar: "https://i.pravatar.cc/150?img=12",
    },
  },
};
```

### Token mapping for AuthLayout
| Design HTML class | Token class |
|---|---|
| `bg-surface-container-lowest` | `bg-surface-container-lowest` (white, #FFFFFF) |
| `bg-inverse-surface` or `bg-[#161925]` | `bg-inverse-surface` (#2D303D) |
| `text-inverse-on-surface` | `text-inverse-on-surface` |
| `text-inverse-primary` | `text-inverse-primary` |
| `border-outline-variant` | `border-outline-variant` |
| `text-on-surface` | `text-on-surface` |
| `text-on-surface-variant` | `text-on-surface-variant` |

### Right panel details
- Background: `bg-inverse-surface`
- Grid overlay: use CSS `radial-gradient` with `text-inverse-on-surface/20` opacity
- Quote icon: `IconQuote` from tabler, `text-inverse-primary`, size 48
- Blockquote text: `text-inverse-on-surface`, body-lg size
- Attribution: name `text-inverse-on-surface` font-semibold, role `text-inverse-primary`
- Avatar: 48×48 rounded-full, use `next/image` with `fill` + `object-cover` inside a relative container

## SignInForm.tsx — Restyle

### Changes needed
1. **Remove heading block** — the `"Sign in to NeuraMeet"` / `"Welcome back..."` heading is now in AuthLayout mobile heading. SignInForm should NOT render its own h2/p heading block.
2. **Sign In button**: `bg-green-1` → `bg-primary-container text-on-primary hover:bg-primary`
3. **"Forgot password?" link**: `text-blue-1` → `text-primary-container`
4. **"Sign up" footer link**: `text-blue-1` → `text-primary-container`
5. **Social login section**: Move ABOVE the email/password form (per sign-in.html: OAuth first, then divider, then email form)
6. **Social button icons**: Replace `IconBrandGoogle`/`IconBrandGithub` tabler icons with inline SVG logos (Google G logo, GitHub octocat) matching sign-in.html
7. **All retired tokens**: Replace throughout
   - `text-dark-2` → `text-on-surface`
   - `text-sky-1` → `text-on-surface-variant`
   - `border-sky-2` → `border-outline-variant`
   - `bg-surface` → `bg-surface-container-lowest`
   - `focus:ring-purple-1` → `focus:ring-primary-container`
   - `hover:text-dark-2` → `hover:text-on-surface`
8. **Input field styling**: Match sign-in.html — `bg-surface-container-lowest border border-outline-variant rounded-lg` with proper focus states
9. **Form structure per sign-in.html**:
   - Logo (optional, can skip if in mobile heading)
   - "Welcome back" h1 (mobile only, via AuthLayout)
   - Social buttons (Google, GitHub) with SVG icons
   - Divider: line — "or" — line
   - Email input with `IconMail` prefix
   - Password input with `IconLock` prefix + eye toggle
   - "Forgot password?" link (right-aligned above or below password)
   - Sign In button: `bg-primary-container text-on-primary`
   - Footer: "Don't have an account? Sign up" with `text-primary-container` link

### Structure from sign-in.html (left panel content)
```
<div class="w-full max-w-sm mx-auto">
  <!-- Logo (mobile only) -->
  <div class="md:hidden mb-8 text-center">
    <img src="/icons/logo.png" alt="NeuraMeet" class="w-12 h-12 rounded-lg mx-auto mb-4" />
    <h1 class="text-on-surface text-2xl font-bold">Welcome back</h1>
    <p class="text-on-surface-variant">Sign in to access your meetings...</p>
  </div>

  <!-- Desktop heading -->
  <div class="hidden md:block mb-8">
    <h1 class="text-on-surface text-2xl font-bold mb-2">Welcome back</h1>
    <p class="text-on-surface-variant">Sign in to your account to continue.</p>
  </div>

  <!-- OAuth buttons -->
  <div class="space-y-3 mb-6">
    <button class="w-full flex items-center justify-center gap-3 border border-outline-variant rounded-lg py-3 text-on-surface hover:bg-surface-container-low transition">
      [Google SVG] Continue with Google
    </button>
    <button class="w-full flex items-center justify-center gap-3 border border-outline-variant rounded-lg py-3 text-on-surface hover:bg-surface-container-low transition">
      [GitHub SVG] Continue with GitHub
    </button>
  </div>

  <!-- Divider -->
  <div class="flex items-center gap-4 mb-6">
    <div class="flex-1 h-px bg-outline-variant"></div>
    <span class="text-on-surface-variant text-sm">or</span>
    <div class="flex-1 h-px bg-outline-variant"></div>
  </div>

  <!-- Email/Password form -->
  <form class="space-y-4">
    <!-- Email -->
    <div>
      <label class="text-on-surface text-sm font-medium mb-1.5 block">Email</label>
      <div class="relative">
        <IconMail class="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
        <input class="w-full bg-surface-container-lowest border border-outline-variant rounded-lg pl-10 pr-4 py-3 text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary-container" />
      </div>
    </div>

    <!-- Password -->
    <div>
      <div class="flex items-center justify-between mb-1.5">
        <label class="text-on-surface text-sm font-medium">Password</label>
        <a class="text-primary-container text-sm hover:underline">Forgot password?</a>
      </div>
      <div class="relative">
        <IconLock ... />
        <input type="password" ... />
        <button type="button" class="eye-toggle">...</button>
      </div>
    </div>

    <!-- Sign In button -->
    <button class="w-full bg-primary-container text-on-primary rounded-lg py-3 font-medium hover:bg-primary transition">
      Sign In
    </button>
  </form>

  <!-- Footer -->
  <p class="text-center text-on-surface-variant text-sm mt-8">
    Don't have an account? <a class="text-primary-container hover:underline">Sign up</a>
  </p>
</div>
```

## SignUpForm.tsx — Restyle

### Changes needed
Same token replacements as SignInForm, plus:
1. **Remove heading block** — `"Create your account"` / `"Get started..."` is in AuthLayout mobile heading
2. **Heading per design**: "Get Started" (in AuthLayout mobile heading), subtitle "Create your account to start leveraging AI-powered meetings."
3. **"Create Account" button**: `bg-green-1` → `bg-primary-container text-on-primary hover:bg-primary`
4. **Terms checkbox links**: `text-blue-1` → `text-primary-container`
5. **"Sign in" footer link**: `text-blue-1` → `text-primary-container`
6. **Social buttons**: Same SVG icon changes as SignInForm
7. **Social buttons position**: ABOVE the form (per sign-up.html)
8. **Form fields**: Full Name, Email, Password, Confirm Password — all with same token fixes
9. **All retired tokens**: Same replacements as SignInForm

### Structure from sign-up.html (left panel content)
```
<div class="w-full max-w-sm mx-auto">
  <!-- Mobile heading -->
  <div class="md:hidden mb-8 text-center">
    <img ... logo />
    <h1 class="text-on-surface text-2xl font-bold">Get Started</h1>
    <p class="text-on-surface-variant">Create your account to start...</p>
  </div>

  <!-- Desktop heading -->
  <div class="hidden md:block mb-8">
    <h1 class="text-on-surface text-2xl font-bold mb-2">Get Started</h1>
    <p class="text-on-surface-variant">Create your account to continue.</p>
  </div>

  <!-- OAuth buttons (same as sign-in) -->
  <!-- Divider -->
  <!-- Form: Full Name, Email, Password, Confirm Password -->
  <!-- Terms checkbox -->
  <!-- Create Account button -->
  <!-- Footer: "Already have an account? Sign in" -->
</div>
```

## Social Button SVG Icons

### Google SVG (from sign-in.html)
```html
<svg width="20" height="20" viewBox="0 0 24 24">
  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
</svg>
```

### GitHub SVG (from sign-in.html)
```html
<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
</svg>
```

## Rules
- Use `next/image` for avatars with `fill` + `object-cover` inside a relative container
- All colors via tokens only — never hardcoded hex
- Keep all existing form logic (state, handlers, validation) — only change JSX/styling
- `react-hot-toast` stays — no sonner
- Tabler icons for prefix icons (IconMail, IconLock, IconEye, IconEyeOff)
- SVG logos for Google/GitHub social buttons
- TypeScript strict — no `any`
- Every change stays within the 3 files listed above
