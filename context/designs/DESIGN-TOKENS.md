---
name: NeuraMeet Intelligence
colors:
  surface: '#faf8ff'
  surface-dim: '#d7d9ea'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f2ff'
  surface-container: '#ebedfe'
  surface-container-high: '#e6e7f8'
  surface-container-highest: '#e0e1f3'
  on-surface: '#181b27'
  on-surface-variant: '#4c4356'
  inverse-surface: '#2d303d'
  inverse-on-surface: '#eff0ff'
  outline: '#7d7388'
  outline-variant: '#cec2d9'
  surface-tint: '#8000f6'
  primary: '#6500c4'
  on-primary: '#ffffff'
  primary-container: '#830ef9'
  on-primary-container: '#e9d5ff'
  inverse-primary: '#d7baff'
  secondary: '#525b8e'
  on-secondary: '#ffffff'
  secondary-container: '#bbc3fd'
  on-secondary-container: '#464f81'
  tertiary: '#7b3500'
  on-tertiary: '#ffffff'
  tertiary-container: '#a04700'
  on-tertiary-container: '#ffd4bf'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#eddcff'
  primary-fixed-dim: '#d7baff'
  on-primary-fixed: '#280056'
  on-primary-fixed-variant: '#6100bd'
  secondary-fixed: '#dee0ff'
  secondary-fixed-dim: '#bbc3fd'
  on-secondary-fixed: '#0d1647'
  on-secondary-fixed-variant: '#3a4375'
  tertiary-fixed: '#ffdbca'
  tertiary-fixed-dim: '#ffb68e'
  on-tertiary-fixed: '#331200'
  on-tertiary-fixed-variant: '#763300'
  background: '#faf8ff'
  on-background: '#181b27'
  surface-variant: '#e0e1f3'
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-mono:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-caps:
    fontFamily: Hanken Grotesk
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
  display-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 32px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  container-margin: 40px
  gutter: 24px
---

## Brand & Style

This design system is engineered for a high-performance AI meeting intelligence platform. The brand personality is **intelligent, efficient, and sophisticated**, bridging the gap between deep technical analysis and executive-level clarity. 

The aesthetic follows a **Modern SaaS / Corporate Hybrid** approach. It utilizes a high-contrast dark sidebar (The "Shell") to anchor the navigation, while the main content area employs a "Light Mode" canvas with structured cards to ensure maximum readability and focus. Visual interest is generated through precise geometry, a vibrant electric violet primary accent, and purposeful use of whitespace. The interface avoids unnecessary decorative elements, opting for functional clarity and a systematic distribution of data.

## Colors

The palette is divided into two distinct environments: the **Navigation Shell** and the **Work Canvas**.

- **Navigation Shell:** Uses a deep, near-black palette (`#161925`) to provide a strong architectural frame. Active states within the sidebar utilize a muted navy-blue (`#1E2757`) to distinguish selection without competing with the primary accent.
- **Primary Accent:** The electric violet (`#830EF9`) is reserved for high-priority actions (CTAs), primary icons, and AI-driven insights, symbolizing the "neural" intelligence of the product.
- **Work Canvas:** A clean, light-grey background (`#F8FAFF`) hosts pure white cards. 
- **Semantic Palette:** A four-tier status system provides immediate diagnostic feedback for task urgency and meeting health, utilizing high-chroma tones for maximum visibility against light backgrounds.

## Typography

The system uses a pairing of **Hanken Grotesk** for primary communication and **JetBrains Mono** for technical metadata.

- **Hanken Grotesk:** Chosen for its sharp, contemporary geometry and exceptional legibility in SaaS environments. It handles everything from large display headers to dense body copy.
- **JetBrains Mono:** Used sparingly for labels, timestamps, and "Meeting Intelligence" data points. This reinforces the "AI/Data" narrative of the product.
- **Hierarchy:** Use bold weights (700) for page titles and semi-bold (600) for card titles. Standard body text should remain at regular (400) to ensure a clean, airy feel.

## Layout & Spacing

The layout utilizes a **Fixed-Fluid Hybrid** model. The sidebar remains at a fixed width (260px), while the main content area spans the remaining width, organized into a 12-column grid.

- **Grid System:** On desktop, use 24px gutters. Cards typically span 4 columns (for small stats), 6 columns (for lists), or 12 columns (for primary dashboards).
- **Rhythm:** A strict 4px baseline grid ensures vertical alignment. 
- **Mobile Reflow:** On screens smaller than 768px, the sidebar collapses into a bottom navigation bar or a hamburger menu, and all cards stack vertically with 16px side margins.
- **Card Padding:** Standard card internal padding is set to `lg` (24px) to maintain a premium, spacious feel.

## Elevation & Depth

This design system avoids heavy drop shadows, opting for **Tonal Layering** and **Soft Ambient Shadows**.

- **Level 0 (Floor):** The main background (`#F8FAFF`), flat.
- **Level 1 (Cards):** Pure white surfaces with a 1px border (`#ECF0FF`). A very soft, diffused shadow (0px 4px 20px rgba(0, 0, 0, 0.04)) is applied to give a subtle lift.
- **Level 2 (Overlays):** Modals and dropdowns use a slightly more pronounced shadow (0px 10px 30px rgba(0, 0, 0, 0.08)) and no border, creating a clear distinction from the content beneath.
- **Sidebar Depth:** The sidebar is visually "deeper" than the content, using its dark color to recede, allowing the light-colored content cards to "pop" forward.

## Shapes

The shape language is defined by **Medium Roundedness**. 

- **Primary Cards:** Use a fixed 16px (`rounded-lg`) radius to create a friendly but professional appearance.
- **Buttons:** Use 8px (`rounded-md`) for a more structured, actionable feel.
- **Badges/Chips:** Always utilize a fully pill-shaped (`rounded-full`) geometry to differentiate them from interactive buttons.
- **Inputs:** Match the button radius (8px) for consistency in form-heavy views.

## Components

- **Buttons:** 
    - *Primary:* Solid `#830EF9` with white text. 
    - *Secondary:* Ghost style with `#ECF0FF` border and dark text.
    - *Icon Buttons:* Square 40x40px with 8px radius.
- **Pill Badges:** Used for status and categories. They feature a low-opacity background of the status color (e.g., 10% opacity) with high-contrast text of the same color.
- **Input Fields:** 1px border (`#ECF0FF`), white background. On focus, the border transitions to Primary Purple with a 2px soft glow.
- **Sidebar Nav:** 
    - *Default:* Transparent background, `#94A3B8` (Slate) text/icons.
    - *Active:* `#1E2757` background, white text, 4px left-accent border in `#830EF9`.
- **Content Cards:** Must include a header section with a title and optional "View All" or "Filter" actions. Footers are reserved for pagination or summary stats.
- **AI Chat Bubbles:** User messages in `#1E2757`, AI responses in white with a thin Primary Purple left-border.