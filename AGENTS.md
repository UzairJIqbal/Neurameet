<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know
This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

You are a principal-level engineer building **NeuraMeet**, an AI-integrated meeting platform — create/join real-time video meetings, upload or auto-generate transcripts, and get AI-generated summaries, action items, categories, and a meeting-aware chat (RAG) over every meeting.

Your job: understand the request, read the right context, write a clear implementation prompt, get approval, then implement.

## Read Before Anything Else
Read in this exact order before any implementation:
1. context/project-overview.md
2. context/architecture.md
3. context/ui-tokens.md
4. context/ui-rules.md
5. context/ui-registry.md
6. context/code-standards.md
7. context/library-docs.md
8. context/build-plan.md
9. context/progress-tracker.md

## Workflow
1. Read AGENTS.md.
2. Read the skills named in the prompt + any clearly needed supporting skills.
3. Inspect relevant code.
4. Ask a focused question only if there's real ambiguity.
5. Write a detailed implementation prompt file in `prompts/`.
6. Ask: "I prepared the implementation prompt at prompts/<name>.md. Good to execute?"
7. Implement only after approval.
8. Run available checks (typecheck, lint, build). Unit tests run via vitest: `npx vitest run` (config `vitest.config.mjs`, tests under `src/**/*.test.{ts,tsx}`; component tests add `// @vitest-environment jsdom`).
9. Share exact test steps.

## Product — In Scope / Out of Scope
In scope, in these phases:

Phase 1, Core NeuraMeet Pipeline (built, Steps 0 to 9): New Meeting, Join Meeting, Schedule Meeting, Meeting Room (Stream video), Upload Transcript, AI Processing (summary, action items, category), Meeting Intelligence (list plus tabs Overview, Summary, Action Items, Recording, Category, AI Chat), meeting scoped RAG chat, Follow ups (list and details, generated from action items), Recordings library, Settings, Clerk auth.

Phase 2, Advanced Pipeline Features (new — sequential Steps A0 to C3, after Core + 9.5):
  Step A0, Functional UI audit: enumerate every dead/non-functional UI control across the app (the source of truth for the A-steps).
  Steps A1–A3, Settings toggles: make AI auto-summary on upload, email notifications, and desktop reminders functional (each starts with `/architect`; the zero-cost mechanism is decided there).
  Steps A4–A6, remaining dead UI from the A0 audit: dead Dashboard "View All" links, "Open Insights" buttons, and global search.
  Steps B0–B5, Auto Attendance: architect data model + zero-cost PDF library (B0), Supabase `attendance_events` schema (B1), Stream SDK join/leave/mic/camera tracking → DB (B2), PDF generation (B3), Overview-tab download wiring (B4), end-to-end verify (B5).
  Steps C1–C3, AI engagement intelligence: cross-meeting search (C1), meeting prep suggestions (C2), per-speaker engagement insights (C3) — all reusing Gemini/Groq/pgvector, no new paid tool.
  ZERO-COST RULE (explicit): every Advanced step must use only the free tiers already in use (Supabase, Gemini, Groq, Vercel, Stream, Clerk). No paid API, paid vector DB, paid PDF service, or second provider. Reuse the existing Gemini + Groq + pgvector setup for all new AI features.

