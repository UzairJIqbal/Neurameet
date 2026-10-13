# Step P1 — Landing Page Redesign (light theme + real copy)

## What we are building
A full re-theme of the public landing page (`src/app/(landing)/page.tsx` + 9 components in
`src/components/landing/*`) from the current all-dark `inverse-surface` shell to the **locked
light token system** used by the rest of the app (Dashboard, Meeting Intelligence), plus a rewrite
of all marketing copy to describe only features actually built in this repo. Nav/footer dead links
and the dead "Watch Demo" button are also fixed. No new sections, no layout overhaul, no new
dependencies. This step **overrides** the `ui-tokens.md` invariant "Landing page hero/nav/footer
stay dark" (the P1 instruction in build-plan.md is newer and more specific).

## Language agreed on
- **Full light theme** — nav, hero, every section, footer all use light tokens; no `bg-inverse-surface` / `text-inverse-on-surface` remains on the landing.
- **Strictly real copy** — only shipped features: AI transcript generation (EN/UR), AI summary/action-items/category, attendance PDF reports, follow-ups, meeting-aware RAG chat, cross-meeting search + prep, speaker engagement. Drop ALL unbuilt claims (sentiment detection, Slack/Jira/Notion integrations, SOC2, 99.9% uptime SLAs, global edge, 50+ integrations, RBAC/SSO, "proprietary fine-tuned models", fabricated "+45%", "join thousands of teams", fake named testimonials).
- **Scope** — recolor all 10 files + rewrite copy + fix dead controls (Watch Demo button, nav `Product`/`Docs`/`Pricing` `href="#"` links). Excludes new sections / layout overhaul.

