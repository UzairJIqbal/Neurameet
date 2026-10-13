# UI Registry

Living record of every UI component and the pattern it establishes. Updated after every feature via `/imprint`. Read before building any new component to avoid duplicating an existing pattern.

---

## Existing Components (from current codebase — do not duplicate)

| Component | Path | Pattern it establishes |
| --- | --- | --- |
| `Sidebar` | `components/Sidebar.tsx` | Always-expanded 260px left nav (`bg-inverse-surface` #2D303D), brand + "AI Intelligence" subtitle, labeled nav with active route via `usePathname()` → `border-l-4 border-primary-container bg-on-secondary-fixed-variant text-on-primary` filled state; user profile + sign-out at bottom. Nav items come from `constants/index.tsx` `sidebarLinks` (icons are `<Image>` PNGs from `/icons/sidebar/*` with `invert brightness-0`): Dashboard, **Previous Meetings** (`/previous`), **Upcoming Meetings** (`/upcoming`), **Recordings** (`/recording`), **Personal Room** (`/personal-room`), then planned-but-unbuilt Meeting Intelligence/AI Chat/Follow-ups/Settings (these 404 until later steps). `Sidebar_Com` renders the fixed sidebar + `ml-0 flex min-h-full flex-col bg-surface lg:ml-[260px]` content area; **navbar clearance is owned solely by `HomeLayout`'s `<section className="...pt-16...">`** (set to the real ~60px navbar height so content starts flush below the navbar and the `flex-1` Join card centers in the true remaining space) — `Sidebar_Com` does NOT add its own top padding. `Sidebar_Com` is nested inside `HomeLayout`'s `flex-1` chain so `min-h-full` resolves to the real remaining height (no over-scroll). Home/Dashboard renders its own TopAppBar and no Navbar |
| `Navbar` | `components/Navbar.tsx` | `fixed top-0 z-50 left-0 w-full border-b border-outline-variant bg-surface px-6 py-3 lg:left-[260px] lg:w-[calc(100%-260px)] lg:px-10` top bar (~60px tall), greeting + `UserButton`; `top-0` keeps it flush at the viewport top (a fixed element without `top` inherits its static-flow position, which would be pushed down by `HomeLayout`'s top padding); rendered inside `Sidebar_Com` for non-dashboard pages |
| `DashboardContent` | `components/DashboardContent.tsx` | Dashboard page matched to `context/designs/dashboard.png`: `bg-surface` content area, sticky TopAppBar (dynamic greeting via Clerk `useUser()` first name + time-of-day, live "N meetings today / M follow-ups" counts, search input, "Ask NeuraMeet AI", notifications bell), Quick Actions ×5 (New/Join/Upload/Ask AI/Schedule Meeting) with `.card-shadow` cards. **Data is LIVE** — `useEffect` client fetch of `/api/meetings` + `/api/follow-ups` (user-scoped), shared `isLoading` + `<LoaderOne />` + empty states ("No meetings yet." + Upload CTA; "No follow-ups yet."). Both panels capped at latest **3** items; "View All" → `/meeting-intelligence` / `/follow-ups`. Meeting Intelligence rows: `FileText` icon chip + title + date (`startedAt ?? createdAt` → `toLocaleDateString()`, or "—") + "Open Insights" → `router.push("/meeting-intelligence/[id]")`. Meeting Follow-ups panel unified to the SAME 12-col row style (icon chip `ListChecks` + `actionTitle`/`meetingTitle` source + due-date meta + "Open" → `router.push("/follow-ups/[id]")`). All white cards (`bg-surface-container-lowest`) + `border-outline-variant`. |
| `HomeCard` | `components/HomeCard.tsx` | **DELETED** — orphaned quick-action card; removed in the A4/A5 dead-control cleanup (commit `1b4e867`, branch `fix/graceful-degradation-g1-g2`). Its only consumer `MeetingTypeLists` was also deleted; the Schedule Meeting entry now lives on the Dashboard quick actions (A3 review fix). Do not recreate without a new consumer. |
| `MeetingTypeLists` | `components/MeetingTypeLists.tsx` | **DELETED** — orphaned component that rendered four Quick Action `HomeCard`s; removed in the A4/A5 dead-control cleanup (commit `1b4e867`). It was never imported/rendered anywhere and imported a non-existent `../../constants` `meetingCardDetails`. The Schedule Meeting entry now lives on the Dashboard quick actions (A3 review fix). |
| `MeetingModel` | `components/MeetingModel.tsx` | Modal for New/Join/Schedule meeting flows — **light card** (`bg-surface-container-lowest`/`text-on-surface`/`border-outline-variant`); badge = `bg-primary-container text-on-primary`; inputs `bg-surface-container-lowest border-outline-variant text-on-surface`; Cancel `bg-surface-container-lowest text-on-surface hover:bg-surface-container-low`; primary `bg-primary-container text-on-primary hover:bg-primary` |
| `MeetingSetup` | `components/MeetingSetup.tsx` | Pre-call device/mic setup screen — dark in-call shell (`text-white`), audio-type trigger is a `bg-inverse-surface` pill (`hover:bg-inverse-on-surface/10`); "Join Meeting" uses locked `bg-primary-container` CTA |
| `MeetingRoom` | `components/MeetingRoom.tsx` | In-call layout, controls, participant list |
| `EndCallButton` | `components/EndCallButton.tsx` | Leave/end call control — locked `bg-error` (was broken `bg-danger`) |
| `PreviousPage`, `UpcomingPage`, `RecordingPage` | `components/*.tsx` | Meeting-list pages (Stream-data / `/api/recordings`) — light list card per `meeting-intelligence-list.html`: section `flex w-full flex-col gap-6 px-6 py-8` (renders inside `Sidebar_Com`'s `bg-surface` shell — do NOT add own `bg-surface`/`min-h-screen`); heading `text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg` + `text-body-md text-on-surface-variant` count; card `overflow-hidden rounded-xl border border-surface-variant bg-surface-container-lowest shadow-[0_4px_20px_rgba(0,0,0,0.04)]`; header row `grid grid-cols-12 gap-4 border-b border-surface-variant bg-surface-container-low/50 px-6 py-4 text-label-caps uppercase tracking-wider text-on-surface-variant`; body `divide-y divide-surface-variant`; row `grid grid-cols-12 items-center gap-4 px-6 py-4 transition-colors hover:bg-surface-container-low`; title cell = lucide icon chip `flex h-8 w-8 items-center justify-center rounded-lg bg-surface-container text-primary` + `font-body-md font-medium text-on-surface`; date cell `text-body-md text-on-surface-variant`; primary action = `inline-flex items-center gap-2 rounded-lg bg-primary-container px-4 py-2 text-body-md font-body-md font-semibold text-on-primary transition-colors hover:bg-primary`; secondary action = `inline-flex items-center gap-2 rounded-lg border border-surface-variant px-4 py-2 text-body-md font-body-md font-medium text-primary transition-colors hover:border-primary hover:bg-primary/5`. Empty state: centered `rounded-xl border border-surface-variant bg-surface-container-lowest` + lucide icon + `text-body-lg text-on-surface-variant`. Loading → `LoaderOne`. |
| `PersonalRoomPage` | `components/PersonalRoomPage.tsx` | Personal-room detail page (light): heading `text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg`; info `Table` cards `rounded-xl border border-surface-variant bg-surface-container-lowest p-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)]` (label `text-label-caps uppercase text-on-surface-variant`, value `text-body-lg text-on-surface break-all`); `Start Meeting` uses `Button` (default `bg-primary-container`/hover `bg-primary`), `Copy Invitation` overrides `Button` to outline `border border-surface-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-low` + `rounded-lg`. |
| `JoinMeetingPage` | `components/JoinMeetingPage.tsx` | Standalone Join Meeting page — centered light card per `join-meeting.png`: `rounded-xl border border-surface-variant bg-surface-container-lowest shadow-[0_4px_20px_rgba(0,0,0,0.04)]`, icon circle `bg-surface-container-low text-primary-container`, heading `text-display-lg-mobile md:text-display-lg font-display-lg`, input `bg-surface-container-lowest border border-surface-variant` + `focus:border-primary-container focus:ring-2 focus:ring-primary-container/20`, primary button `bg-primary-container text-on-primary hover:bg-primary`, divider `bg-surface-variant`, Personal Room dashed box `border-dashed border-surface-variant bg-surface-container-low` + `text-label-mono` link + `text-primary-container` copy. Reached via `Sidebar_Com type="joinMeeting"` and `/join-meeting` route. Reuses `getMeetingIdFromLink` for join; personal-room link = `${baseUrl}/meeting/${user.id}` (baseUrl = `NEXT_PUBLIC_BASE_URL` or `window.location.origin`, SSR-safe). Vertically centered via `flex flex-1 min-h-0 items-center justify-center` — fills the real remaining height from `Sidebar_Com`'s `min-h-full` (no hardcoded `calc(100dvh-*)`, so it tracks the single `HomeLayout` navbar clearance) |
| `Loader`, `ui/loader.tsx` (`LoaderOne`) | — | Loading states |
| `ui/stateful-button.tsx` | — | Primary button with async pending state — locked `bg-primary-container`/`text-on-primary` + `hover:bg-primary` — reuse for all AI action buttons (replaced retired `bg-green-1`) |
| `ui/dropdown-menu.tsx`, `ui/popover.tsx` | Radix wrappers | Reuse for layout/audio-type/category dropdowns |
| `ui/animated-modal.tsx` | — | Modal shell (`ModalBody`/`ModalContent`/`ModalFooter`/`useModal`) — **light card**: `bg-surface-container-lowest border-outline-variant text-on-surface`, footer `bg-surface-container-low border-t border-outline-variant`, close icon `text-on-surface-variant`. Overlay scrim `bg-black bg-opacity-50` (dimming only). `ModalBody` takes optional `onClose` (fired on outside-click + `setOpen(false)`). `MeetingModel` + `UploadTranscriptModal` open via `setOpen(true)` on mount. Reuse for new modals |
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

## New Components — Meeting Intelligence (built through Step 6)

| Component | Path | Pattern |
| --- | --- | --- |
| `MeetingList` | `components/meeting-intelligence/MeetingList.tsx` | Client component fetching `GET /api/meetings`. Reuses the `RecordingPage` list-card treatment exactly: `section flex w-full flex-col gap-6 px-6 py-8` (renders inside `Sidebar_Com`'s `bg-surface` shell — no own bg), heading `text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg` + count, `overflow-hidden rounded-xl border border-surface-variant bg-surface-container-lowest shadow-[0_4px_20px_rgba(0,0,0,0.04)]`, 12-col header (`text-label-caps uppercase tracking-wider text-on-surface-variant`) + `divide-y divide-surface-variant` rows; title cell = `FileText` icon chip `bg-surface-container text-primary` + `font-body-md font-medium text-on-surface`; category chip `bg-primary-container/15 text-primary-container` or "Processing…" when `!hasInsights`; "Open Insights" action `bg-primary-container text-on-primary hover:bg-primary` → `router.push('/meeting-intelligence/'+id)`. Empty state = centered `rounded-xl border border-surface-variant bg-surface-container-lowest` + `FileText` + "No meetings yet." + Upload Transcript button → `/dashboard`. Loading → `LoaderOne`. |
| `MeetingTabs` | `components/meeting-intelligence/MeetingTabs.tsx` | Tab bar from a `TABS` const array `["Overview","Summary","Action Items","Recording","Category","AI Chat"]`. Bar: `flex gap-1 overflow-x-auto border-b border-surface-variant`; active tab `border-b-2 border-primary-container text-primary`, inactive `border-transparent text-on-surface-variant hover:text-on-surface`. Local `useState` for active tab; renders the matching tab component, passing `meeting`/`insights`/`actionItems`/`meetingId` down. |
| `OverviewTab` | `components/meeting-intelligence/OverviewTab.tsx` | Synthesized landing view (not a DB table): 4 `StatCard`s (`bg-surface-container-lowest border border-surface-variant rounded-xl p-4 shadow-[…]`) for Category / Action Items / Date / Status, + a summary-preview card (`whitespace-pre-line text-body-md leading-relaxed text-on-surface-variant`, trimmed to 320 chars + "…"). |
| `SummaryTab` | `components/meeting-intelligence/SummaryTab.tsx` | `insights.summary` prose block + `keyPoints` list + `decisions` list, each in a `bg-surface-container-lowest` card; bullets `flex gap-2 text-body-md text-on-surface-variant` with `text-primary` "•". Empty state → `TabEmptyState`. |
| `ActionItemsTab` | `components/meeting-intelligence/ActionItemsTab.tsx` | `actionItems` as rows (dot `bg-primary-container` + `font-body-md font-medium text-on-surface`, meta row with `User`/`CalendarDays` icons for assignee/dueDate) in a `divide-y divide-surface-variant` card; also renders the `decisions` list. Empty → `TabEmptyState`. |
| `RecordingTab` | `components/meeting-intelligence/RecordingTab.tsx` | Client fetch of `GET /api/recordings`, filters by `recording.call_id === meeting.streamCallId` (upload-sourced meetings have `upload_*` ids → no match → `TabEmptyState` "No recording available for this meeting."). Play button `bg-primary-container text-on-primary hover:bg-primary` → `window.open(url)`. |
| `CategoryTab` | `components/meeting-intelligence/CategoryTab.tsx` | Read-only: category badge `bg-primary-container/15 text-primary-container` (uppercase `text-label-caps`) + `detectedTopics` as `bg-surface-container-low` chips. Empty → `TabEmptyState`. (Change-category dropdown deferred — needs a write path.) |
| `EmptyState` | `components/meeting-intelligence/EmptyState.tsx` | Shared `TabEmptyState({ message })` — centered `rounded-xl border border-surface-variant bg-surface-container-lowest` + `Inbox` icon + `text-body-lg text-on-surface-variant`. Reuse for all empty tabs. |
| `MeetingDetail` | `components/meeting-intelligence/MeetingDetail.tsx` | Client component (`useParams` page passes `meetingId`): fetches `GET /api/meetings/[id]`, loading → `LoaderOne`, 404/error → "Meeting not found" + back button. Header: title `text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg` + `status` chip (`bg-surface-container-low text-label-caps`) + `category` chip (`bg-primary-container/15 text-primary-container`), formatted date. Renders `MeetingTabs`. |
| `AiChatTab` | `components/meeting-intelligence/AiChatTab.tsx` | Step 6 — wraps `ChatPanel`, scoped to `meetingId`. Heading `text-headline-md font-semibold text-on-surface` + `text-body-md text-on-surface-variant` intro. |
| `ChatPanel` | `components/meeting-intelligence/ChatPanel.tsx` | Streaming chat UI (AI SDK `useChat` + `DefaultChatTransport`). Card `flex h-[60vh] flex-col rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0_4px_20px_rgba(0,0,0,0.04)]`; scroll area `flex-1 space-y-4 overflow-y-auto p-6`; user bubble `bg-primary-container text-on-primary`, assistant bubble `bg-surface-container text-on-surface`; input row `border-t border-outline-variant p-4` with input `bg-surface border border-outline-variant text-on-surface focus:border-primary-container` + Send `bg-primary-container text-on-primary hover:bg-primary` / Stop `bg-surface-container text-on-surface hover:bg-surface-container-high`. Renders `message.parts` text; `react-hot-toast` on `error`. Reusable for the general `/ai-chat` page later (pass `meetingId` or extend). |

**Page wiring:** `src/app/(root)/(home)/meeting-intelligence/page.tsx` → `<Sidebar_Com type="meetingIntelligence" />`; `src/app/(root)/(home)/meeting-intelligence/[id]/page.tsx` → `<Sidebar_Com type="meetingIntelligence"><MeetingDetail meetingId={id} /></Sidebar_Com>` (client page using `useParams()`). `Sidebar_Com` now accepts optional `children` (renders children when provided, else the `type`-based page) and has `meetingIntelligence` added to `SidebarPagesTypes` → renders `MeetingList`. The upload success redirect now lands on `/meeting-intelligence/[id]` (`UploadTranscriptModal.tsx`).

**API:** `GET /api/meetings` (list, scoped by `user_id`, joins `meeting_insights(category, summary)`, normalizes to `MeetingListItem[]`) and `GET /api/meetings/[id]` (detail by `id`+`user_id`, parallel-fetches `meeting_insights` + `action_items`, returns `MeetingDetailResponse`). Shared types in `src/lib/meeting-types.ts`. Both routes use the upload/process route convention: `auth()` 401 → `supabaseServer()` → try/catch with `console.error` + 500.

## New Components — Follow-ups (built Step 7)

| Component | Path | Pattern |
| --- | --- | --- |
| `FollowUpList` | `components/follow-ups/FollowUpList.tsx` | Client component fetching `GET /api/follow-ups`. Reuses the `RecordingPage` list-card treatment exactly: `section flex w-full flex-col gap-6 px-6 py-8`, heading + count, `overflow-hidden rounded-xl border border-surface-variant bg-surface-container-lowest shadow-[0_4px_20px_rgba(0,0,0,0.04)]`, 12-col header (`text-label-caps uppercase tracking-wider text-on-surface-variant`) + `divide-y divide-surface-variant` rows. Each row is a `next/link` → `/follow-ups/${id}`. Title cell = `font-body-md font-medium text-on-surface` + status chip: `pending` → `bg-surface-container text-on-surface-variant`, `needs_attention` → `bg-primary-container/15 text-primary-container`, `completed` → `bg-primary-container text-on-primary` (all `inline-flex w-fit items-center rounded-full px-3 py-1 text-label-caps uppercase tracking-wider`). Columns: Action item / Meeting (truncate `text-on-surface-variant`) / Due (`toLocaleDateString`) / Open (`ArrowRight` link `border border-surface-variant text-primary hover:border-primary hover:bg-primary/5`). Empty → centered card + `ListChecks` + "No follow-ups yet." Loading → `LoaderOne`. |
| `FollowUpDetails` | `components/follow-ups/FollowUpDetails.tsx` | Client, `id` prop, fetches `GET /api/follow-ups/${id}`. Back link `ArrowLeft` → `/follow-ups`. Header = action title (`text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg`) + meeting title (`text-on-surface-variant`). Details card (`bg-surface-container-lowest p-6 shadow-[…]`): `dl` grid `sm:grid-cols-2` rows (Assignee / Due date / Priority / Meeting started) with `dt` `text-label-caps uppercase tracking-wider text-on-surface-variant` + `dd` `text-body-md text-on-surface`; Notes if present. Status card: 3-button segmented control (`pending` / `needs_attention` / `completed`) — active = `bg-primary-container text-on-primary hover:bg-primary`, inactive = `border border-surface-variant bg-surface-container-lowest text-on-surface hover:border-primary hover:bg-surface-container-low`; `completed` shows `CheckCircle2`. Click → `updateFollowUpStatus` via `useTransition` + refetch. 404/not-found → back link + `ListChecks` "Follow-up not found." card. |

**Page wiring:** `src/app/(root)/(home)/follow-ups/page.tsx` → `<Sidebar_Com type="followUps" />`; `src/app/(root)/(home)/follow-ups/[id]/page.tsx` → `<Sidebar_Com type="followUps"><FollowUpDetails id={id} /></Sidebar_Com>` (client page using `useParams()`). `Sidebar.tsx` gained `"followUps"` in `SidebarPagesTypes` + case `{type === "followUps" && <FollowUpList />}`. The `/follow-ups` sidebar link already existed in `constants/index.tsx`.

| Component | Path | Pattern |
| --- | --- | --- |
| `SettingsPage` | `components/SettingsPage.tsx` | Client (`useUser` from Clerk). Renders inside `Sidebar_Com`'s `bg-surface` shell — no own `bg-surface`/`min-h-screen`. `section flex w-full flex-col gap-6 px-6 py-8`; heading `text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg` + `text-body-md text-on-surface-variant` sub. **Account card:** `rounded-xl border border-surface-variant bg-surface-container-lowest p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]`, heading `text-headline-sm font-semibold text-on-surface`, avatar `h-12 w-12 rounded-full object-cover` + name `font-body-md font-medium text-on-surface` + email `text-body-md text-on-surface-variant` (read-only from Clerk). **Preferences card:** same card treatment, header `border-b border-surface-variant px-6 py-4` + `divide-y divide-surface-variant` rows `flex items-center justify-between gap-4 px-6 py-4`, label `font-body-md font-medium text-on-surface` + hint `text-body-md text-on-surface-variant`. Inline **Toggle** (local, not a shared component): `<button role="switch" aria-checked>` `h-6 w-11 rounded-full` → on `bg-primary-container` / off `bg-surface-container`, knob `h-5 w-5 rounded-full` → on `translate-x-5 bg-on-primary` / off `translate-x-0.5 bg-on-surface-variant`. State in `useState` seeded from `localStorage` (`neurameet:prefs`) on mount, written back on change (try/catch, no backend). 3 prefs: email notifications / AI auto-summary on upload / desktop reminders. |

**API + Action:** `GET /api/follow-ups` (list, scoped via the user's meeting ids `.in("meeting_id", ids)`, joins `meetings(title)` + `action_items(title, assignee, due_date)`, maps to `FollowUpItem[]`) and `GET /api/follow-ups/[id]` (detail, same scope, `maybeSingle` → 404, returns `FollowUpDetail`). Shared types `FollowUpItem` / `FollowUpDetail` / `FollowUpStatus` / `FollowUpPriority` in `src/lib/meeting-types.ts`. **Status write is a Server Action, NOT an API route** (user decision): `src/actions/follow-ups.ts` `updateFollowUpStatus(id, status)` (`"use server"` + `import "server-only"`) — validates enum, `auth()` 401, ownership via user's meeting ids, `supabaseServer()` update `status`+`updated_at`, `revalidatePath` both paths, try/catch → `{ ok, error }`. **Auto-generation:** `src/app/api/ai/process/route.ts` now inserts `follow_ups` (one per action item, `status:'pending'`, `priority:'medium'`) right after writing `action_items` (non-fatal past insights). One-time backfill SQL populates the 3 already-processed meetings.

> `ChatPanel` (AI Chat) is built at `components/meeting-intelligence/ChatPanel.tsx` — see the Meeting Intelligence section above. The general `/ai-chat` page that reuses it is still deferred.

---

## Registry Update Rule

Every new component gets a row here immediately after creation, with the pattern it establishes so the next session reuses it instead of inventing a variant. Run `/imprint` after any new UI component or page.
