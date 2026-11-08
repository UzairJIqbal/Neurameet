> **Update 2026-11-08:** the user chose to adopt the DotTime tokens and drop the Stitch lock. "No new hex values" and "keep locked tokens" below no longer apply; see the override note in `context/ui-tokens.md`.

# Step R1 — Redesign NeuraMeet to the DotTime reference (no deploy until the user verifies)

## Context

The user supplied a reference image of a landing page ("DotTime — Smart AI Calendar Sync for Every Team"):
a light, lilac and purple SaaS design. Read from the image:

- **Palette:** near-white page (`#FAF8FF`-like) with light grey section bands; one saturated purple accent
  (buttons, the highlighted word in headlines, check icons, active pills); soft lilac gradient panels behind
  product mockups; near-black text; dark pill for the nav CTA and the active tab; one coral-to-red gradient
  stat card (the only warm colour).
- **Type:** large light-weight sans display headlines (about 56 to 64px, tight leading, two-tone: one word in
  purple), small 12 to 14px grey body copy, tiny uppercase-free eyebrow chips ("#1 AI Scheduler for Teams").
- **Shape language:** very round (cards about 24px, inner cards about 16px, buttons and chips fully pill),
  almost no borders, soft diffuse shadows, generous padding, white cards sitting on tinted grey containers
  ("card in a tray" pattern).
- **Layout patterns:** nav with centered links and a dark CTA; hero = left copy + email capture + 3 stat cards,
  right = two stacked lilac mockup panels (bento); logo marquee on a tray; tabbed feature showcase (pill tabs
  over a photo + floating UI cards + stat column); 3-column pricing; testimonial with photo.

**Key finding:** the reference is already a purple, light theme, so it matches the locked Stitch tokens in
`context/ui-tokens.md` (`primary-container #830EF9`, `surface #FAF8FF`, `on-surface #181B27`). The redesign is
mostly shape, depth, layout, type scale and motion, not a new palette. **No new hex values.**

## Decisions needed from the user (answer before execution)

1. **Scope.** Recommended: **Phase 1** landing + auth, then **Phase 2** app shell (sidebar, navbar, dashboard),
   then **Phase 3** the remaining product pages, each verified by the user before the next. Meeting Room and
   Meeting Setup keep their dark full-bleed Stream styling (per `context/ui-rules.md`) and are excluded.
2. **Reference sections that conflict with the project rules** (recommended replacement in brackets):
   - Pricing plans ($19/$49/$99): billing is out of scope. [Replace with a "How NeuraMeet works" 3-step block,
     or a "Free to use" card.]
   - "Relied on by 5000+ Global Industry Experts", Notion/Webflow logos, 98% / 125+ / 200+ stats, fake
     testimonial: fabricated proof. [Replace with real facts: English + Urdu transcripts, Promise Ledger,
     Tasdeeq verified minutes, GitHub Proof Chain; "Built with" row using the real stack: Stream, Clerk,
     Supabase, Gemini, Groq, GitHub. No invented numbers or customers.]
   - Coral gradient stat card: coral is not a token. [Use a `primary` to `primary-container` gradient, or the
     `tertiary-container` token.]
3. **Token additions.** The reference needs a bigger radius (cards 24px) and soft shadow tokens. Recommended:
   add `xl: 1.5rem` to `borderRadius` and two shadow tokens (`shadow-card`, `shadow-float`) in
   `tailwind.config.ts`, recorded in `context/ui-tokens.md` first. Keep Hanken Grotesk + JetBrains Mono.

## Skills to use (all already installed, free)

`frontend-design`, `impeccable` (shape, polish, layout, animate), `design-taste-frontend` (anti-slop inspector
and look-and-fix loop), `motionsites-web-builder` and `awwwards-animations` (hero and scroll motion),
`microinteractions`, `animation-performance`, `typography-scale`, `accessibility`, `web-design-guidelines`.
`cinematic-gsap-lenis-motion-system` and `gsap-*` are NOT used: they would add GSAP/Lenis dependencies. Use the
already installed `motion` package (v12) plus CSS only.

