# Scope: NeuraMeet

NeuraMeet is an AI integrated meeting platform. Users create or join real time video meetings, upload or auto generate transcripts, and get AI summaries, action items, categories, and a meeting aware chat over every meeting. This scope restructures the plan. The already built Steps 0 to 9 become the Core NeuraMeet Pipeline. A new Advanced Pipeline Features phase adds three layers. Deploy moves to the end, after the advanced work.

**Build approach:** Extend (add features to the working Core Pipeline without re architecting).
**Workflow:** Beta (after develop: check verify, then test). Any feature can carry its own tag to do more or less.

**Hard rule:** every third party tool used anywhere in this project, including new features, must be zero cost. No paid API, no paid vector DB, no paid PDF service, no paid host beyond the free tiers already in use (Supabase, Gemini, Groq, Vercel, Stream, Clerk).

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit._

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| A | Auth and app shell | Core Pipeline | existing |
| B | Meeting lifecycle | Core Pipeline | existing |
| C | Supabase and AI provider foundation | Core Pipeline | existing |
| D | Upload transcript to AI processing | Core Pipeline | existing |
| E | Meeting intelligence UI | Core Pipeline | existing |
| F | RAG embeddings and AI chat | Core Pipeline | existing |
| G | Follow ups | Core Pipeline | existing |
| H | Recordings library and settings | Core Pipeline | existing |
| I | Playwright E2E regression | Core Pipeline | existing |
| 1 | App wide UI audit for dead or non functional controls | Advanced L1 | planned |
| 2 | Settings: AI auto summary on upload toggle | Advanced L1 | planned |
| 3 | Settings: email notifications toggle | Advanced L1 | planned |
| 4 | Settings: desktop reminders toggle | Advanced L1 | planned |
| 5 | Remaining dead or non functional UI from audit | Advanced L1 | planned |
| 6 | Auto attendance capture and storage | Advanced L2 | planned |
| 7 | Attendance PDF report per meeting | Advanced L2 | planned |
| 8 | Cross meeting semantic search | Advanced L3 | planned |
| 9 | Meeting prep suggestions from past meetings | Advanced L3 | planned |
| 10 | Per speaker engagement insights | Advanced L3 | planned |
| 11 | Deploy and harden | Deploy | planned |
| 12 | General AI chat page | FYP Polish | done |
| 13 | Change category write path | FYP Polish | done |
| 14 | Groq date normalization guard | FYP Polish | done |
| 15 | AI provider quota pre demo check | FYP Polish | done |

## Core NeuraMeet Pipeline (existing, built)

These features were built before this workflow began. They are enrolled here for context and are not changed by this scope. Status is existing, not done. The earlier Step numbers map here one to one: Step 0 and Step 0.5 are A and B, Steps 1 to 8 are C through H, Step 9 is I.

### A. Auth and app shell · existing
Clerk sign in and sign up, middleware route protection, landing page, dashboard shell, sidebar and navbar. Code in `src/app`, `src/components`, `src/middleware.ts`, Clerk config.

### B. Meeting lifecycle · existing
New, Join, and Schedule meeting modals, Meeting Setup device and mic checks, Meeting Room with grid and speaker layouts, and Previous, Upcoming, Recording, and Personal Room pages. Stream Video SDK powers the calls. Code in `src/components`, `src/actions/stream.actions.ts`, `src/Providers`.

### C. Supabase and AI provider foundation · existing
Supabase project with Postgres and pgvector, schema for meetings, transcripts, meeting chunks, action items, follow ups, and meeting categories, the match meeting chunks RPC, and the Gemini primary plus Groq fallback model setup. Free tier only. Code in `supabase/schema.sql`, `src/lib/supabase-client.ts`, `src/lib/supabase-server.ts`, `src/agent/models.ts`.

### D. Upload transcript to AI processing · existing
Upload transcript, then extract summary, key points, decisions, category, and action items with the AI SDK. Writes to meeting insights and action items. Code in `src/app/api/transcript/upload/route.ts`, `src/app/api/ai/process/route.ts`, `src/components/UploadTranscriptModal.tsx`.

