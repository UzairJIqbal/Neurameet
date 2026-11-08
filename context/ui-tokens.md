# UI Tokens

**Current design system: DotTime (adopted 2026-11-08, user decision).** Source of truth is the DotTime landing page reference supplied by the user ("Smart AI Calendar Sync for Every Team": light, white and lilac, one purple accent, soft cards on grey trays). It replaces the earlier Stitch redesign (`context/designs/*.png` are now historical for colour and shape; keep them only as layout references). Token NAMES did not change, so components keep working; only values, font, radius and shadow changed. `tailwind.config.ts` is the exact source of the values below. Never hardcode hex values or use raw Tailwind colour classes in components, use these tokens.

Not deployed until the user verifies the redesign locally.

---

## Look in one paragraph

Near white page, light grey tray sections, white cards with a 24px radius and a soft shadow, almost no borders, pill buttons and chips, one saturated purple accent, lilac panels behind product mockups, near black text, a dark pill for the nav CTA, one coral to red gradient card as the only warm colour. Headlines are large and light weight, with one purple word. Body copy is small and grey.

---

## tailwind.config.ts colours (exact)

```ts
primary: "#6E3BB5",                // hover and pressed purple
"primary-container": "#834ACB",    // THE accent: buttons, links, active states, highlighted headline word
"on-primary": "#FFFFFF",
"on-primary-container": "#F1E7FC",

lilac: "#F1E7FC",                  // active pills, icon circles, mockup panels
"lilac-soft": "#FDF4FE",           // inner mockup cards
coral: "#E66F72",                  // gradient card only (with tertiary-container)

secondary: "#5B5B66",
"secondary-container": "#F1E7FC",
"on-secondary-container": "#4B2A86",   // text on lilac

tertiary: "#B8434B",
"tertiary-container": "#D6535B",

error: "#BA1A1A", "error-container": "#FFDAD6", "on-error-container": "#93000A",
success: "#1B6D3C", "on-success": "#FFFFFF", "success-container": "#C9F2D5", "on-success-container": "#0B3D20",
warning: "#7A5900", "on-warning": "#FFFFFF", "warning-container": "#FFE3A1", "on-warning-container": "#3F2E00",

surface: "#FFFFFF",
"surface-dim": "#E6E6E6", "surface-bright": "#FFFFFF",
"surface-container-lowest": "#FFFFFF",   // cards
"surface-container-low": "#F8F8F8",      // trays and the app content background
"surface-container": "#F3F3F3",
"surface-container-high": "#EDEDED",
"surface-container-highest": "#E6E6E6",
"surface-variant": "#EDEDED",

"on-surface": "#0A0A0A",           // primary text
"on-surface-variant": "#525252",   // secondary text
"inverse-surface": "#1C1C1E",      // dark pill CTA, Meeting Room and Setup, auth testimonial panel
"inverse-on-surface": "#F5F5F5",
"inverse-primary": "#CDB2F0",

outline: "#8C8C8C",
"outline-variant": "#E6E6E6",      // hairlines and input borders
"on-background": "#0A0A0A",
"on-secondary-fixed-variant": "#4B2A86",
green-1: "#00C48C"                 // tiny status dots only
```

Status mapping: Needs attention `bg-error-container text-error`; Completed or Active `bg-success-container text-on-success-container`; Blocked, overdue, On Hold, High priority `bg-warning-container text-on-warning-container`; secondary info `bg-lilac text-on-secondary-container`. Priority: Urgent `error`, High `warning`, Medium `primary`, Low `secondary`. A project colour stores a token key, never a raw value.

---

## Shape and depth

