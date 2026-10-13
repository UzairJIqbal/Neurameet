# Implementation Prompt — Step P2: Sign-in/Sign-up Walkthrough Panel

**Branch:** `fix/graceful-degradation-g1-g2`
**Status:** Approved blueprint (architect session confirmed 2026-08-26)

## Goal
Replace the fabricated testimonial in the dark right panel of `AuthLayout` with a 3-step visual
walkthrough, reusing the exact approved copy from the landing "How it works" section. Keep the
40/60 split, the dark panel, and its abstract blur + grid background. Sign-in and sign-up get
tailored intro framing but share the same 3 steps.

## Locked constraints (do not deviate)
- **Token rule (ui-tokens.md:142):** right panel stays `bg-inverse-surface` (#2D303D dark),
  light left form unchanged. On-dark text uses `text-inverse-on-surface` (body) and
  `text-on-primary` (headings); accents use `primary-container`. **Never** raw hex / raw Tailwind
  color classes.
- **Real-copy rule (P1 precedent):** no fabricated testimonials, names, or stock avatars. Copy is
  reused verbatim from `src/components/landing/SocialProof.tsx` (the approved "How it works" 3 steps).
- **Icons:** `@tabler/icons-react` only (`IconVideo`, `IconSparkles`, `IconSearch`) — consistent
  with landing FeatureGrid + Sidebar. No `lucide-react`, no PNG.
- **Scope:** only the right-panel *content* block in `src/components/auth/AuthLayout.tsx` changes.
  No new files, no new deps, no layout overhaul.

## Approved source copy (verbatim from SocialProof.tsx)
Steps (identical for both variants):
1. icon `IconVideo`, title "Host or join a meeting",
   description "Start a call in NeuraMeet or join with a link. Video runs on Stream's real-time infrastructure."
2. icon `IconSparkles`, title "We process it automatically",
   description "Groq Whisper transcribes the audio in English and Urdu; Gemini and Groq generate the summary, action items, and category."
3. icon `IconSearch`, title "Explore and act",
   description "Browse a searchable history, download attendance, track follow-ups, and chat with any meeting's content."

Variant framing:
- **sign-up** — heading "From call to clarity in three steps",
  sub "No manual note taking. NeuraMeet does the work the moment the call ends."
- **sign-in** — heading "Welcome back",
  sub "Your meetings, notes, and follow-ups are right where you left them."

## Implementation steps
1. In `src/components/auth/AuthLayout.tsx`, replace the per-variant `testimonial` objects inside
   `variantContent` with a `walkthrough` object: `{ heading: string, sub: string, steps: Step[] }`
   where `Step = { icon: TablerIcon, title: string, description: string }`. Sign-in and sign-up
   differ only in `heading`/`sub`; `steps` is the same array (the 3 approved steps above).
   Import `IconVideo`, `IconSparkles`, `IconSearch` from `@tabler/icons-react`.
2. Replace the existing inner content block — the quote-icon `<svg>`, the `<blockquote>` quote, and
   the avatar + attribution `<div>` — with:
   - a heading: `text-on-primary font-semibold text-2xl md:text-3xl leading-tight`
   - a sub line: `text-inverse-on-surface/70 text-base mt-3`
   - a vertical 3-step list (`flex flex-col gap-6 mt-10`): each row is a `flex gap-4` with:
     - a badge: `w-12 h-12 rounded-xl bg-primary-container/10 border border-primary-container/20
       flex items-center justify-center shrink-0` containing the tabler icon
       (`className="text-primary-container" stroke={1.5} size={24}`) and optionally the step index
       `text-primary-container font-bold` beside/under it
     - a text block: step `title` as `text-on-primary font-semibold text-lg`, `description` as
       `text-inverse-on-surface/70 text-sm leading-relaxed mt-1`
3. Leave the abstract blur background `<div>` and the grid-overlay `<div>` and the panel wrapper
   (`bg-inverse-surface ... hidden md:flex ...`) exactly as they are.
4. Delete all fabricated content: the "Sarah Jenkins" / "David Chen" quotes, `name`, `role`, and
   the two `lh3.googleusercontent.com` avatar URLs. Remove the now-unused `Image` import if no
   longer referenced.
5. Keep `AuthLayoutProps` and the `children`/`variant` rendering for the left form panel unchanged.

## Verification (run after implementing)
- `npm run build` exits 0.
- `npx tsc --noEmit` is clean **except** the known pre-existing `AfterMeetingRecap.test.tsx`
  (`MeetingRecap` missing `createdAt`/`user_id`) error, which is unrelated to this change — do not
  treat it as a regression.
- `grep -rn "Sarah Jenkins\|David Chen\|lh3.googleusercontent" src/components/auth` returns nothing.
- `grep -rn "inverse-surface\|text-inverse-on-surface\|text-on-primary\|primary-container" src/components/auth/AuthLayout.tsx`
  confirms token-only styling (no raw hex / raw Tailwind color classes).
- Live render: visit `/sign-in` and `/sign-up` — both show the dark panel with the 3-step
  walkthrough; sign-up shows "From call to clarity in three steps", sign-in shows "Welcome back";
  no fabricated quote or avatar anywhere.

## Docs to update after verification
- `context/progress-tracker.md`: Step P2 → ✅ (note: dark `inverse-surface` panel retained per
  ui-tokens.md:142; reused landing "How it works" copy; tabler icons; fabricated quotes removed).
- `context/ui-registry.md`: update the AuthLayout / Sign-in/Sign-up panel entry to describe the
  walkthrough content and the token styling.

## Out of scope (do NOT build)
- No product screenshot / mockup image (would risk a fake-looking asset; real-copy rule).
- No change to the left form, the split ratio, the dark theme, or any other page.
- No new dependencies, no new API/DB/AI features.