### E. Meeting intelligence UI · existing
Meeting list page and the selected meeting detail with tabs Overview, Summary, Action Items, Recording, Category, and AI Chat. Code in `src/app/(root)/(home)/meeting-intelligence`, `src/components/meeting-intelligence`.

### F. RAG embeddings and AI chat · existing
Chunk and embed transcripts into meeting chunks with Gemini embeddings, then a meeting scoped streaming chat that retrieves the top chunks. Code in `src/agent/embed.ts`, `src/agent/rag.ts`, `src/app/api/ai/embed/route.ts`, `src/app/api/ai/chat/route.ts`, `src/components/meeting-intelligence/ChatPanel.tsx`.

### G. Follow ups · existing
Auto generate follow up rows from action items, list and detail pages, and a status update server action. Code in `src/actions/follow-ups.ts`, `src/app/api/follow-ups`, `src/components/follow-ups`.

### H. Recordings library and settings · existing
Recordings library page linking each recording to its meeting, and a Settings page with three inline toggles stored in localStorage. Code in `src/components/RecordingPage.tsx`, `src/components/SettingsPage.tsx`, `src/app/(root)/(home)/settings/page.tsx`.

### I. Playwright E2E regression · existing
Final regression pass, 25 of 25 tests green. Code in `tests/e2e.spec.ts`, `tests/auth.setup.ts`, `playwright.config.ts`.

## Advanced Pipeline Features, Layer 1: UI functionality audit and repair

Find every dead or non functional piece of UI in the app and make it work. The three Settings toggles are the known example. Build one item per step, in the order below. This layer promotes the Settings toggles item that was a placeholder in the old Step 9.5.

### 1. App wide UI audit for dead or non functional controls · planned
Walk every page and component, list controls that do nothing or silently fail, and record what each should do. The three Settings toggles are the known case.
**Done when:** a written list of dead or non functional UI exists, with one line on the intended behavior of each.
- [ ] Audit every page and component, then record the list: `/develop app wide UI audit`

### 2. Settings: AI auto summary on upload toggle · planned · needs a decision
Make the AI auto summary on upload toggle actually gate the process and embed calls in `UploadTranscriptModal`.
**Done when:** with the toggle off, upload stores the transcript but skips AI processing and embedding; with it on, the full pipeline runs as today.
- [ ] Design it (spec): `/architect settings AI auto summary toggle`

### 3. Settings: email notifications toggle · planned · needs a decision
Give the email notifications toggle a real effect, scoped to what the app can do on free tiers.
**Done when:** the toggle changes observable behavior (for example opting in or out of a follow up or meeting notification path) and persists per user.
- [ ] Design it (spec): `/architect settings email notifications toggle`

### 4. Settings: desktop reminders toggle · planned · needs a decision
Give the desktop reminders toggle a real effect on free tier only, no paid service.
**Done when:** the toggle changes observable behavior and persists per user.
- [ ] Design it (spec): `/architect settings desktop reminders toggle`

### 5. Remaining dead or non functional UI from audit · planned
Fix each further dead or non functional control the audit in feature 1 finds, one item per step. This row grows as the audit lands.
**Done when:** every item from the audit list has a working control or a documented decision to drop it.
- [ ] Design it (spec): `/architect remaining audit fixes`

## Advanced Pipeline Features, Layer 2: Auto Attendance

Track what each participant does during a live meeting using the Stream Video SDK already in use, at zero cost. Store the events in Supabase and produce a downloadable PDF report per meeting.

### 6. Auto attendance capture and storage · planned · needs a decision
Capture participant join, leave, mic, and camera events during live meetings through the Stream Video SDK. Store one attendance session per join per participant in Supabase. No new paid tool.
**Done when:** for a live meeting, join, leave, mic toggle, and camera toggle events are recorded per participant and survive in Supabase; a query can rebuild each join session.
- [ ] Design it (spec): `/architect auto attendance capture and storage`

### 7. Attendance PDF report per meeting · planned · needs a decision
Generate a downloadable PDF report per meeting, one row per join session per participant with email, join time, leave time, talk time, and mic and camera toggle counts. Reachable from the meeting Overview tab. The PDF library must be free and zero cost.
**Done when:** from a meeting Overview tab, a user can download a PDF listing every join session per participant with the required columns, produced with a zero cost library.
- [ ] Design it (spec): `/architect attendance PDF report`

