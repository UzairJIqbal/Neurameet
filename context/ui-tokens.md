# UI Tokens

**Locked from final Stitch redesign** (`context/designs/*.png` + `*.html`, 16 screens, approved). This supersedes the earlier draft based on `tailwind.config.ts` guesses — Stitch's actual output is the source of truth. Update `tailwind.config.ts` to match these values exactly. Never hardcode hex values or use raw Tailwind color classes in components — use these tokens.

---

## How to Use

Add these to `tailwind.config.ts` under `theme.extend.colors`, **replacing** the old dark-1..4/purple-1/sky-1..3 set — do not keep both systems side by side.

```tsx
// Correct
className="bg-surface text-on-surface border-outline-variant"

// Never
className="bg-[#830EF9]"
className="bg-dark-1"
className="bg-purple-500"
```

---

## tailwind.config.ts — Token Definition (exact values, source: context/designs/DESIGN-TOKENS.md)

```ts
colors: {
  primary: "#6500C4",
  "primary-container": "#830EF9",   // main accent — buttons, active states, links
  "on-primary": "#FFFFFF",
  "on-primary-container": "#E9D5FF",

  secondary: "#525B8E",
  "secondary-container": "#BBC3FD",
  "on-secondary-container": "#464F81",

  tertiary: "#7B3500",
  "tertiary-container": "#A04700",

  error: "#BA1A1A",
  "error-container": "#FFDAD6",
  "on-error-container": "#93000A",

  surface: "#FAF8FF",                       // page background (light)
  "surface-dim": "#D7D9EA",
  "surface-bright": "#FAF8FF",
  "surface-container-lowest": "#FFFFFF",    // cards
  "surface-container-low": "#F3F2FF",
  "surface-container": "#EBEDFE",
  "surface-container-high": "#E6E7F8",
  "surface-container-highest": "#E0E1F3",
  "surface-variant": "#E0E1F3",

  "on-surface": "#181B27",          // primary text
  "on-surface-variant": "#4C4356",  // secondary text
  "inverse-surface": "#2D303D",     // dark sidebar/shell background
  "inverse-on-surface": "#EFF0FF",  // text on dark sidebar
  "inverse-primary": "#D7BAFF",     // active nav highlight on dark sidebar

  outline: "#7D7388",
  "outline-variant": "#CEC2D9",     // card/input borders

  background: "#FAF8FF",
  "on-background": "#181B27",
},
```

---

## Color Usage Guide

### Shell
| Element | Token |
| --- | --- |
| Sidebar background | `bg-inverse-surface` (#2D303D) — **one value only**, never split across dark-1/dark-2 |
| Sidebar text (inactive) | `text-inverse-on-surface` |
| Sidebar active nav item | `bg-primary-container text-on-primary` (filled pill) or `text-inverse-primary` for text-only active state |
| Page/content background | `bg-surface` (#FAF8FF) |
| Card background | `bg-surface-container-lowest` (#FFFFFF) |
| Card border | `border-outline-variant` (#CEC2D9) |

### Text
| Element | Token |
| --- | --- |
| Headings / primary text | `text-on-surface` (#181B27) |
| Secondary / muted text | `text-on-surface-variant` (#4C4356) |
| Text on dark sidebar | `text-inverse-on-surface` |

### Accent / Actions
| Element | Token |
| --- | --- |
| Primary button | `bg-primary-container text-on-primary` (#830EF9) |
| Primary button hover | `bg-primary` (#6500C4) |
| Link / active nav text | `text-primary-container` |

### Status
| Meaning | Token |
| --- | --- |
| Needs attention / high priority | `bg-error-container text-error` |
| Key points / secondary info | `bg-secondary-container text-on-secondary-container` |
| Decisions / taken / accent info | `text-primary-container` |

---

## Typography

Font families: **Hanken Grotesk** (UI text) + **JetBrains Mono** (labels/meta — timestamps, meeting codes) — replaces the earlier SUSE Mono decision. Import both via `next/font/google` in `layout.tsx`, remove the `localFont`/`suseMono` setup entirely.

| Style | Font | Size | Weight | Line height |
| --- | --- | --- | --- | --- |
| display-lg | Hanken Grotesk | 32px | 700 | 40px |
| headline-md | Hanken Grotesk | 24px | 600 | 32px |
| headline-sm | Hanken Grotesk | 20px | 600 | 28px |
| body-lg | Hanken Grotesk | 16px | 400 | 24px |
| body-md | Hanken Grotesk | 14px | 400 | 20px |
| label-mono | JetBrains Mono | 12px | 500 | 16px |
| label-caps | Hanken Grotesk | 11px | 700 (uppercase) | 16px |
| display-lg-mobile | Hanken Grotesk | 26px | 700 | 32px |

---

## Border Radius

```ts
borderRadius: {
  sm: "0.25rem",
  DEFAULT: "0.5rem",
  md: "0.75rem",
  lg: "1rem",
}
```
Cards use `lg` (16px). Buttons/inputs use `DEFAULT`/`md`.

---

## Invariants

- Never use hex values directly in components — always the tokens above
- `primary-container` (#830EF9) is the only accent purple — never a second purple
- Sidebar is `inverse-surface` (#2D303D) — **one dark value**, do not reintroduce dark-1/dark-2 as separate sidebar shades
- Shell is dark, main content area is light (`surface`/`surface-container-lowest`) — this inversion is correct per approved design, do not flatten to all-dark or all-light
- Font is Hanken Grotesk (UI) + JetBrains Mono (mono labels) — never SUSE Mono, never a third family
- Sign-in/Sign-up right panel keeps the dark testimonial treatment (`inverse-surface`) — left form panel stays light
- Landing page is light (`surface` / `surface-container-lowest` / `on-surface` / `on-surface-variant`), consistent with the main app shell — redesigned from dark on 2026-08-25 (Step P1)
- Old tailwind token names (`dark-1..4`, `purple-1`, `sky-1..3`, `blue-1`, `orange-1`, `yellow-1`) are **retired** — remove them from `tailwind.config.ts`, do not keep as aliases
