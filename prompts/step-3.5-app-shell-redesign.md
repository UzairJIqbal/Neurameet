# Step 3.5 — Apply UI Redesign to App Shell

## Goal
Restyle the existing app shell components (Sidebar, Navbar, Quick Actions cards, Dashboard content) to match `context/designs/dashboard.png`. Full token replacement per `context/ui-tokens.md` (locked from Stitch redesign). Font swap from SUSE Mono to Hanken Grotesk + JetBrains Mono.

## Design Reference
- `context/designs/dashboard.png` — dark sidebar, light content area, Quick Actions cards, Meeting Intelligence section
- `context/ui-tokens.md` — **source of truth** for all token names and hex values
- `context/designs/DESIGN-TOKENS.md` — raw Stitch output (color palette, typography, spacing, elevation)
- `context/ui-rules.md` — layout rules, card styles, button styles

---

## 1. `tailwind.config.ts` — Full Token Replacement

**Remove entirely** (old system, all retired per ui-tokens.md):
- `dark: { 1, 2, 3, 4 }`
- `blue: { 1 }`
- `sky: { 1, 2, 3 }`
- `purple: { 1 }`
- `orange: { 1 }`
- `yellow: { 1 }`
- `green: { 1 }`
- Old `surface`, `success`, `danger` blocks

**Add** (exact values from `context/ui-tokens.md`, lines 26–64):
```ts
colors: {
  // Primary
  primary: "#6500C4",
  "primary-container": "#830EF9",
  "on-primary": "#FFFFFF",
  "on-primary-container": "#E9D5FF",

  // Secondary
  secondary: "#525B8E",
  "secondary-container": "#BBC3FD",
  "on-secondary-container": "#464F81",

  // Tertiary
  tertiary: "#7B3500",
  "tertiary-container": "#A04700",

  // Error
  error: "#BA1A1A",
  "error-container": "#FFDAD6",
  "on-error-container": "#93000A",

  // Surface (light content area)
  surface: "#FAF8FF",
  "surface-dim": "#D7D9EA",
  "surface-bright": "#FAF8FF",
  "surface-container-lowest": "#FFFFFF",
  "surface-container-low": "#F3F2FF",
  "surface-container": "#EBEDFE",
  "surface-container-high": "#E6E7F8",
  "surface-container-highest": "#E0E1F3",
  "surface-variant": "#E0E1F3",

  // Text
  "on-surface": "#181B27",
  "on-surface-variant": "#4C4356",

  // Inverse (dark sidebar/shell)
  "inverse-surface": "#2D303D",
  "inverse-on-surface": "#EFF0FF",
  "inverse-primary": "#D7BAFF",

  // Outline
  outline: "#7D7388",
  "outline-variant": "#CEC2D9",

  // Background (shadcn compat)
  background: "#FAF8FF",
  "on-background": "#181B27",
},
```

**Token mapping (old → new):**
| Old token | Was used for | New token | New hex |
|---|---|---|---|
| `bg-dark-1` | Sidebar bg | `bg-inverse-surface` | #2D303D |
| `bg-dark-2` | Page bg, mobile sidebar | `bg-surface` (light content) or `bg-inverse-surface` (sidebar) | context-dependent |
| `bg-dark-3` | Dark elevated cards | `bg-inverse-surface` | #2D303D |
| `bg-dark-4` | Active nav pill bg | `bg-primary-container` | #830EF9 |
| `text-white` on dark | Primary text on dark | `text-inverse-on-surface` | #EFF0FF |
| `text-sky-1` | Muted text on dark | `text-inverse-on-surface/70` | 70% opacity of #EFF0FF |
| `text-purple-1` | Accent text | `text-primary-container` | #830EF9 |
| `bg-purple-1` | CTA buttons | `bg-primary-container` | #830EF9 |
| `border-sky-2` | Card border | `border-outline-variant` | #CEC2D9 |
| `bg-orange-1/10` | Needs-attention badge | `bg-error-container` | #FFDAD6 |
| `text-orange-1` | Warning text | `text-error` | #BA1A1A |
| `bg-blue-1/10` | Info badge | `bg-secondary-container` | #BBC3FD |
| `text-blue-1` | Info text | `text-on-secondary-container` | #464F81 |
| `bg-green-1` | Success / CTA buttons | `bg-primary-container` | #830EF9 |
| `bg-success/light` | Completed badge | `bg-secondary-container` | #BBC3FD |
| `text-success` | Completed text | `text-on-secondary-container` | #464F81 |
| `bg-green-1` | Online status dot (small visual indicator) | keep `bg-green-1` — visual match to dashboard.png, no locked token in system | #00C48C |