## Advanced Pipeline Features, Layer 3: AI engagement intelligence

Three AI packed features that reuse the existing Gemini, Groq, and pgvector setup. No new paid tool.

### 8. Cross meeting semantic search · planned · needs a decision
Let a user search across all their meetings by meaning, not just keywords, using the existing embeddings and pgvector.
**Done when:** a search box returns ranked meeting chunks or meetings across the user's meetings by semantic similarity, using existing embeddings.
- [ ] Design it (spec): `/architect cross meeting semantic search`

### 9. Meeting prep suggestions from past meetings · planned · needs a decision
Before a meeting, surface related past meetings and prep notes drawn from them using the existing AI and embeddings.
**Done when:** a user can open prep suggestions for an upcoming or new meeting, built from related past meetings via embeddings and Gemini or Groq.
- [ ] Design it (spec): `/architect meeting prep suggestions`

### 10. Per speaker engagement insights · planned · needs a decision
Show how engaged each speaker was, using transcript chunks, attendance, and the existing AI setup.
**Done when:** a user can view per speaker engagement metrics for a meeting, computed from existing data with Gemini or Groq, no paid tool.
- [ ] Design it (spec): `/architect per speaker engagement insights`

## Deploy

### 11. Deploy and harden · planned
Deploy to Vercel on the free tier, then verify and harden. Re-enable Clerk email verification in the Clerk Dashboard before production, since it was off for dev speed. Confirm every navigation, loading, and error path, that no secret reaches the client bundle, and that all AI and database use stays within Supabase, Gemini, and Groq free tier limits.
**Done when:** the app is live on Vercel, Clerk email verification is on, and a full path and secret check passes.
- [ ] Deploy and verify: `/develop deploy and harden`

## Deferred

Out of scope for the current build pass, kept so the plan stays honest.
- Oxylabs topic or company enrichment (stretch, needs a paid API, forbidden by the zero cost rule) · needs a decision

## Step 9.5 FYP Polish Pass

Four deferred polish items, built without a paid service. Oxylabs stays deferred because it needs a paid API. Each reuses what already exists. Decisions on the category write path (Server Action), the quota check (runnable script), and the general chat (no RAG, pure assistant) are carried in `prompts/step-9-5-polish.md`.

### 12. General AI chat page · done
A working `/ai-chat` page that streams answers with no meeting scope, reusing the existing ChatPanel. The route and the two dashboard links are dead today.
**Done when:** `/ai-chat` opens a chat page in the sidebar shell and streams a reply, and the dashboard links resolve to it.
- [x] Build it: `/develop general AI chat page`

### 13. Change category write path · done
Let the Category tab change `meeting_insights.category`, not just show it.
**Done when:** a user picks a new category on the Category tab, saves it, and it persists after reload.
- [x] Build it: `/develop change category write path`

### 14. Groq date normalization guard · done
Coerce malformed model due dates to ISO or null before insert, never blocking the pipeline.
**Done when:** a bad `dueDate` becomes null and logs, a valid `YYYY-MM-DD` passes through, and no insert throws.
- [x] Build it: `/develop groq date guard`

### 15. AI provider quota pre demo check · done
A runnable script that probes Gemini and Groq and prints which is live, for the pre demo check.
**Done when:** `npm run check:providers` reports both providers status with zero cost.
- [x] Build it: `/develop provider quota check`

## Constraints

- Every third party tool in this project, including new features, must be zero cost. No paid API, paid vector DB, paid PDF service, or paid host beyond the free tiers already in use.
- Reuse the existing Gemini primary plus Groq fallback setup and the existing pgvector embeddings for all new AI features. Do not add a second AI provider or vector store.
- Keep the architecture: UI shows data only, server actions handle UI mutations, API routes own AI and agent work, all keys and AI calls stay server side.

## Legend

The decision box. Every feature carries exactly one sub task whose label ends with (spec). That is the entry point for `/architect`. Every other box is execution. The next step is always the first unticked box. Features tagged needs a decision run `/architect` first. Atomic build tasks live in the spec, not here.