Optional external skill found with `/find-skills` (not installed, needs the user's yes):
`emilkowalski/skills@find-animation-opportunities` (240K installs).
`vercel-labs/agent-skills@web-design-guidelines` and `anthropics/skills@frontend-design` are already present.

## Rules that stay

- Tokens only: no hex, no raw Tailwind colours. Single accent purple. Two fonts only.
- UI shows data only; no logic moved into components.
- Every loading state keeps `useLoadingTimeout` + `LoadError`.
- Motion: `motion` + CSS, transform/opacity only, honour `prefers-reduced-motion` (existing global rule),
  no layout-shifting animation, no new dependency.
- Existing tests keep passing; component tests updated only where markup changed. Aceternity kit pieces on dark
  themes (lamp, wobble-card) are removed from the landing page if they clash with the new look.
- Sidebar stays `inverse-surface` (locked invariant) unless the user explicitly asks to change it. The reference
  has a light app sidebar, so ask at Phase 2.

## Phase 1 — Landing + auth (build first)

Files: `src/app/(landing)/page.tsx`, `src/components/landing/*` (Nav, Hero, SocialProof, FeatureGrid,
AiArchitecture, EnterpriseGrid, MeetingHistory, LandingCTA, LandingFooter), `src/components/auth/*`,
`tailwind.config.ts`, `src/app/globals.css`, `context/ui-tokens.md`.

1. **Tokens first:** add radius `xl` and shadow tokens; update `ui-tokens.md`.
2. **Nav:** floating white pill bar, centered links, dark pill CTA ("Get Started"), sticky blur on scroll.
3. **Hero:** eyebrow chip ("Meetings that keep their promises"), display headline with one purple word
   (e.g. "Turn every meeting into *kept promises*"), subcopy, primary + secondary CTA (replace the email
   capture, since there is no newsletter backend), three stat cards in a tray using real facts. Right side:
   bento of two lilac gradient panels holding CSS-built product mockups (meeting card, ledger card, action
   items card) built from real component styling, not screenshots of someone else's product.
4. **"Built with" tray:** marquee of the real stack (pure CSS, paused on hover and under reduced motion).
5. **Tabbed showcase:** pill tabs (Summary, Action Items, Promise Ledger, Verified Minutes) over a tray with
   a mockup card and a stat column, tab change crossfades with `motion`.
6. **How it works** (replaces pricing) and a closing CTA band, footer restyled on the same tray language.
7. **Motion:** staggered fade-up on load, in-view reveals (`whileInView`, once), subtle hover lift on cards,
   floating-card parallax in the hero (transform only). All off under reduced motion.
8. **Auth pages:** same rounded card-in-tray treatment; keep the dark testimonial panel (locked invariant).
9. **Responsive:** 375 / 768 / 1280 / 1440, 16px gutters, no horizontal scroll.

## Phase 2 and 3 (planned, built only after Phase 1 is verified)

- P2: shell (Navbar, Sidebar, Dashboard cards, My Tasks/Projects cards) to the tray + soft-shadow language.
- P3: Meeting Intelligence, Follow-ups, Recordings, Search, Prep, Settings, Projects, Notifications.

## Verification

- `npx tsc --noEmit`, `npx next lint`, `npx vitest run`, `npm run build` (the one existing prettier lint
  error in `src/lib/transcript-state.ts` is pre-existing).
- Run the dev server, screenshot before/after at 3 widths into `docs/ui-audit/after/`, run the
  `design-taste-frontend` inspector, accessibility pass (contrast of purple on white, focus rings, keyboard).
- Update `context/ui-registry.md` and `context/progress-tracker.md`.
- **No deploy, no push.** The user reviews on localhost; commit only after the user says go.

## Test steps handed to the user

1. `npm run dev`, open `http://localhost:3000` signed out: check nav, hero, tabs, marquee, footer.
2. Resize to phone width; open `/sign-in` and `/sign-up`.
3. Toggle OS "reduce motion": all animation stops.
4. Say which pages to restyle next (Phase 2).
