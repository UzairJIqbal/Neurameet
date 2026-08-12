# Progress Tracker

Updated after every feature. Current state as of this rewrite.

---

## Done

- ✅ Clerk auth (sign-in/sign-up, middleware protection — matcher paths fixed)
- ✅ Stream Video integration — `StreamClientProvider`, token provider (timestamp bug fixed)
- ✅ New Meeting / Join Meeting / Schedule Meeting modal (`MeetingModel.tsx`)
- ✅ Meeting Setup (device/mic checks, audio type selection)
- ✅ Meeting Room (grid/speaker layouts, controls, participant list, end call)
- ✅ Dashboard shell with Quick Action cards (`HomeCard`, `MeetingTypeLists`)
- ✅ Previous / Upcoming / Recording / Personal Room pages (Stream-data only, no AI yet)
- ✅ Sidebar navigation shell
- ✅ Step 3.5 — UI Redesign: App Shell (tokens, fonts, sidebar, navbar, dashboard cards)
- ✅ Landing page rebuild — matched `landing-page.html`/`landing-page.png` design: correct tokens, copy, sections (LandingNav, LandingHero, FeatureGrid, SocialProof, AiArchitecture, EnterpriseGrid, MeetingHistory, LandingCTA, LandingFooter). Deleted PricingSection, TestimonialStrip.
- ✅ Auth redirect for authenticated users — middleware `isPublicRoute` + `useAuth()` fallback
- ✅ Root layout height fix — `h-screen overflow-hidden` on `#root` div
- ✅ Auth component imprint — patterns captured in ui-registry.md
- ✅ Auth gaps fixed: sign-out button visible in sidebar, /forgot-password route created, middleware matcher updated with missing protected paths
- ✅ Step 0.5 — Auth system verification: 20/20 Playwright tests passing (protected route redirects ×9, sign-in page ×4, sign-up page ×3, forgot-password ×2, landing page, 404 handling). CAPTCHA div added to sign-in/sign-up. Email verification flow fixed: /verify-email page created with code entry + resend. Manual tests M1–M8 pending

## Pending

- ⬜ Step 0 — Bug fixes (token timestamp, toast lib, mic switch fallthrough)
- ⬜ Step 3.5 — Existing feature audit + redesign (8 features, sequential):
  1. 🟡 Meeting Room — not started
  2. 🟡 Meeting Setup — not started
  3. 🟡 New Meeting — not started
  4. 🟡 Join Meeting — not started
  5. 🟡 Previous — not started
  6. 🟡 Upcoming — not started
  7. 🟡 Recording — not started
  8. 🟡 Personal Room — not started
- ⬜ Step 1 — Supabase project + schema + pgvector
- ⬜ Step 2 — AI SDK + Gemini/Groq provider setup
- ⬜ Step 3 — Upload Transcript → AI Processing (summary, action items, category)
- ⬜ Step 4 — Meeting Intelligence UI (list + tabs)
- ⬜ Step 5 — RAG embeddings (`meeting_chunks`)
- ⬜ Step 6 — AI Chat (meeting-scoped + general, streaming)
- ⬜ Step 7 — Follow-ups (list + details, auto-generated)
- ⬜ Step 8 — Recordings library polish + Settings page
- ⬜ Step 9 — Playwright E2E regression pass (final checkpoint, not the only one)
- ⬜ Step 10 — Deploy + harden

## Key Decisions Locked

- Backend/data/vector store: **Supabase** (Postgres + pgvector) — not InsForge, not a separate vector DB
- AI models: **Gemini** (primary) + **Groq** (fallback) — both free tier, no paid APIs anywhere
- No FastAPI/Python — Next.js API routes own all AI/agent logic
- Testing: Playwright for final regression; per-feature verification at Step 0.5 and 3.5 are primary checkpoints
- Optional stretch: Oxylabs for topic/company enrichment — never blocks core flow

## Next Action

Step 0.5 complete. Next: Step 3.5 — feature audit + redesign (8 features, sequential). Start with Meeting Room. Dev server must be running for Playwright tests (`npm run dev`).
