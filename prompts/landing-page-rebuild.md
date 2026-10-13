# Landing Page Rebuild — Design Fidelity

**Date:** 2026-08-10
**Goal:** Rebuild `src/app/(landing)/page.tsx` and its components to match `context/designs/landing-page.png` and `context/designs/landing-page.html` exactly.

---

## Current State (Problems)

| Issue | Current | Design Target |
|-------|---------|---------------|
| Accent color | `text-green-1` (#00C48C) on "Get Started Free" CTA | `bg-primary-container` (#830EF9) purple |
| Hero headline | "Where Conversations Become Intelligence" | "Revolutionize Your Meetings With AI Intelligence" |
| Hero subtext | Different copy | "Automate summaries, action items, and follow-ups in real-time. NeuraMeet uses AI to turn meeting chaos into organized, actionable intelligence." |
| Dashboard mockup | Broken placeholder image (`/images/dashboard-preview.png`) | Browser-chrome mockup with dark content showing meeting data |
| Social proof | Stats row (500+ Teams, 10K+ Meetings, etc.) | 4 testimonial cards with purple avatar circles |
| Nav links | Product, Features, Testimonials, Pricing | Product, Features, Pricing, Docs |
| Sections present | PricingSection, TestimonialStrip (invented) | AI Architecture, Enterprise Grid, Meeting History (not built) |
| Feature cards | 4 cards (Auto Summaries, Smart Action Items, Meeting Intelligence, Seamless Integrations) | 3 cards from design |
| CTA section | "Get Started Free Today" | "Ready to revolutionize your meetings?" |
| Footer | 4-column (Product, Features, Company, Support) | 3-column (Product, Company, Legal) + social icons |

---

## Token Mapping (Design → Project Tokens)

| Design Color | Token to Use | Where |
|-------------|--------------|-------|
| `#161925` (brand-bg) | `bg-inverse-surface` (#2D303D) | Main landing bg, footer |
| `#1C1F2E` (brand-surface) | `bg-inverse-surface/80` | Cards, nav |
| `#830EF9` (primary) | `bg-primary-container` | CTA buttons, accent elements |
| `#C9DDFF` (muted) | `text-inverse-on-surface/70` | Secondary text |
| `#FFFFFF` | `text-inverse-on-surface` | Headings |
| Glass card | `bg-inverse-on-surface/5 border border-inverse-on-surface/10 backdrop-blur-sm` | Feature cards, testimonial cards |
| Gradient text | `bg-gradient-to-r from-primary-container to-primary bg-clip-text text-transparent` | Hero accent words |

---

## Implementation Plan

### Phase 1: Update Page Composition
**File:** `src/app/(landing)/page.tsx`

Replace current imports/sections with:
```tsx
import LandingNav from "@/components/landing/LandingNav";
import LandingHero from "@/components/landing/LandingHero";
import FeatureGrid from "@/components/landing/FeatureGrid";
import SocialProof from "@/components/landing/SocialProof";
import AiArchitecture from "@/components/landing/AiArchitecture";
import EnterpriseGrid from "@/components/landing/EnterpriseGrid";
import MeetingHistory from "@/components/landing/MeetingHistory";
import LandingCTA from "@/components/landing/LandingCTA";
import LandingFooter from "@/components/landing/LandingFooter";

export default function LandingPage() {
  return (
    <div className="bg-inverse-surface min-h-screen">
      <LandingNav />
      <LandingHero />
      <FeatureGrid />
      <SocialProof />
      <AiArchitecture />
      <EnterpriseGrid />
      <MeetingHistory />
      <LandingCTA />
      <LandingFooter />
    </div>
  );
}
```

### Phase 2: Update LandingNav
**File:** `src/components/landing/LandingNav.tsx`

Changes:
- Keep logo + "NeuraMeet" text
- Update nav links to: Product, Features, Pricing, Docs
- Update "Get Started" button: `bg-primary-container text-inverse-on-surface` (was `bg-green-1 text-dark-2`)
- Add "Sign in" link before CTA (per design)
- Remove `motion` animation complexity — keep it simple

### Phase 3: Update LandingHero
**File:** `src/components/landing/LandingHero.tsx`

Changes:
- Headline: "Revolutionize Your Meetings **With AI Intelligence**"
  - "With AI Intelligence" gets purple gradient text class
- Subtext: "Automate summaries, action items, and follow-ups in real-time. NeuraMeet uses AI to turn meeting chaos into organized, actionable intelligence."
- Two CTAs: "Get Started" (purple) + "Watch Demo" (outlined with play icon)
- Dashboard mockup: Build a browser-chrome mockup with:
  - Window controls (3 dots)
  - URL bar showing "app.neurameet.com"
  - Dark content area with meeting data layout
  - Purple accent elements inside the mockup

### Phase 4: Update FeatureGrid
**File:** `src/components/landing/FeatureGrid.tsx`

Changes:
- Reduce from 4 cards to 3 (per design)
- Update features to match design:
  1. "Intelligent Summaries" — "Get comprehensive meeting summaries powered by advanced AI..."
  2. "Automated Action Items" — "Never miss a task again. Our AI automatically extracts action items..."
  3. "Smart Scheduling" — "Optimize your meeting schedule with AI-powered suggestions..."
- Icons: Use `IconBrain`, `IconListCheck`, `IconCalendarTime` from Tabler
- Style: Glass-card effect (`bg-inverse-on-surface/5 border border-inverse-on-surface/10 backdrop-blur-sm`)

### Phase 5: Rewrite SocialProof
**File:** `src/components/landing/SocialProof.tsx`

Complete rewrite — change from stats to testimonial cards:
- Section title: "Trusted by innovative teams"
- 4 testimonial cards in a row
- Each card: quote text + author (name, role) + purple avatar circle with initial
- Design data:
  ```
  1. "NeuraMeet has transformed how we handle meetings. The AI summaries save us hours every week." — Sarah Chen, Product Manager
  2. "The automated action items are a game-changer. Nothing falls through the cracks anymore." — Marcus Johnson, Engineering Lead
  3. "We've reduced our meeting time by 40% while improving follow-through on action items." — Emily Rodriguez, CEO
  4. "The meeting intelligence features help us make data-driven decisions based on past conversations." — Alex Thompson, COO
  ```

### Phase 6: Create AiArchitecture (NEW)
**File:** `src/components/landing/AiArchitecture.tsx`

New component matching design:
- Split layout: Text left, stat card right
- Left: Title "Built on modern AI architecture", description text, 4 items with check icons (Real-time processing, Enterprise-grade security, Multi-language support, Custom integrations)
- Right: Glass card with "99.9%" stat, "AI Accuracy" label, and smaller stats below

### Phase 7: Create EnterpriseGrid (NEW)
**File:** `src/components/landing/EnterpriseGrid.tsx`

New component matching design:
- 6-item grid (3 columns × 2 rows)
- Each item: purple icon circle + title + description
- Items: Enterprise Security, Scalable Infrastructure, API Integration, Analytics Dashboard, Team Collaboration, Compliance & Auditing

### Phase 8: Create MeetingHistory (NEW)
**File:** `src/components/landing/MeetingHistory.tsx`

New component matching design:
- Split layout: Text left, browser mockup right
- Left: Title "Your meeting history, categorized and searchable", description, feature bullets (Smart categorization, Full-text search, Meeting analytics)
- Right: Light-themed browser mockup showing meeting list

### Phase 9: Update LandingCTA
**File:** `src/components/landing/LandingCTA.tsx`

Changes:
- Title: "Ready to revolutionize your meetings?"
- Subtitle: "Join thousands of teams already using NeuraMeet to transform their meeting workflow."
- Single CTA: "Get Started Free" with arrow icon, `bg-primary-container`

### Phase 10: Update LandingFooter
**File:** `src/components/landing/LandingFooter.tsx`

Changes:
- Left: Logo + description + social icons row
- Right: 3-column nav (Product, Company, Legal)
- Copyright: "© 2024 NeuraMeet. All rights reserved."
- Background: `bg-inverse-surface` with top border

---

## Files Modified (10 total)

| File | Action |
|------|--------|
| `src/app/(landing)/page.tsx` | Update imports/sections |
| `src/components/landing/LandingNav.tsx` | Update links, colors |
| `src/components/landing/LandingHero.tsx` | Rebuild copy + mockup |
| `src/components/landing/FeatureGrid.tsx` | Update to 3 cards |
| `src/components/landing/SocialProof.tsx` | Rewrite as testimonials |
| `src/components/landing/AiArchitecture.tsx` | **NEW** |
| `src/components/landing/EnterpriseGrid.tsx` | **NEW** |
| `src/components/landing/MeetingHistory.tsx` | **NEW** |
| `src/components/landing/LandingCTA.tsx` | Update copy + style |
| `src/components/landing/LandingFooter.tsx` | Update structure |

## Files Deleted

| File | Reason |
|------|--------|
| `src/components/landing/PricingSection.tsx` | Not in design, removed from page |
| `src/components/landing/TestimonialStrip.tsx` | Replaced by new SocialProof |

---

## Design Verification Checklist

After implementation, verify against `context/designs/landing-page.png`:
- [ ] Nav: Dark bg, purple logo icon, 4 nav links, Sign in + purple Get Started button
- [ ] Hero: Correct headline with purple gradient, correct subtext, 2 CTAs
- [ ] Dashboard mockup: Browser chrome with dark content
- [ ] Feature grid: 3 glass-cards with purple icon circles
- [ ] Social proof: 4 testimonial cards with purple avatars
- [ ] AI Architecture: Split layout with check items + stat card
- [ ] Enterprise grid: 6 items with purple icons
- [ ] Meeting history: Split layout with light mockup
- [ ] CTA: "Ready to revolutionize?" with purple button
- [ ] Footer: Logo, 3-column nav, copyright
- [ ] No hardcoded hex values — all tokens
- [ ] No invented copy/sections not in design

---

## Build Steps

1. Create new components (AiArchitecture, EnterpriseGrid, MeetingHistory)
2. Update existing components
3. Update page.tsx imports
4. Delete unused components (PricingSection, TestimonialStrip)
5. Run `npx prettier --write .`
6. Run `npm run build`
7. Screenshot comparison against design