---

## 2. `src/app/layout.tsx` — Font Swap

- Remove `import localFont from "next/font/local"` and the `suseMono` variable + all path refs
- Add:
  ```ts
  import { Hanken_Grotesk, JetBrains_Mono } from "next/font/google";

  const hankenGrotesk = Hanken_Grotesk({
    variable: "--font-hanken-grotesk",
    weight: ["400", "500", "600", "700", "800"],
    display: "swap",
  });
  const jetbrainsMono = JetBrains_Mono({
    variable: "--font-jetbrains-mono",
    weight: ["400", "500", "700"],
    display: "swap",
  });
  ```
- Body class: `${hankenGrotesk.variable} ${jetbrainsMono.variable} bg-inverse-surface`
  - Note: body bg is `inverse-surface` because the root page IS the dark shell; the light content area is a child container with `bg-surface`
- Toaster `fontFamily`: `"var(--font-hanken-grotesk)"`
- Clerk `formButtonPrimary` class: reference new font variable

---

## 3. `src/components/ui/sidebar.tsx` — Base Sidebar Primitives

**`DesktopSidebar`:**
- `bg-dark-2` → `bg-inverse-surface`

**`MobileSidebar`:**
- `bg-dark-2 dark:bg-neutral-900` → `bg-inverse-surface`
- `bg-dark-2 dark:bg-neutral-900 p-10` → `bg-inverse-surface p-10`

**`SidebarLink`:**
- Import `usePathname` from `next/navigation`
- Route detection: `const pathname = usePathname(); const isActive = pathname === link.href;`
- Default text: `text-inverse-on-surface/70` (muted)
- Hover: `text-inverse-on-surface`
- Active: `bg-primary-container/20 rounded-lg px-3 py-2 text-inverse-on-surface font-medium`
- Icon: active → `text-primary-container`, default → `text-inverse-on-surface/70`

---

## 4. `src/components/Sidebar.tsx` — Sidebar Shell

- Logo text: "Neuro_Meet" → "NeuraMeet"
- Logo icon square: `bg-dark-2` → `bg-primary-container` (brand accent on logo mark)
- User avatar section: add "Uzair Iqbal" text next to avatar when sidebar expanded
- Outer wrapper div: `bg-dark-2` → `bg-inverse-surface` (seamless with sidebar, both dark)

---

## 5. `src/components/Navbar.tsx` — Top Bar (inside content area)