| Token | Value | Use |
| --- | --- | --- |
| `rounded-card` | 1.5rem (24px) | cards, dialogs, mockup panels |
| `rounded-tray` | 2rem (32px) | grey tray sections, footer, CTA band |
| `rounded-full` | pill | buttons, chips, tabs, nav items, nav bar |
| `rounded-lg` / `rounded-xl` | 0.5 / 0.75rem | inputs and small controls |
| `shadow-card` | `0 1px 2px rgb(10 10 10 / 0.04), 0 8px 24px rgb(10 10 10 / 0.06)` | white cards and the sidebar |
| `shadow-float` | `0 16px 48px rgb(131 74 203 / 0.18)` | floating mockup cards |

Pattern: **white card on a grey tray** (`bg-surface-container-lowest rounded-card shadow-card` inside `bg-surface-container-low rounded-tray`). Borders are hairlines (`border-outline-variant`) only where a card has no shadow, such as table rows and inputs.

---

## Shell colours

| Element | Token |
| --- | --- |
| App content background | `bg-surface-container-low` (tray grey) |
| Sidebar | `bg-surface-container-lowest shadow-card` (light, white) |
| Sidebar item inactive | `text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface`, `rounded-full` |
| Sidebar item active | `bg-lilac text-on-secondary-container font-medium`, `rounded-full` |
| Header (Navbar) | `bg-surface-container-lowest border-b border-outline-variant` |
| Card | `bg-surface-container-lowest shadow-card rounded-card` |
| Primary button | `bg-primary-container text-on-primary rounded-full`, hover `bg-primary` |
| Dark CTA (nav, landing) | `bg-inverse-surface text-inverse-on-surface rounded-full`, hover `bg-primary-container` |
| Link or active text | `text-primary-container` |

Meeting Room, Meeting Setup and the auth testimonial panel stay dark and use `inverse-surface`, `inverse-on-surface` and `inverse-primary`.

---

## Typography

Fonts: **Inter** (UI, `--font-inter`) and **JetBrains Mono** (timestamps, meeting codes, task keys, `--font-jetbrains-mono`), both through `next/font/google` in `src/app/layout.tsx`. Never a third family. Hanken Grotesk and SUSE Mono are retired.

| Style | Size | Weight | Line height |
| --- | --- | --- | --- |
| display-lg | 34px | 700 | 44px |
| headline-md | 24px | 600 | 34px |
| headline-sm | 20px | 600 | 30px |
| body-lg | 16px | 400 | 26px |
| body-md | 15px | 400 | 24px |
| label-mono (JetBrains Mono) | 13px | 500 | 20px |
| label-caps | 12px | 700 uppercase | 18px |
| display-lg-mobile | 26px | 700 | 32px |

Comfort pass (2026-11-09): body text is 15px on 24px, secondary text is `#525252` (about 7.7:1 on white), the body uses antialiased smoothing and `optimizeLegibility`, and dashboard rows and sections have more room.

Landing headlines use `font-light tracking-tight` at 48 to 60px with one `text-primary-container` word. App headings keep the scale above.

---

## Motion

`motion` (v12) plus CSS only. Transform and opacity only. Fade up once on scroll (`Reveal`), hover lift with `motion-safe:`, `animate-marquee` for the logo row, `animate-float-slow` for floating cards. Everything stops under `prefers-reduced-motion`. No GSAP, no Lenis, no new animation dependency.

---

## Invariants

- No hex values and no raw Tailwind colours in components, tokens only.
- `primary-container` (#834ACB) is the only accent purple. `lilac` is a tint, not a second accent. `coral` is only for one gradient card.
- The app shell is light: white sidebar, white header, grey tray content area, white cards. Do not reintroduce a dark sidebar.
- Meeting Room, Meeting Setup and the sign-in or sign-up testimonial panel stay dark (`inverse-surface`, now neutral `#1C1C1E`).
- Fonts are Inter and JetBrains Mono only.
- The landing page and the app share the same tokens and the same card and tray language.
- The old token names `dark-1..4`, `purple-1`, `sky-1..3`, `blue-1`, `orange-1`, `yellow-1` are retired.
- Only invented proof is forbidden on the landing page: no fake customer counts, logos or testimonials, no pricing plans (billing is out of scope). Use real facts and the real stack.