## Rules that never change (re-stated)
- Never use raw Tailwind color classes or hex. Every color via the locked tokens (`surface`, `surface-container-lowest`, `surface-container-low`, `on-surface`, `on-surface-variant`, `primary-container`, `primary`, `outline-variant`, `secondary-container`, `error`).
- Primary button = `bg-primary-container text-on-primary` (#830EF9 bg / #FFFFFF text), hover `bg-primary`. Secondary = `bg-surface-container text-on-surface border border-outline-variant`.
- No `blur-*` / `backdrop-blur-*` on any background (decorative glows = opacity only, already the case).
- Card treatment (from `ui-rules.md`): `bg-surface-container-lowest border border-outline-variant rounded-xl`.
- Section separators: `border-t border-outline-variant` (replace `border-inverse-on-surface/*`).

## Files & exact changes

### 1. `src/app/(landing)/page.tsx`
- Wrapper `className="bg-inverse-surface h-screen overflow-y-auto"` → `className="bg-surface min-h-screen"`.
- No structure change; keep all 9 component imports.

### 2. `src/components/landing/LandingNav.tsx`
- `bg-inverse-surface` → `bg-surface-container-lowest`; `border-b border-inverse-on-surface/5` → `border-b border-outline-variant`.
- Text `text-inverse-on-surface` → `text-on-surface`; nav links `text-inverse-on-surface/70 hover:text-inverse-on-surface` → `text-on-surface-variant hover:text-on-surface`.
- CTA `bg-primary-container text-inverse-on-surface` → `bg-primary-container text-on-primary`.
- Mobile menu `bg-inverse-surface` → `bg-surface-container-lowest`; `border-t border-inverse-on-surface/5` → `border-t border-outline-variant`.
- **Dead links fix:** `navLinks` currently `[Product (#), Features (#features), Pricing (#pricing), Docs (#)]`. Replace with `[{ label: "Features", href: "#features" }]` only (FeatureGrid has `id="features"`). Remove Product/Docs/Pricing (no real destinations). Keep Sign in (`/sign-in`) + Get Started (`/sign-up`) CTAs.

### 3. `src/components/landing/LandingHero.tsx`
- `bg-inverse-surface` → `bg-surface`; headline `text-inverse-on-surface` → `text-on-surface`; subtitle `text-inverse-on-surface/70` → `text-on-surface-variant`.
- Primary CTA `bg-primary-container text-inverse-on-surface` → `bg-primary-container text-on-primary`.
- **Dead control fix:** the dead `<button>Watch Demo</button>` (no demo exists) → replace with a real secondary CTA: `<Link href="/sign-in">` styled `border border-outline-variant text-on-surface hover:bg-surface-container-low rounded-xl px-8 py-3.5 font-medium text-base`, label "Sign in", with `IconArrowForward` or none.
- **Copy rewrite:**
  - H1: "Capture, understand, and act on every meeting" (gradient span on "with NeuraMeet AI" using existing `bg-gradient-to-r from-primary-container to-primary`).
  - Subtitle: "NeuraMeet records your calls, transcribes them in English and Urdu, and turns each conversation into summaries, action items, attendance, and a searchable history — automatically."
- **Mockup retoken (was dark):** wrapper `bg-inverse-surface/80` → `bg-surface-container-low`; content `bg-inverse-surface/50` → `bg-surface-container`; sidebar + stat cards `bg-inverse-on-surface/5` → `bg-surface-container-low`; card accents `bg-primary-container/20|30` → `bg-primary-container/15`. Browser-chrome dots `bg-error/80` (keep), `bg-yellow-500/80` → `bg-outline-variant`, `bg-green-500/80` → `bg-secondary-container` (removes raw Tailwind colors). Glow `bg-primary-container/15` stays.

### 4. `src/components/landing/FeatureGrid.tsx`
- `bg-inverse-surface` → `bg-surface`; cards `bg-inverse-on-surface/5 border-inverse-on-surface/10` → `bg-surface-container-lowest border border-outline-variant`; headings/desc `text-inverse-on-surface*` → `text-on-surface` / `text-on-surface-variant`.
- Icon circle `bg-primary-container/10 border border-primary-container/20` is token+opacity — keep.
- Keep `id="features"`. Grid `md:grid-cols-3` → `md:grid-cols-2 lg:grid-cols-3` (6 cards).
- **Copy: replace the 3 fake features with 6 REAL features:**
  1. `IconFileText` — "AI Transcript Generation" — "Recordings are transcribed automatically in English and Urdu, with speaker labels and timestamps."
  2. `IconSparkles` — "Meeting Intelligence" — "Every meeting gets an AI summary, the key decisions, and a category — generated the moment it ends."
  3. `IconListChecks` — "Action Items & Follow-ups" — "Action items are pulled out and turned into follow-ups you can track and mark complete."
  4. `IconUsers` — "Attendance Reports" — "Download a per-participant attendance PDF — join, leave, mic, and camera activity in one clean report."
  5. `IconMessageChatbot` — "Meeting-Aware RAG Chat" — "Ask questions about any meeting and get answers grounded in its transcript, not generic guesses."
  6. `IconSearch` — "Cross-Meeting Search & Prep" — "Search across every meeting at once, and get prep briefings drawn from your past conversations."
- Section heading: "Everything you need to run smarter meetings"; subtitle: "Real AI working behind every call — from the first word to the follow-up."

### 5. `src/components/landing/SocialProof.tsx` → rework into "How it works"
- **Replace fabricated testimonials** (Sarah Jenkins, etc. — not real) with a 3-step walkthrough (content swap, same section slot, no new section).
- `bg-inverse-surface` → `bg-surface`; cards `bg-inverse-on-surface/5 border-inverse-on-surface/10` → `bg-surface-container-lowest border border-outline-variant`; text `text-inverse-on-surface*` → `text-on-surface` / `text-on-surface-variant`.
- Heading: "From call to clarity in three steps".
- Steps (icon + title + description):
  1. `IconVideo` — "Host or join a meeting" — "Start a call in NeuraMeet or join with a link. Video runs on Stream's real-time infrastructure."
  2. `IconSparkles` — "We process it automatically" — "Groq Whisper transcribes the audio (English + Urdu); Gemini and Groq generate the summary, action items, and category."
  3. `IconSearch` — "Explore and act" — "Browse a searchable history, download attendance, track follow-ups, and chat with any meeting's content."

### 6. `src/components/landing/AiArchitecture.tsx`
- `bg-inverse-surface` → `bg-surface`; stat card `bg-inverse-on-surface/5 border-inverse-on-surface/10` → `bg-surface-container-lowest border border-outline-variant`; text `text-inverse-on-surface*` → `text-on-surface` / `text-on-surface-variant`; progress `bg-inverse-surface` track → `bg-surface-container`.
- **Copy rewrite (drop unbuilt claims):**
  - Heading: "Built on a modern, private AI stack".
  - Body: "NeuraMeet runs on Gemini and Groq for transcription and summarization, with Supabase pgvector powering semantic search across your meetings. Your data stays in your own Supabase project — no proprietary model is trained on your calls."
  - Checks: "Transcription in English and Urdu with speaker labels." / "Semantic search over every meeting using pgvector embeddings." / "Runs entirely on free-tier AI — no enterprise contract required."
  - **Right card:** replace the fabricated "+45% Meeting Efficiency" stat + progress bar with a "Powered by" card listing real stack as chips: `Gemini` · `Groq` · `Supabase pgvector` · `Stream` · `Clerk` (each a `bg-primary-container/10 text-primary-container rounded-full px-3 py-1 text-sm` chip). Keep the decorative glow `bg-primary-container/15`.

### 7. `src/components/landing/EnterpriseGrid.tsx` → "Built on a modern stack"
- `bg-inverse-surface` → `bg-surface`; items `bg-inverse-on-surface/5 border-inverse-on-surface/10` → `bg-surface-container-lowest border border-outline-variant`; text `text-inverse-on-surface*` → `text-on-surface` / `text-on-surface-variant`; icon `text-primary-container` (keep).
- **Rewrite — drop SOC2 / 99.9% uptime / global edge / 50+ integrations / RBAC / SSO.** Heading: "A modern stack you can trust"; subtitle: "Every part of NeuraMeet is built on proven, free-tier infrastructure."
- 4 real items:
  1. `IconVideo` — "Stream" — "Real-time video meetings, recording, and reactions."
  2. `IconSparkles` — "Gemini + Groq" — "Speech-to-text and AI summarization on the free tier."
  3. `IconDatabase` — "Supabase + pgvector" — "Your meeting data and vector search, in Postgres."
  4. `IconShieldCheck` — "Clerk" — "Secure authentication and user management."
- Grid can stay `md:grid-cols-2 lg:grid-cols-3` (4 items flow fine) or `lg:grid-cols-4`; use `sm:grid-cols-2 lg:grid-cols-4`.

### 8. `src/components/landing/MeetingHistory.tsx`
- Section `bg-inverse-surface` → `bg-surface`; section heading/body `text-inverse-on-surface*` → `text-on-surface` / `text-on-surface-variant`; bullet title `text-inverse-on-surface` → `text-on-surface`; bullet desc `text-inverse-on-surface/70` → `text-on-surface-variant`.
- Browser wrapper `bg-inverse-on-surface/80` → `bg-surface-container-low`; chrome `bg-inverse-surface` → `bg-surface-container`; content already `bg-surface-container-lowest` (keep).
- **Raw-color fix (token violation):** category badges `bg-blue-100 text-blue-600` → `bg-secondary-container text-on-secondary-container`; `bg-orange-100 text-orange-600` → `bg-primary-container/15 text-primary-container`. (Sprint Planning already `bg-primary-container/20 text-primary-container` — keep.)
- **Raw-color fix:** traffic-light dots `bg-yellow-500/80` → `bg-outline-variant`, `bg-green-500/80` → `bg-secondary-container` (keep `bg-error/80` red).
- Copy: heading "Your meeting history, organized and searchable" (keep); bullets (Universal Search / Smart Filtering / Instant Insights) are real — keep, minor tighten.

### 9. `src/components/landing/LandingCTA.tsx`
- `bg-inverse-surface` → `bg-surface`; heading `text-inverse-on-surface` → `text-on-surface`; body `text-inverse-on-surface/70` → `text-on-surface-variant`; button `bg-primary-container text-inverse-on-surface` → `bg-primary-container text-on-primary`. Glow `bg-primary-container/10` stays.
- **Copy:** heading "Ready to make your meetings work harder?"; body "Start for free — record a meeting, and NeuraMeet handles the notes, follow-ups, and search." (drop "Join thousands of teams").

### 10. `src/components/landing/LandingFooter.tsx`
- `bg-inverse-surface` → `bg-surface`; all `text-inverse-on-surface*` → `text-on-surface` / `text-on-surface-variant`; social icons `text-inverse-on-surface/40` → `text-on-surface-variant`; `Soon` tag `text-inverse-on-surface/30` → `text-on-surface-variant/60`.
- Keep the existing `active`/`Coming soon` muted-link structure from A7 (only `Features` `#features` is live).
- Copyright "© 2024 NeuraMeet Inc." → "© 2026 NeuraMeet Inc." Description copy ("AI-powered meeting intelligence for modern teams…") is accurate — keep.

## Verification
- `npx tsc --noEmit` clean.
- `npm run build` exits 0.
- Grep guard: `grep -rn "bg-inverse-surface\|text-inverse-on-surface\|yellow-500\|green-500\|blue-100\|orange-100\|blue-600\|orange-600" src/components/landing src/app/\(landing\)` returns nothing.
- `npm run dev` → load `/`: page reads as part of the same light system as Dashboard/Meeting Intelligence; copy reflects only real, shipped features; no dark shell, no raw colors.

## Follow-up (after build, per project rules)
- Update `context/ui-tokens.md` invariant (line 143) to remove "Landing page hero/nav/footer stay dark (inverse-surface) throughout" — landing is now light.
- Update `context/ui-registry.md` "Landing Page Patterns" table + "Landing Component Details" section to reflect the light token mappings.
- Update `context/progress-tracker.md` P1 entry → ✅ with a one-line summary.
- (End-of-session) `/remember save` to capture P1 closure.