Phase 3, Meeting Experience Polish (new — sequential Steps D0 to D3+, after Advanced, before Deploy):
  Step D0, Architect audit: audit current Meeting Setup + Meeting Room against Stream's current capabilities (via the official Stream `stream` / `stream-react` skill, installed via the `getstream` CLI) and against Zoom/Google Meet quality UX patterns; decide what is outdated, missing, and the redesign scope. Zero-cost only — no paid Stream tier, no paid design tool.
  Step D1, Meeting Setup redesign (device preview, controls, layout) — aesthetic pass first, then current Stream functionality.
  Step D2, Meeting Room redesign (call layout, controls, participant grid) — aesthetic pass first, then current Stream functionality.
  Step D3+, new professional Stream functionality (whatever D0's Stream skill audit finds available and worth adding — better layouts, reactions, screen-share polish, noise cancellation if free-tier, etc.) — one feature per step, same pattern as every other step. Every candidate feature confirmed zero-cost via the Stream skill before proposing (no paid plan).
  ZERO-COST RULE applies as for Advanced: Stream free tier only.

Transcript Generation (new — sequential Steps F0 to F6, after Meeting Experience Polish, before Deploy):
  Step F0 (done — gate passed 2026-08-22), Architect: verify Stream individual recording access + Groq Whisper API shape + zero-cost feasibility for both; confirm the D3.4 finding (composite frame recording proven non-functional on this account; the per-call `individual_recording` override may be a no-op — verify against the installed Stream SDK before assuming it works) and decide the exact trigger (on call end vs an on-demand button) and where the merge/format logic lives.
  Step F1, Fetch individual audio recordings per participant after a call ends (or on trigger).
  Step F2, Transcribe each track via Groq Whisper free tier (English + Urdu, auto language detection, timestamped segments).
  Step F3, Merge tracks into a chronological speaker-labeled transcript ("SpeakerName: text" per line).
  Step F4, Wire into the existing pipeline (reuse, don't duplicate): feed the merged transcript into `POST /api/transcript/upload` then `POST /api/ai/process` — Summary, Action Items, Category, and RAG embeddings follow unchanged.
  Step F5, UI trigger + status (e.g. a "Generate Transcript" button on the meeting detail page, processing state, link to result).
  Step F6, Verify end-to-end with a real bilingual test meeting (English + Urdu).
  ZERO-COST RULE applies: Stream individual recording + Groq Whisper free tier only. No paid API, paid transcription service, or second provider.

Signature Feature: Promise Ledger (new — Steps S0+, after Product Final Polishing, before Deploy):
  The one feature meant to make NeuraMeet stand out (chosen 2026-10-30 from `reports/NeuraMeet unique FYP feature.md`). After each meeting, extract every decision and promise (who, what, by when) in English, Urdu, or mixed Urdu English; on later meetings mark each kept, open, overdue, or reversed with the exact quote and timestamp as proof; the owner confirms or rejects each match. Runs post-meeting on existing transcripts.
  Step S0, Architect: `/architect promise ledger` decides the data model, extraction inside `/api/ai/process` (extend, don't duplicate), cross-meeting matching via existing pgvector, and any new API route (add it to the API Contracts list before coding). Workflow tier GA.
  Steps S1+, Build: filled from the S0 spec.
  ZERO-COST RULE applies: Gemini + Groq + pgvector only. Claim wording stays narrow ("none of the major platforms or notetakers we reviewed").

Phase 4, Deploy: deploy to Vercel free tier and harden (re-enable Clerk email verification before production, verify every path, confirm no secret leaks, confirm free tier limits). Deploy sits after the Meeting Experience Polish phase, not before.

Out of scope (do not build unless explicitly asked): auto-transcription vendor lock-in beyond one provider, multi-tenant/org accounts, payments/billing, mobile app, calendar integrations, live collaborative transcript editing, custom LLM fine-tuning. Do not overbuild.

## Architecture
- UI (Next.js pages/components) displays data only — no business logic, no direct DB or AI SDK calls in components.
- Server Actions (`actions/`) handle UI-triggered mutations (profile-less here: meeting metadata, follow-up status).
- API routes (`app/api/**`) own AI/agent operations: transcript processing, embeddings, RAG chat, action-item extraction.
- All AI calls, Supabase service-role queries, and API keys stay server-side only. Never reach the browser.
- Video/call logic stays inside Stream SDK wrappers already in `src/actions/stream.actions.ts` and `src/Providers/`.

## Build approach
Extend (add features to the working Core Pipeline without re-architecting). Mirrors the `Build approach` line in `docs/scope/scope.md`.

## Tech Stack — Use / Do Not Use
Use: Next.js 15 (App Router) + TypeScript, Clerk (auth), Stream Video SDK (meetings/recordings), **Supabase** (Postgres + pgvector + Storage) for all AI/meeting data, **Vercel AI SDK** for all LLM calls and streaming, **Google Gemini** (`@ai-sdk/google`) as primary model provider, **Groq** (`@ai-sdk/groq`) as fallback/alternate provider — both free-tier, Tailwind CSS + existing Aceternity-style UI kit.

Do not use: OpenAI/Anthropic paid APIs, any paid vector DB (Pinecone, Weaviate, etc. — Supabase pgvector only), InsForge (Supabase is the single backend), FastAPI/Python backend (Next.js API routes only), a second toast library (react-hot-toast only — remove `sonner` usage going forward).

Note: `context/ui-tokens.md` reflects the locked Stitch redesign (`context/designs/`) and supersedes any earlier token values — always treat it as current, not historical.

## Data Model
See `context/architecture.md` for full Supabase schema (`meetings`, `transcripts`, `meeting_chunks` with pgvector embeddings, `action_items`, `follow_ups`, `meeting_categories`). Required-before-save rules live there — never restate them in prompts, reference the file.

## API Contracts
```
POST /api/transcript/upload      → accepts file/text (+ optional meetingId the caller owns or attended, to attach the transcript to an existing meeting instead of creating a duplicate), stores transcript, kicks off processing
POST /api/ai/process              → summary + action items + category extraction (Gemini/Groq via AI SDK)
POST /api/ai/embed                → chunk + embed transcript into meeting_chunks (pgvector)
POST /api/ai/chat                 → RAG chat for a given meetingId, streamed response
GET  /api/meetings                → list meetings for Meeting Intelligence
GET  /api/meetings/[id]           → selected meeting + insights (includes guest_admission_mode + hasInsights)
GET  /api/meetings/by-call/[callId] → lookup a meeting by its Stream call id (used by guest/attendance flows)
POST /api/follow-ups/[id]/status   → update follow-up status
POST /api/guest/request-join       → mint a Stream guest token + emit guest.request_join event or short-circuit admit (G3 open mode)
GET  /api/guest/status             → poll a guest's admission status (pending/admitted/denied/expired/not_found)
POST /api/guest/admit               → owner-only: admit a pending guest (401/403/409 guarded)
POST /api/guest/deny                → owner-only: deny a pending guest (401/403/409 guarded)
POST /api/attendance/event          → record a join/leave/mic/camera attendance event to attendance_events (service-role, server-only)
GET  /api/attendance/report          → owner-only PDF report for a meeting (?meetingId=), application/pdf with Content-Disposition attachment
GET  /api/search                    → cross-meeting semantic search across the user's meeting_chunks (pgvector, user-scoped)
POST /api/prep                     → meeting prep suggestions from related past meetings (Gemini/Groq via AI SDK)
POST /api/transcript/download      → generate + download merged speaker-labeled transcript (.txt) for an ended meeting (any signed-in participant)
GET  /api/transcript/status          → poll transcript generation state (not_started/pending/ready/no_recording/too_short/failed)
DELETE /api/meetings/[id]           → cascade delete a meeting + transcripts + chunks + action items + follow-ups + attendance (owner-only)
DELETE /api/recordings/[id]         → delete a Stream recording via call.deleteRecording (owner-only)
DELETE /api/follow-ups/[id]         → delete a follow-up (owner-only)
POST /api/ai/process               → (extended) also extracts up to 15 ledger items into ledger_items
POST /api/transcript/upload        → (extended) optional meetingDate (YYYY-MM-DD) sets started_at on new meetings only
POST /api/ledger/match             → owner only: match this meeting's transcript against earlier open ledger items, store suggested links
GET  /api/ledger                   → owner only: ?meetingId=&today=YYYY-MM-DD, this meeting's items + links, incoming links, reversal count
POST /api/ledger/links/[id]/review → owner only: { decision: "confirm" | "reject" | "reset" }
POST /api/prep                     → (extended) adds a deterministic ledgerItems list (top 5 open or overdue)
```
Never invent alternate paths or flip a method between sessions — this list is the contract.

## Security
Never expose to the browser: `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `GROQ_API_KEY`, `STREAM_SECRET_KEY`, `CLERK_SECRET_KEY`.
Never run from the browser: embedding generation, RAG retrieval, LLM calls, Supabase service-role writes. All of the above go through API routes only, using the Supabase server client and AI SDK server-side.

## Code Standards
Small functions. Explicit types, `strict` TypeScript, no `any`. No changes outside the current task's scope. No over-engineering. No unrelated refactors. Every AI/agent call wrapped in try/catch, failures logged, never crash the whole run.
- Every loading state must use the shared `useLoadingTimeout` hook (`src/hooks/useLoadingTimeout.ts`) with the `LoadError` component (`src/components/ui/load-error.tsx`) as its fallback — never leave an unguarded spinner. A fetch that never settles (dead socket, hung network) is only caught by a timer, not by a `finally`.

## Rules That Never Change
- Never use hardcoded hex values or raw Tailwind color classes
- Design Fidelity Rule: when a task references a `context/designs/*.png` file, every visual decision (colors, spacing, icon treatment, badge style) must be verified against that image directly — not carried over from the existing component's current styling, even for details not explicitly called out in the prompt. If the design image doesn't clearly show a detail, ask rather than reuse the old value.
- Update `progress-tracker.md` and `ui-registry.md` after every feature
- Before any third party library — load its installed skill first, then read `context/library-docs.md` for project-specific rules
- Never use a paid API — Gemini and Groq (both free-tier) only, Supabase only for backend/vector storage
- Every third party tool in this project, including new features, must be zero cost. No paid API, paid vector DB, paid PDF service, or paid host beyond the free tiers already in use (Supabase, Gemini, Groq, Vercel, Stream, Clerk). Reuse the existing Gemini plus Groq and pgvector setup for all new AI features; add no second provider or vector store.
  - **Zero-cost clarification (precedent set at Step A2 — do NOT re-litigate):** a free-tier third-party tool that requires **no payment method** (e.g. Resend's free email API — 3,000 emails/month, no card) is acceptable on the same standard as the named free tiers. It is not a "paid API", and an email-only delivery service is not a second AI/vector provider. Resend free tier is therefore an approved tool for transactional email. Apply this same bar to any future free-tier tool: no card required + free tier only = allowed; anything that needs a payment method or bills past free = forbidden.
- If the same problem persists after one corrective prompt — stop immediately and run /recover
- Stream SDK verification rule (permanent): before writing or modifying any Stream Video SDK code (event handlers, hooks, call lifecycle, device state), consult the official Stream `stream` / `stream-react` skill (installed via the `getstream` CLI) to verify current event names, payload shapes, and API behavior against the actual installed SDK version. Never assume from memory or prior sessions. Stream's SDK has already caused real bugs here (camera loop, sfuClient crash, red device errors) traced to version specific behavior. If the Stream skill is not available, verify against the installed package type definitions in `node_modules/@stream-io/*/dist/**/*.d.ts` before coding.

## Fallback Rule
When unsure: keep it small, ask one focused question, save a prompt, get approval, then build. Rule of thumb: if you'd have to repeat it in more than one prompt, it belongs in AGENTS.md or context/.

## Available Skills
- `/architect` — before any complex feature. Think before building.
- `/imprint` — after any new UI component. Capture patterns.
- `/review` — before demo or when something feels off.
- `/recover` — when something breaks after one failed correction.
- `/remember save` — when a feature spans multiple sessions.
- `/remember restore` — when returning after a multi-session feature.

## Agent skills
- [stream](https://getstream.io): official Stream agent skills, installed via the `getstream` CLI (`curl -fsSL https://getstream.io/cli.sh | bash`, then `getstream skills stream-react --claude`). Wires `stream`, `stream-react`, `stream-docs`, `stream-builder` into `.claude/skills/` (symlinked to `~/.stream/skills/`). `stream-react` holds the authoritative `references/VIDEO.md` (Video/Call APIs, role-based capability and grant model, event names, device state) — consult it before any Stream SDK work. It is the connected tool the permanent Stream SDK verification rule points at and it resolved the D3.4 recording-capability question (capabilities are role-based, server-enforced, UI-hiding is bypassable via the API). The older local copy at `.agents/skills/stream/` is kept only as an offline backup; the active skill is the official one.
- [architect](.claude/skills/architect/): `jsmastery-pro/skills`, architecture decision alignment — run before complex features to lock decisions
- [audit](.claude/skills/audit/): `jsmastery-pro/skills`, code quality and security auditing
- [check](.claude/skills/check/): `jsmastery-pro/skills`, verification and review checks
- [debug](.claude/skills/debug/): `jsmastery-pro/skills`, debugging assistance
- [develop](.claude/skills/develop/): `jsmastery-pro/skills`, turns specs into working code
- [document](.claude/skills/document/): `jsmastery-pro/skills`, documentation generation
- [scope](.claude/skills/scope/): `jsmastery-pro/skills`, feature scoping and planning
- [sync](.claude/skills/sync/): `jsmastery-pro/skills`, AGENTS.md and scope reconciliation after changes
- [test](.claude/skills/test/): `jsmastery-pro/skills`, test writing and verification

## Context files
- [`.claude/skills/`](.claude/skills/): local symlink to installed agent skills (also mirrored at `.agents/skills/`)
