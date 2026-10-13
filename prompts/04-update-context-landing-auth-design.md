# Prompt 04: Update Context Files for Landing + Auth Design

**Date:** 2026-08-09
**Status:** Pending approval
**Source:** Stitch-generated design files for NeuraMeet landing page, sign-in page, sign-up page

## Design Files Inspected

- `context/design/neurameet_full_landing_page.png`
- `context/design/sign_in.png`
- `context/design/sign_up.png`

## Token Drift Analysis

### Color Palette

| Element | Locked Token | Stitch Used | Verdict |
|---|---|---|---|
| Auth buttons (Sign In, Sign Up, Create Account) | `purple-1` (#830EF9) | Dark purple | OK |
| Page backgrounds | `dark-2` (#161925) / `dark-1` (#1C1F2E) | Dark shell | OK |
| Card borders (landing feature cards) | `border-sky-2` | Light border on dark bg | OK (variant acceptable for hero context) |
| **Hero CTA buttons** ("Get Started Free", "Watch Demo", "Start a Meeting") | `purple-1` is the only accent | **Bright green/teal (~#00C48C)** | DRIFT — new accent color |
| **"500+ Teams" badge** | No green token exists | Green badge bg | DRIFT — part of green accent system |
| Auth form input borders | `border-sky-2` | Light gray | OK |
| Landing hero text | `text-white` | White | OK |
| Nav links | `text-sky-1` / white | Light/white | OK |
| Testimonial avatar backgrounds | No avatar token | Purple circle bg (purple-1) | OK — uses existing token |
| **Auth split-screen right panel** | `dark-1`/`dark-3` surface | **White/light background** | Surface drift — right panel of auth uses light bg |

### Font

| Element | Locked Token | Stitch Used | Verdict |
|---|---|---|---|
| All text | `SUSE Mono` only | **Sans-serif (appears to be Inter or system font)** | DRIFT — design uses a different typeface |

### New Patterns Identified

1. **Split-screen layout** — two-panel layout: hero/branding panel (left) + content/form panel (right). Used by both sign-in and sign-up pages. Not documented in ui-rules.md.
2. **Dark-card-on-dark-bg pattern** — feature cards on landing page use dark card bg with subtle border on dark section bg. Different from the light-card pattern documented for Meeting Intelligence.
3. **Green accent for CTAs** — landing page hero uses a green/teal primary CTA. This conflicts with the locked purple-only accent invariant.

### Drift Flags Summary

1. **🟢 Green accent color** — The landing page hero section and "Get Started" CTAs use a bright green/teal (~#00C48C) that does not exist in the locked palette. The ui-tokens.md invariant states: *"purple-1 (#830EF9) is the only accent — never introduce a second brand purple."* Extending this: no other accent color should be introduced without approval. **Decision needed:** Add `green-1: #00C48C` as a new token for CTA buttons, OR keep purple as the sole CTA accent and instruct the design to be updated.

2. **🟡 Font mismatch** — Design images show a sans-serif font (likely Inter or system font), not SUSE Mono. The ui-tokens.md invariant states: *"Font stays SUSE Mono throughout — never add a second font family."* **Decision needed:** Accept sans-serif as the font for landing/auth marketing pages (since SUSE Mono is a monospace font that may look out of place on marketing copy), OR keep SUSE Mono everywhere per the invariant.

3. **🟡 Auth right panel uses white bg** — The sign-in/sign-up right panels (form area) use a white/light background, while the locked palette's `surface` token is white. This is technically valid (`bg-surface` = `#FFFFFF`), but the existing dark shell pattern would suggest `dark-3` or `dark-1` for the form panel. **Decision needed:** Accept white form panel as the intended split-screen design, or switch to dark form panel to match the shell.

## Edits Required

### 1. `context/ui-registry.md` — Add Landing Page and Auth Page Components

**After the "New Components — AI Chat / Follow-ups (to be built)" section, add:**

```markdown
## New Components — Landing Page (to be built)

| Component | Path | Pattern |
| --- | --- | --- |
| `LandingNav` | `components/landing/LandingNav.tsx` | Top nav: dark bg, logo left, links center, "Get Started" CTA right — mobile hamburger menu |
| `LandingHero` | `components/landing/LandingHero.tsx` | Split-screen hero: left dark panel with purple gradient bg + headline + CTA buttons, right dark panel with product screenshots/mockups. Uses dark-card-on-dark-bg variant |
| `FeatureGrid` | `components/landing/FeatureGrid.tsx` | 3-column grid of dark cards with icons, title, description. Section: dark bg, heading centered |
| `SocialProof` | `components/landing/SocialProof.tsx` | Trust metrics badge ("500+ Teams") + partner logos strip |
| `TestimonialStrip` | `components/landing/TestimonialStrip.tsx` | 3-card horizontal strip of testimonial cards (avatar, name, role, quote) on dark bg |
| `LandingCTA` | `components/landing/LandingCTA.tsx` | Bottom CTA section: dark bg, heading + two buttons ("Get Started Free", "Start a Meeting") |
| `LandingFooter` | `components/landing/LandingFooter.tsx` | Dark bg footer: logo, link columns, social icons, copyright |

## New Components — Auth Pages (to be built)

| Component | Path | Pattern |
| --- | --- | --- |
| `AuthLayout` | `components/auth/AuthLayout.tsx` | Split-screen layout pattern: left hero panel (dark bg, purple gradient, branding text, social login icons) + right form panel (light/white bg, form fields). **New layout pattern — document in ui-rules.md** |
| `SignInForm` | `components/auth/SignInForm.tsx` | Sign-in form: email field, "Send Code" (green CTA), "Continue with Password" link, "Or Sign In with SSO" divider, "Forgot Password?" link, "Sign up" footer link |
| `SignUpForm` | `components/auth/SignUpForm.tsx` | Sign-up form: name field, email field, "Send Code" (green CTA), "Continue with Password" link, "Or Sign In with SSO" divider, terms checkbox, "Create Account" (purple CTA) button, "Sign in" footer link |
```

### 2. `context/ui-rules.md` — Add Split-Screen Layout Pattern

**After the "Sidebar Navigation" section, add a new section:**

```markdown
## Split-Screen Layout (Auth Pages)

Two-panel layout used by sign-in and sign-up pages:

- **Left panel (hero):** `bg-dark-1` or `bg-dark-2` with purple gradient overlay, contains NeuraMeet logo, heading text, subtitle, social login icons (Google, Microsoft, GitHub). Fixed height, full viewport height on desktop.
- **Right panel (form):** `bg-surface` (white) or `bg-dark-3` (dark — per final design decision), contains the auth form (email, password, buttons, links). Scrollable if content overflows.
- **Desktop:** Side-by-side, 50/50 split.
- **Mobile:** Stacked vertically, hero on top, form below.
- **Divider:** No visible divider between panels — clean edge.
- **Buttons in left panel:** Social login icons as circular buttons with dark bg + white icon.
- **Input fields:** Full-width, rounded corners (`rounded-lg`), subtle border (`border border-sky-2`), padding `px-4 py-3`, placeholder text `text-sky-1`.
- **Primary CTA in form:** `bg-green-1 text-white rounded-xl px-4 py-2 font-medium` (for "Send Code" / "Get Started Free"). See ui-tokens.md for `green-1` token.
- **Secondary CTA in form:** `bg-purple-1 text-white rounded-xl px-4 py-2 font-medium` (for "Create Account" / "Sign In").
- **Links:** `text-blue-1 hover:underline` for "Forgot Password?", "Sign up", "Sign in" links.
```

**Also update the "Buttons" section to add:**

```markdown
**Green CTA (landing page hero, auth "Send Code"):**
```
background: bg-green-1
color: white
border-radius: rounded-xl
padding: px-4 py-2
font-weight: font-medium
```
```

### 3. `context/ui-tokens.md` — Add Green Token (if approved)

**In the `tailwind.config.ts` token additions, add after `yellow`:**

```typescript
green: { 1: "#00C48C" },  // CTA accent for landing/auth hero buttons
```

**In the Color Usage Guide, add:**

```markdown
### Green CTA (Landing / Auth)
| Element                          | Token              |
| ---------------------------------- | ------------------- |
| Hero CTA buttons ("Get Started")  | `bg-green-1` `text-white` |
| "Send Code" button (auth forms)   | `bg-green-1` `text-white` |
| "500+ Teams" trust badge           | `bg-green-1/10` `text-green-1` |
```

**Add invariant:**

```markdown
- `green-1` (#00C48C) is used only for primary CTA on landing page and auth forms — never reuse for other status or feedback states
```

### 4. `context/progress-tracker.md` — Mark Design Phase Done

**Under "Done (existing codebase)", add after the last item:**

```markdown
- ✅ Landing page + auth page design review (Stitch output inspected, token drift flagged, context files updated)
```

**Update the "Next Action" to:**

```markdown
## Next Action

Implement landing page + auth pages per the approved design files. Start with `AuthLayout` (split-screen pattern) + `SignInForm` / `SignUpForm`, then `LandingNav` + `LandingHero` + remaining landing sections. Resolve drift flags (green accent, font, auth panel bg) before implementation.
```

## Drift Resolution — Decisions Needed

Before implementing, these three drift items need a decision from the user:

1. **Green accent (#00C48C):** Add as `green-1` token for CTAs, OR keep purple as sole CTA accent and update design to use purple?
2. **Font on landing/auth:** Accept sans-serif for marketing pages (pragmatic for readability), OR enforce SUSE Mono everywhere per invariant?
3. **Auth right panel bg:** Accept white (`bg-surface`) per design, OR switch to dark (`bg-dark-3`) to match shell?

**Recommendation:** Accept all three as-is (green token for CTAs, sans-serif for marketing, white auth panel) — they make sense in context. Landing/auth are marketing surfaces, not data-dense app screens, so slight design freedom is appropriate. Lock them in the tokens so future work doesn't drift further.

## Steps After Approval

1. Update `context/ui-tokens.md` — add `green-1` token, add green CTA usage guide, add invariant
2. Update `context/ui-rules.md` — add split-screen layout section, add green CTA button variant
3. Update `context/ui-registry.md` — add Landing Page and Auth Page component entries
4. Update `context/progress-tracker.md` — mark design review done, update next action