Per dashboard.png, the Navbar sits right of the sidebar inside the light content area:
- Background: `bg-surface` (#FAF8FF) — **light, NOT dark**
- Bottom border: `border-b border-outline-variant`
- Left: greeting text — dynamic time-of-day: "Good morning/afternoon/evening, Uzair Iqbal"
  - `text-on-surface font-semibold text-lg`
- Right: keep `UserButton` from Clerk
- Remove the logo Image (logo lives in sidebar only)

---

## 6. `src/components/DashboardContent.tsx` — Restyle (EXISTING FILE, restyled in place)

This file **already exists** at `src/components/DashboardContent.tsx`. Contains `QuickActionCard`, `StatCard`, `UpcomingMeetingCard`, `Sparkline`. Being restyled in place.

**Layout change — critical:**
The main content area is `bg-surface` (#FAF8FF, light). Cards sit on this light background. The dark shell is ONLY the sidebar.

**Main section wrapper:**
- Remove `text-white` from the section — content is now on light bg
- Section: `bg-surface min-h-screen` (light page background)

**Welcome header:**
- "Welcome back, Uzair Iqbal!": `text-on-surface font-bold` (#181B27)
- Subtitle: `text-on-surface-variant` (#4C4356)

**`QuickActionCard`:**
- Background: `bg-surface-container-lowest` (#FFFFFF — white card)
- Border: `border border-outline-variant` (#CEC2D9)
- Icon container: **all 4 identical** — `bg-primary-container/10 text-primary-container` (light purple circle per dashboard.png, NOT 4 different colors)
- Title: `text-on-surface font-semibold` (#181B27)
- Subtitle: `text-on-surface-variant text-xs` (#4C4356)
- Hover: `hover:bg-surface-container-low`

**`StatCard`:**
- Background: `bg-surface-container-lowest`
- Border: `border border-outline-variant`
- Label: `text-on-surface-variant`
- Value: `text-on-surface font-bold`
- Sparkline: keep existing SVG, no color change needed

**`UpcomingMeetingCard`:**
- Background: `bg-surface-container-lowest`
- Border: `border border-outline-variant`
- Title: `text-on-surface font-bold`
- Time/subtitle: `text-on-surface-variant`
- Badge "Team": `bg-primary-container/10 text-primary-container` (purple accent)
- Badge "online": green dot using `bg-green-1` (small indicator only — no green token in locked set, matching dashboard.png visually)
- CTA "Join Meeting": `bg-primary-container text-on-primary` (#830EF9, white text)
- Stacked avatars: border color `border-surface-container-lowest` (white border matching card bg)

**Section headings ("Quick Actions"):**
- `text-on-surface font-semibold`

---

## 7. `src/constants/index.tsx` — Update Sidebar Links

Current: Home, Upcoming, Recordings, Previous, Personal-Room.

Per dashboard.png, update to:
| Label | href |
|---|---|
| Dashboard | /dashboard |
| Meeting Intelligence | /meeting-intelligence |
| AI Chat | /ai-chat |
| Recordings | /recording |
| Follow-ups | /follow-ups |
| Settings | /settings |

Keep existing icon Image approach, point to appropriate icon files.

---

## 8. `src/components/HomeCard.tsx` + `src/components/ui/card-hover-effect.tsx` — Restyle

`HomeCard.tsx` delegates to `HoverEffect` from `card-hover-effect.tsx`. Both are existing files, restyled in place.

**`card-hover-effect.tsx` (`Card` component):**
- Background: `bg-surface-container-lowest` (white)
- Border: `border border-outline-variant` (#CEC2D9)
- Hover bg: `bg-surface-container-low`
- `CardTitle`: `text-on-surface` (#181B27)
- `CardDescription`: `text-on-surface-variant` (#4C4356)

**`HomeCard.tsx`:** No direct code changes needed — it just renders `HoverEffect` with the card items.

---

## 9. `src/app/globals.css` — Targeted Color Swaps

- `.str-video__participant-list` background: `#2D303D` (inverse-surface)
- `.cl-dividerLine` background: `#CEC2D9` (outline-variant)
- Keep ALL Stream CSS overrides intact (do not touch video-call UI)

---

## Scope — What Does NOT Change
- `MeetingRoom.tsx` — video call UI
- `MeetingSetup.tsx` — pre-call setup
- `MeetingModel.tsx` — modal
- `ui/animated-modal.tsx` — modal primitives
- Landing page components (already redesigned)
- Auth page components (already redesigned)
- Stream CSS overrides (except two targeted color swaps)

---

## File Change Summary
| File | Action |
|---|---|
| `tailwind.config.ts` | Full token replacement — remove old set, add locked Stitch tokens |
| `src/app/layout.tsx` | SUSE Mono → Hanken Grotesk + JetBrains Mono |
| `src/components/ui/sidebar.tsx` | bg-inverse-surface, active route detection, inverse-on-surface text |
| `src/components/Sidebar.tsx` | Logo text fix, primary-container logo accent, user name |
| `src/components/Navbar.tsx` | Light bg-surface, greeting text, remove logo |
| `src/components/DashboardContent.tsx` | Light cards on light bg, on-surface text, outline-variant borders |
| `src/components/ui/card-hover-effect.tsx` | White cards, outline-variant borders, on-surface text |
| `src/constants/index.tsx` | Updated sidebar nav links |
| `src/app/globals.css` | Two targeted color swaps (Stream + Clerk) |

---

## Verification
1. `npm run build` — passes with no errors
2. `/dashboard` — dark sidebar (#2D303D), light content area (#FAF8FF), white cards with outlined borders
3. Sidebar nav: active item highlighted with `primary-container` pill, inactive items `inverse-on-surface/70`
4. Quick Actions cards: white bg, `outline-variant` border, dark text, uniform icon circles (`bg-primary-container/10`)
5. Navbar: light `bg-surface`, greeting text in `on-surface`, user button
6. Fonts: body in Hanken Grotesk, mono in JetBrains Mono
7. No regressions on landing page (`/`) or auth pages (`/sign-in`, `/sign-up`)
8. Meeting Room and Meeting Setup — unchanged
9. Update `context/progress-tracker.md` (mark Step 3.5 done, update Next Action) and `context/ui-registry.md` (record restyled components + token mappings), per AGENTS.md
