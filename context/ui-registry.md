# UI Registry

Living record of every UI component and the pattern it establishes. Updated after every feature via `/imprint`. Read before building any new component to avoid duplicating an existing pattern.

---

## Existing Components (from current codebase — do not duplicate)

| Component | Path | Pattern it establishes |
| --- | --- | --- |
| `Sidebar` | `components/Sidebar.tsx` | Left nav shell, `bg-inverse-surface` (#2D303D), active route via `usePathname()` with `bg-primary-container/20` pill |
| `Navbar` | `components/Navbar.tsx` | Top bar inside content area, `bg-surface` (light), `border-outline-variant` bottom border, greeting text |
| `DashboardContent` | `components/DashboardContent.tsx` | Dashboard page: `bg-surface` content area, white cards (`bg-surface-container-lowest`), uniform `bg-primary-container/10` icon circles |
| `HomeCard` | `components/HomeCard.tsx` | Quick-action card (icon + label + click handler) |
| `MeetingTypeLists` | `components/MeetingTypeLists.tsx` | Renders the four Quick Action `HomeCard`s |
| `MeetingModel` | `components/MeetingModel.tsx` | Modal for New/Join/Schedule meeting flows |
| `MeetingSetup` | `components/MeetingSetup.tsx` | Pre-call device/mic setup screen |
| `MeetingRoom` | `components/MeetingRoom.tsx` | In-call layout, controls, participant list |
| `EndCallButton` | `components/EndCallButton.tsx` | Leave/end call control |
| `PersonalRoomPage`, `PreviousPage`, `RecordingPage`, `UpcomingPage` | `components/*.tsx` | Existing list-style pages |
| `Loader`, `ui/loader.tsx` (`LoaderOne`) | — | Loading states |
| `ui/stateful-button.tsx` | — | Primary button with async pending state — reuse for all AI action buttons |
| `ui/dropdown-menu.tsx`, `ui/popover.tsx` | Radix wrappers | Reuse for layout/audio-type/category dropdowns |
| `ui/animated-modal.tsx` | — | Modal shell used by `MeetingModel` — reuse for new modals |
| `ui/sidebar.tsx` | `components/ui/sidebar.tsx` | Aceternity sidebar primitives: `DesktopSidebar`, `MobileSidebar`, `SidebarLink` with active route detection |
| `ui/card-hover-effect.tsx` | `components/ui/card-hover-effect.tsx` | Card grid with hover animation, `bg-surface-container-lowest`, `border-outline-variant` |
| `ui/flip-words.tsx`, `ui/typewriter-effect.tsx`, `ui/container-text-flip.tsx` | — | Decorative text animation, marketing/empty-state use only |
| `ui/3d-card.tsx`, `ui/wobble-card.tsx`, `ui/background-lines.tsx`, `ui/lamp.tsx` | — | Landing/decorative components, not for data-dense screens |
| `ui/placeholders-and-vanish-input.tsx` | — | Animated input, used for Join Meeting code field |
| `ui/sonner.tsx` | — | **Deprecated** — migrate toasts to `react-hot-toast`, remove usage as encountered |
| `LandingNav` | `components/landing/LandingNav.tsx` | Fixed dark nav: `bg-inverse-surface`, `text-inverse-on-surface/70` links, `bg-primary-container` CTA, `IconWorld` logo |
| `LandingHero` | `components/landing/LandingHero.tsx` | Dark hero: gradient text `from-primary-container to-primary`, browser-chrome dashboard mockup with abstract content |
| `FeatureGrid` | `components/landing/FeatureGrid.tsx` | 3-column glass-cards: `bg-inverse-on-surface/5 border-inverse-on-surface/10`, `bg-primary-container/10` icon circles |
| `SocialProof` | `components/landing/SocialProof.tsx` | 4 testimonial cards with purple avatar circles, `bg-inverse-on-surface/5` glass-card pattern |
| `AiArchitecture` | `components/landing/AiArchitecture.tsx` | Split layout: check items left, stat card right with progress bar |
| `EnterpriseGrid` | `components/landing/EnterpriseGrid.tsx` | 3×2 grid, icon + title + description per item |
| `MeetingHistory` | `components/landing/MeetingHistory.tsx` | Split layout: feature bullets left, light-themed browser mockup right (uses `surface-container-lowest`) |
| `LandingCTA` | `components/landing/LandingCTA.tsx` | Dark CTA: `bg-primary-container` button, decorative glow (opacity only, NO blur) |
| `LandingFooter` | `components/landing/LandingFooter.tsx` | 5-col grid: logo+desc+social (col-span-2), 3 link columns, bottom copyright row |
| `AuthLayout` | `components/auth/AuthLayout.tsx` | Split-screen: form LEFT 40% (`bg-surface-container-lowest`) + testimonial RIGHT 60% (`bg-inverse-surface`), decorative blurs, grid overlay |
| `SignInForm` | `components/auth/SignInForm.tsx` | Auth form: logo, heading, OAuth buttons, divider, email/password fields, submit, footer link. `useAuth()` redirect |
| `SignUpForm` | `components/auth/SignUpForm.tsx` | Auth form: logo, heading, OAuth buttons, divider, full-name/email/password/confirm/terms, submit. `useAuth()` redirect |
| `VerifyEmailForm` | `components/auth/VerifyEmailForm.tsx` | Auth form: logo, heading, code input (mono font, letter-spaced), verify button, resend link, back-to-sign-in link. Handles `attemptEmailAddressVerification` + `setActive` |

---

## Landing Page Patterns (shared across all landing components)

| Pattern | Classes | Used by |
| --- | --- | --- |
| Dark section background | `bg-inverse-surface` | All 9 components |
| Glass card (dark) | `bg-inverse-on-surface/5 border border-inverse-on-surface/10 rounded-xl` | FeatureGrid, SocialProof, AiArchitecture, EnterpriseGrid |
| Icon circle (purple) | `bg-primary-container/10 border border-primary-container/20 rounded-lg` | FeatureGrid |
| Avatar circle (purple) | `bg-primary-container/20 rounded-full` | SocialProof |
| Section separator | `border-t border-inverse-on-surface/10` | SocialProof, AiArchitecture, EnterpriseGrid, MeetingHistory, LandingCTA, LandingFooter |
| Decorative glow (NO blur) | `bg-primary-container/10 or /15 rounded-full` — opacity only | LandingHero, AiArchitecture, LandingCTA |
| CTA primary button | `bg-primary-container text-inverse-on-surface rounded-xl` hover:`bg-primary` | LandingNav, LandingHero, LandingCTA |
| Text — primary | `text-inverse-on-surface` | All headings |
| Text — secondary | `text-inverse-on-surface/70` | All body/description text |
| Traffic light dots | `bg-error/80`, `bg-yellow-500/80`, `bg-green-500/80` | LandingHero, MeetingHistory |
| Section spacing | `py-24` (standard), `py-32` (CTA) | All sections |

**Critical rule:** NO `blur-*`, `backdrop-blur-*`, or `backdrop-filter` on any background/parent element. Decorative glows use opacity only.

---

## Landing Component Details

### LandingNav

File: `components/landing/LandingNav.tsx`
Last updated: 2026-08-10

| Property | Class |
| --- | --- |
| Background | `bg-inverse-surface` (solid, no opacity/blur) |
| Border | `border-b border-inverse-on-surface/5` |
| Border radius | none (fixed bar) |
| Text — logo | `text-inverse-on-surface font-bold text-lg tracking-tight` |
| Text — nav links | `text-inverse-on-surface/70` hover:`text-inverse-on-surface` `text-sm font-medium` |
| Text — sign in | `text-inverse-on-surface/70` hover:`text-inverse-on-surface` `text-sm font-medium` |
| CTA button | `bg-primary-container text-inverse-on-surface rounded-xl px-5 py-2.5 text-sm font-medium` hover:`bg-primary` |
| Spacing | `px-6 py-4` nav bar, `gap-8` between nav links, `gap-4` between sign-in + CTA |
| Mobile menu | `bg-inverse-surface border-t border-inverse-on-surface/5`, `px-6 py-4 flex flex-col gap-4` |
| Shadow | none |

**Pattern notes:**
- Fixed position: `fixed top-0 left-0 right-0 z-50`
- NO `backdrop-blur` or opacity on the nav background — solid `bg-inverse-surface` only
- Logo uses `IconWorld` from Tabler with `text-primary-container`

---

### LandingHero

File: `components/landing/LandingHero.tsx`
Last updated: 2026-08-10

| Property | Class |
| --- | --- |
| Background | `bg-inverse-surface` |
| Border | none on section; `border border-inverse-on-surface/10` on mockup |
| Border radius | `rounded-xl` on CTAs, `rounded-xl p-2` on mockup wrapper |
| Text — headline | `text-5xl md:text-6xl lg:text-7xl font-bold text-inverse-on-surface` |
| Text — gradient | `bg-gradient-to-r from-primary-container to-primary bg-clip-text text-transparent` |
| Text — subtitle | `text-inverse-on-surface/70 text-lg md:text-xl` |
| CTA primary | `bg-primary-container text-inverse-on-surface rounded-xl px-8 py-3.5 font-medium text-base` hover:`bg-primary` |
| CTA secondary | `border border-inverse-on-surface/20 text-inverse-on-surface rounded-xl px-8 py-3.5 font-medium text-base` hover:`bg-inverse-on-surface/5 hover:border-inverse-on-surface/40` |
| Decorative glow | `bg-primary-container/15 rounded-full` — opacity only, NO blur |
| Spacing | `pt-32 pb-24` section, `mb-6` headline, `mb-10` subtitle, `mt-20` mockup |
| Shadow | none |
| Accent usage | `from-primary-container to-primary` gradient on headline span |

**Pattern notes:**
- `overflow-hidden` on section clips the decorative glow
- Mockup uses `bg-inverse-surface/80` wrapper, `bg-inverse-surface/50` content area
- Dashboard mockup is abstract divs, not a real screenshot
- NO `blur-*` or `backdrop-blur-*` anywhere in this component

---

### FeatureGrid

File: `components/landing/FeatureGrid.tsx`
Last updated: 2026-08-10

| Property | Class |
| --- | --- |
| Background (section) | `bg-inverse-surface` |
| Background (card) | `bg-inverse-on-surface/5` |
| Border (card) | `border border-inverse-on-surface/10` |
| Border radius | `rounded-xl` card, `rounded-lg` icon container |
| Text — heading | `text-inverse-on-surface font-semibold text-lg` |
| Text — description | `text-inverse-on-surface/70 text-sm leading-relaxed` |
| Text — section title | `text-3xl md:text-4xl font-bold text-inverse-on-surface` |
| Text — section subtitle | `text-inverse-on-surface/70 text-base` |
| Icon circle | `w-12 h-12 rounded-lg bg-primary-container/10 flex items-center justify-center border border-primary-container/20` |
| Icon color | `text-primary-container` |
| Spacing | `py-24` section, `p-8` card, `mb-6` icon-to-heading, `mb-3` heading-to-desc, `gap-6` grid |
| Hover state | `hover:-translate-y-1 transition-transform duration-300` |
| Shadow | none |
| Accent usage | `bg-primary-container/10` icon circles, `border-primary-container/20` icon borders |

**Pattern notes:**
- 3-column grid: `grid grid-cols-1 md:grid-cols-3 gap-6`
- Glass-card pattern: `bg-inverse-on-surface/5 border border-inverse-on-surface/10` — reuse for all landing dark-theme cards
- `id="features"` on section for nav anchor link

---

### SocialProof

File: `components/landing/SocialProof.tsx`
Last updated: 2026-08-10

| Property | Class |
| --- | --- |
| Background (section) | `bg-inverse-surface` |
| Background (card) | `bg-inverse-on-surface/5` |
| Border (card) | `border border-inverse-on-surface/10` |
| Border radius | `rounded-xl` card, `rounded-full` avatar |
| Text — quote | `text-inverse-on-surface/70 text-sm leading-relaxed` |
| Text — name | `text-inverse-on-surface text-sm font-semibold` |
| Text — role | `text-inverse-on-surface/70 text-xs` |
| Text — section title | `text-3xl md:text-4xl font-bold text-inverse-on-surface` |
| Avatar circle | `w-10 h-10 rounded-full bg-primary-container/20` |
| Spacing | `py-24` section, `p-6` card, `mb-6` quote-to-avatar, `gap-3` avatar-to-text, `gap-6` grid |
| Hover state | none |
| Shadow | none |

**Pattern notes:**
- 4-column grid: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6`
- Uses same glass-card pattern as FeatureGrid
- Quote uses `&ldquo;` and `&rdquo;` HTML entities for curly quotes

---

### AiArchitecture

File: `components/landing/AiArchitecture.tsx`
Last updated: 2026-08-10

| Property | Class |
| --- | --- |
| Background (section) | `bg-inverse-surface` |
| Background (stat card) | `bg-inverse-on-surface/5` |
| Border (stat card) | `border border-inverse-on-surface/10` |
| Border radius | `rounded-xl` stat card, `rounded-full` decorative glow, `rounded-full` progress bar |
| Text — heading | `text-3xl md:text-4xl font-bold text-inverse-on-surface` |
| Text — body | `text-inverse-on-surface/70 text-lg leading-relaxed` |
| Text — stat number | `text-6xl font-bold text-inverse-on-surface` |
| Text — stat label | `text-inverse-on-surface/70 text-sm` |
| Text — check items | `text-inverse-on-surface/70 text-sm` |
| Check icon | `IconCheck` size=20 `text-primary-container` |
| Decorative glow | `bg-primary-container/15 rounded-full` — opacity only, NO blur |
| Progress bar track | `bg-inverse-surface rounded-full` |
| Progress bar fill | `bg-primary-container w-[75%] rounded-full` |
| Spacing | `py-24` section, `p-8` stat card, `gap-12` split layout, `space-y-4` check list |
| Shadow | none |

**Pattern notes:**
- Split layout: `flex flex-col lg:flex-row items-center gap-12`
- Stat card has `relative overflow-hidden` to clip decorative glow
- Decorative glow positioned `absolute top-0 right-0`
- NO blur on decorative elements

---

### EnterpriseGrid

File: `components/landing/EnterpriseGrid.tsx`
Last updated: 2026-08-10

| Property | Class |
| --- | --- |
| Background (section) | `bg-inverse-surface` |
| Background (item) | `bg-inverse-on-surface/5` |
| Border (item) | `border border-inverse-on-surface/10` |
| Border radius | `rounded-xl` item card |
| Text — heading | `text-inverse-on-surface font-semibold text-base` |
| Text — description | `text-inverse-on-surface/70 text-sm` |
| Text — section title | `text-3xl md:text-4xl font-bold text-inverse-on-surface` |
| Text — section subtitle | `text-inverse-on-surface/70 text-base` |
| Icon | `text-primary-container` size=24 stroke=1.5 |
| Spacing | `py-24` section, `p-6` item, `mb-16` section heading, `gap-6` grid, `gap-4` icon-to-text |
| Hover state | none |
| Shadow | none |

**Pattern notes:**
- 3-column grid: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6`
- Uses same glass-card pattern as FeatureGrid/SocialProof
- Items are `flex items-start gap-4` (icon left, text right) — not centered

---

### MeetingHistory

File: `components/landing/MeetingHistory.tsx`
Last updated: 2026-08-10

| Property | Class |
| --- | --- |
| Background (section) | `bg-inverse-surface` |
| Background (browser wrapper) | `bg-inverse-on-surface/80` |
| Background (browser chrome) | `bg-inverse-surface` |
| Background (content area) | `bg-surface-container-lowest` (light theme) |
| Border (browser wrapper) | `border border-inverse-on-surface/10` |
| Border (content area) | `border border-outline-variant` |
| Border radius | `rounded-xl` browser wrapper, `rounded-t-lg` chrome, `rounded-b-lg` content, `rounded-lg` rows |
| Text — heading | `text-inverse-on-surface font-bold text-3xl` (section), `text-xl font-bold text-on-surface` (mockup) |
| Text — body | `text-inverse-on-surface/70 text-lg` (section), `text-on-surface` (mockup rows) |
| Text — bullet title | `text-inverse-on-surface font-semibold` with `Icon` prefix |
| Text — bullet desc | `text-inverse-on-surface/70 text-sm` |
| Traffic light dots | `bg-error/80`, `bg-yellow-500/80`, `bg-green-500/80` |
| Category badge (mockup) | `bg-primary-container/20 text-primary-container`, `bg-blue-100 text-blue-600`, `bg-orange-100 text-orange-600` |
| Spacing | `py-24` section, `p-6` mockup content, `gap-16` split layout, `space-y-6` bullet list, `space-y-4` rows |
| Hover state | `hover:bg-surface-container-low` on mockup rows |
| Shadow | `shadow-lg` on content area |
| Accent usage | `text-primary-container` for "Open Insights" action text |

**Pattern notes:**
- Split layout reversed on mobile: `flex flex-col-reverse lg:flex-row`
- Mockup uses light theme tokens (`bg-surface-container-lowest`, `text-on-surface`, `border-outline-variant`) inside dark landing page
- This is the ONLY landing component that uses light-theme tokens — for the mockup only
- `IconSearch` used for both search bar and row icons (multipurpose)

---

### LandingCTA

File: `components/landing/LandingCTA.tsx`
Last updated: 2026-08-10

| Property | Class |
| --- | --- |
| Background (section) | `bg-inverse-surface` |
| Border | `border-t border-inverse-on-surface/10` |
| Border radius | `rounded-xl` button |
| Text — heading | `text-4xl md:text-5xl font-bold text-inverse-on-surface` |
| Text — body | `text-inverse-on-surface/70 text-lg` |
| CTA button | `bg-primary-container text-inverse-on-surface rounded-xl px-10 py-4 font-bold text-lg` hover:`bg-primary` |
| Decorative glow | `bg-primary-container/10 rounded-full` — opacity only, NO blur |
| Spacing | `py-32` section, `mb-6` heading, `mb-10` body, `max-w-4xl mx-auto px-6` container |
| Shadow | none |

**Pattern notes:**
- `text-center` section alignment
- `overflow-hidden` clips decorative glow
- Decorative glow: `absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px]`
- NO blur on decorative elements

---

### LandingFooter

File: `components/landing/LandingFooter.tsx`
Last updated: 2026-08-10

| Property | Class |
| --- | --- |
| Background | `bg-inverse-surface` |
| Border | `border-t border-inverse-on-surface/10` (section + bottom row) |
| Border radius | none |
| Text — logo | `text-inverse-on-surface font-bold text-lg tracking-tight` |
| Text — description | `text-inverse-on-surface/70 text-sm` |
| Text — column heading | `text-inverse-on-surface text-sm font-semibold` |
| Text — links | `text-inverse-on-surface/70` hover:`text-inverse-on-surface` `text-sm` |
| Text — copyright | `text-inverse-on-surface/70 text-sm` |
| Social icons | `text-inverse-on-surface/70` hover:`text-inverse-on-surface` size=18 |
| Spacing | `pt-20 pb-10` section, `gap-8` grid, `mb-16` grid-to-bottom, `mb-6` logo-to-desc, `gap-4` social icons, `space-y-3` link list, `pt-8` bottom row |
| Shadow | none |

**Pattern notes:**
- 5-column grid: `grid grid-cols-2 md:grid-cols-5 gap-8`
- Logo+description spans 2 columns: `col-span-2`
- Bottom row: `flex flex-col md:flex-row justify-between items-center`
- Social icons use Tabler brand icons: `IconBrandTwitter`, `IconBrandLinkedin`, `IconBrandGithub`

---

### AuthLayout

File: `components/auth/AuthLayout.tsx`
Last updated: 2026-08-10

| Property | Class |
| --- | --- |
| Background (form panel) | `bg-surface-container-lowest` |
| Background (testimonial panel) | `bg-inverse-surface` |
| Border | none on panels; `border-outline-variant/30` on avatar |
| Border radius | `rounded-full` avatar, `rounded-full` decorative blurs |
| Layout | `flex h-full w-full flex-col md:flex-row` — stacks mobile, side-by-side desktop |
| Panel widths | Form: `md:w-[40%]` (`flex-1 md:flex-none`), Testimonial: `md:w-[60%]` |
| Testimonial panel | `hidden md:flex` — hidden on mobile |
| Form panel content | `mx-auto w-full max-w-[400px]` |
| Quote text | `text-on-primary leading-tight font-semibold text-2xl md:text-3xl` |
| Quote icon | `h-12 w-12 text-on-primary opacity-40` |
| Attribution name | `text-on-primary font-semibold` |
| Attribution role | `text-secondary-fixed-dim text-sm` |
| Avatar | `h-12 w-12 rounded-full overflow-hidden border border-outline-variant/30 bg-surface-variant/10` |
| Decorative blurs | `bg-primary-container/20 rounded-full mix-blend-screen blur-[100px]` + `bg-secondary/20 rounded-full mix-blend-screen blur-[120px]` |
| Grid overlay | `radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)` at `24px 24px` |
| Panel shadow | `shadow-[4px_0_24px_rgba(0,0,0,0.02)]` on form panel |
| Spacing | `px-6 py-8 sm:px-10 md:px-10 md:py-8` form panel, `p-8 lg:p-10` testimonial |

**Pattern notes:**
- Requires `h-screen` on parent wrapper (`#root` in layout.tsx) — `h-full` on flex container resolves to parent height
- Mobile: form panel only (testimonial hidden). Desktop: side-by-side
- Decorative blurs on testimonial panel use `mix-blend-screen` + opacity, NOT `backdrop-blur`
- Content max-width `400px` centers form within the 40% panel

---

### SignInForm

File: `components/auth/SignInForm.tsx`
Last updated: 2026-08-10

| Property | Class |
| --- | --- |
| Logo | `text-xl font-black text-primary-container tracking-tight` |
| Heading | `text-3xl font-bold text-on-surface mb-2` |
| Subtitle | `text-on-surface-variant text-base` |
| OAuth button | `w-full flex items-center justify-center gap-3 bg-surface-container-lowest border border-surface-variant rounded-lg py-2.5 px-4` hover:`bg-surface-container-low` `transition-colors group disabled:opacity-50` |
| OAuth text | `text-sm font-semibold text-on-surface group-hover:text-primary transition-colors` |
| OAuth icon | `h-5 w-5` (Google SVG), `h-5 w-5 fill-on-surface` (GitHub SVG) |
| Divider | `border-t border-surface-variant`, label: `bg-surface-container-lowest px-2 text-xs text-outline uppercase tracking-wider` |
| Form label | `block text-xs text-on-surface mb-1.5 uppercase tracking-wider` |
| Input | `w-full bg-surface-container-lowest border border-surface-variant rounded-lg px-4 py-2.5 text-on-surface placeholder:text-outline-variant focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-container text-sm transition-shadow` |
| Password lock icon | `IconLock size={18} absolute left-3 top-1/2 -translate-y-1/2 text-outline` |
| Password toggle | `text-outline hover:text-primary transition-colors focus:outline-none` |
| Submit button | `flex w-full justify-center rounded-lg bg-primary-container px-3 py-2.5 text-sm font-semibold text-on-primary shadow-sm hover:bg-primary transition-colors disabled:opacity-50` |
| Footer link | `text-primary-container hover:text-primary transition-colors` |
| Forgot password link | `text-xs text-primary-container hover:text-primary transition-colors` |
| Spacing | `mb-8` logo, `mb-6` header, `space-y-3 mb-6` OAuth, `mb-6` divider, `space-y-4` form, `pt-1` submit, `mt-6` footer |

**Pattern notes:**
- Auth redirect: `useAuth()` + `useEffect` pushes to `/dashboard` if `isSignedIn`
- Form spacing: `space-y-4` between fields
- Loading state: `disabled:opacity-50` on buttons, text changes to "Please wait..."
- Toast: `react-hot-toast` only, positioned bottom-right

---

### SignUpForm

File: `components/auth/SignUpForm.tsx`
Last updated: 2026-08-10

| Property | Class |
| --- | --- |
| Logo | `text-xl font-black text-primary-container tracking-tight` |
| Heading | `text-3xl font-bold text-on-surface mb-2` |
| Subtitle | `text-on-surface-variant text-base` |
| OAuth button | `w-full flex items-center justify-center gap-3 bg-surface-container-lowest border border-surface-variant rounded-lg py-2.5 px-4` hover:`bg-surface-container-low` `transition-colors group disabled:opacity-50` |
| OAuth text | `text-sm font-semibold text-on-surface group-hover:text-primary transition-colors` |
| Divider | `border-t border-surface-variant`, label: `bg-surface-container-lowest px-2 text-xs text-outline uppercase tracking-wider` |
| Form label | `block text-xs text-on-surface mb-1.5 uppercase tracking-wider` |
| Input | `w-full bg-surface-container-lowest border border-surface-variant rounded-lg px-4 py-2.5 text-on-surface placeholder:text-outline-variant focus:outline-none focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 text-sm transition-all duration-200` |
| Password toggle | `text-outline hover:text-primary transition-colors` |
| Checkbox | `mt-1 h-4 w-4 rounded border-surface-variant text-primary-container focus:ring-primary-container` |
| Terms links | `text-primary-container hover:underline cursor-pointer` |
| Submit button | `w-full bg-primary-container text-on-primary rounded-lg py-2.5 text-base font-semibold mt-2 flex justify-center items-center gap-2 hover:bg-primary hover:shadow-[0_4px_14px_rgba(131,14,249,0.25)] transition-all duration-200 transform hover:scale-[1.01] active:scale-95 disabled:opacity-50` |
| Submit arrow icon | `h-5 w-5` SVG arrow-right |
| Footer link | `text-primary-container hover:underline underline-offset-4 transition-all` |
| Spacing | `mb-8` logo, `mb-6` header, `space-y-3 mb-6` OAuth, `mb-6` divider, `space-y-4` form, `pt-1` submit, `mt-6` footer |

**Pattern notes:**
- Same OAuth pattern as SignInForm — identical button classes
- Same divider pattern as SignInForm
- Same form label pattern as SignInForm
- Input focus differs slightly from SignIn: `focus:border-primary-container focus:ring-primary-container/20` vs SignIn's `focus:ring-inset focus:ring-primary-container` — prefer SignUp's pattern for new inputs (more visible focus state)
- Submit button has subtle micro-interactions: `hover:scale-[1.01] active:scale-95` + shadow on hover
- Auth redirect: same `useAuth()` pattern as SignInForm
- Form fields: Full Name, Email, Password, Confirm Password, Terms checkbox

---

### Auth Patterns (shared across SignIn/SignUp)

| Pattern | Classes | Used by |
| --- | --- | --- |
| Logo | `text-xl font-black text-primary-container tracking-tight` | SignIn, SignUp |
| Heading | `text-3xl font-bold text-on-surface mb-2` | SignIn, SignUp |
| Subtitle | `text-on-surface-variant text-base` | SignIn, SignUp |
| OAuth button | `bg-surface-container-lowest border border-surface-variant rounded-lg py-2.5 px-4 hover:bg-surface-container-low transition-colors` | SignIn, SignUp |
| OAuth text | `text-sm font-semibold text-on-surface group-hover:text-primary transition-colors` | SignIn, SignUp |
| Divider line | `border-t border-surface-variant` | SignIn, SignUp |
| Divider label | `bg-surface-container-lowest px-2 text-xs text-outline uppercase tracking-wider` | SignIn, SignUp |
| Form label | `block text-xs text-on-surface mb-1.5 uppercase tracking-wider` | SignIn, SignUp |
| Input (recommended) | `bg-surface-container-lowest border border-surface-variant rounded-lg px-4 py-2.5 text-on-surface placeholder:text-outline-variant focus:outline-none focus:border-primary-container focus:ring-2 focus:ring-primary-container/20 text-sm transition-all duration-200` | SignUp (use this for new inputs) |
| Password toggle | `text-outline hover:text-primary transition-colors` | SignIn, SignUp |
| Primary CTA | `bg-primary-container text-on-primary rounded-lg py-2.5` | SignIn, SignUp |
| Footer link | `text-primary-container` | SignIn, SignUp |
| Auth redirect | `useAuth()` + `useEffect(() => { if (isSignedIn) router.push("/dashboard") }, [isSignedIn, router])` | SignIn, SignUp |
| Form spacing | `space-y-4` | SignIn, SignUp |
| Section spacing | `mb-6` between sections, `mb-8` after logo, `mt-6` for footer | SignIn, SignUp |

**Critical rule:** All auth forms must include the `useAuth()` redirect check. Authenticated users must never see sign-in or sign-up forms.

---

## Token System (Step 3.5 — locked)

Tailwind tokens in `tailwind.config.ts` under `theme.extend.colors`:
- **Primary**: `primary` (#6500C4), `primary-container` (#830EF9), `on-primary` (#FFFFFF), `on-primary-container` (#E9D5FF)
- **Secondary**: `secondary` (#525B8E), `secondary-container` (#BBC3FD), `on-secondary-container` (#464F81)
- **Surface**: `surface` (#FAF8FF), `surface-container-lowest` (#FFFFFF), `surface-container-low` (#F3F2FF), etc.
- **Text**: `on-surface` (#181B27), `on-surface-variant` (#4C4356)
- **Inverse (dark shell)**: `inverse-surface` (#2D303D), `inverse-on-surface` (#EFF0FF), `inverse-primary` (#D7BAFF)
- **Outline**: `outline` (#7D7388), `outline-variant` (#CEC2D9)
- **Error**: `error` (#BA1A1A), `error-container` (#FFDAD6)
- **Kept**: `green-1` (#00C48C) for small visual indicators only

Fonts: **Hanken Grotesk** (UI, `--font-hanken-grotesk`) + **JetBrains Mono** (mono labels, `--font-jetbrains-mono`) via `next/font/google`

---

## New Components — Meeting Intelligence (to be built)

| Component | Path | Pattern |
| --- | --- | --- |
| `MeetingList` | `components/meeting-intelligence/MeetingList.tsx` | Light card, row-per-meeting, "Open Insights" action — new light-card pattern per ui-rules.md |
| `MeetingTabs` | `components/meeting-intelligence/MeetingTabs.tsx` | Horizontal tab bar: Overview/Summary/Action Items/Recording/Category/AI Chat |
| `SummaryTab` | `components/meeting-intelligence/SummaryTab.tsx` | AI summary text + key-outcomes stat cards |
| `ActionItemsTab` | `components/meeting-intelligence/ActionItemsTab.tsx` | Checklist rows (title, assignee, due date) + decisions list |
| `RecordingTab` | `components/meeting-intelligence/RecordingTab.tsx` | Video player (Stream recording URL) + download button |
| `CategoryTab` | `components/meeting-intelligence/CategoryTab.tsx` | Category badge + detected-topics badges + change-category dropdown |
| `AiChatTab` | `components/meeting-intelligence/AiChatTab.tsx` | Wraps shared `ChatPanel`, scoped to `meetingId` |

## New Components — AI Chat / Follow-ups (to be built)

| Component | Path | Pattern |
| --- | --- | --- |
| `ChatPanel` | `components/ai-chat/ChatPanel.tsx` | Shared streaming chat UI (AI SDK `useChat`) — used by `AiChatTab` and general `/ai-chat` page |
| `FollowUpList` | `components/follow-ups/FollowUpList.tsx` | Filterable list (All/Due Soon/Needs Attention/Completed) |
| `FollowUpDetails` | `components/follow-ups/FollowUpDetails.tsx` | Detail panel: task, assignee, due date, status, related meeting, notes, mark-complete |

---

## Registry Update Rule

Every new component gets a row here immediately after creation, with the pattern it establishes so the next session reuses it instead of inventing a variant. Run `/imprint` after any new UI component or page.
