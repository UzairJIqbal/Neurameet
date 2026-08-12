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
8. Run available checks (typecheck, lint, build).
9. Share exact test steps.

## Product — In Scope / Out of Scope
In scope: New Meeting, Join Meeting, Meeting Room (Stream video), Upload Transcript, AI Processing (summary, action items, category), Meeting Intelligence (list + tabs: Overview, Summary, Action Items, Recording, Category, AI Chat), meeting-scoped RAG chat, Follow-ups (list + details, generated from action items), Recordings library, Settings, Clerk auth.

Out of scope (do not build unless explicitly asked): auto-transcription vendor lock-in beyond one provider, multi-tenant/org accounts, payments/billing, mobile app, calendar integrations, live collaborative transcript editing, custom LLM fine-tuning. Do not overbuild.

## Architecture
- UI (Next.js pages/components) displays data only — no business logic, no direct DB or AI SDK calls in components.
- Server Actions (`actions/`) handle UI-triggered mutations (profile-less here: meeting metadata, follow-up status).
- API routes (`app/api/**`) own AI/agent operations: transcript processing, embeddings, RAG chat, action-item extraction.
- All AI calls, Supabase service-role queries, and API keys stay server-side only. Never reach the browser.
- Video/call logic stays inside Stream SDK wrappers already in `src/actions/stream.actions.ts` and `src/Providers/`.

## Tech Stack — Use / Do Not Use
Use: Next.js 15 (App Router) + TypeScript, Clerk (auth), Stream Video SDK (meetings/recordings), **Supabase** (Postgres + pgvector + Storage) for all AI/meeting data, **Vercel AI SDK** for all LLM calls and streaming, **Google Gemini** (`@ai-sdk/google`) as primary model provider, **Groq** (`@ai-sdk/groq`) as fallback/alternate provider — both free-tier, Tailwind CSS + existing Aceternity-style UI kit.

Do not use: OpenAI/Anthropic paid APIs, any paid vector DB (Pinecone, Weaviate, etc. — Supabase pgvector only), InsForge (Supabase is the single backend), FastAPI/Python backend (Next.js API routes only), a second toast library (react-hot-toast only — remove `sonner` usage going forward).

Note: `context/ui-tokens.md` reflects the locked Stitch redesign (`context/designs/`) and supersedes any earlier token values — always treat it as current, not historical.

## Data Model
See `context/architecture.md` for full Supabase schema (`meetings`, `transcripts`, `meeting_chunks` with pgvector embeddings, `action_items`, `follow_ups`, `meeting_categories`). Required-before-save rules live there — never restate them in prompts, reference the file.

## API Contracts
```
POST /api/transcript/upload      → accepts file/text, stores transcript, kicks off processing
POST /api/ai/process              → summary + action items + category extraction (Gemini/Groq via AI SDK)
POST /api/ai/embed                → chunk + embed transcript into meeting_chunks (pgvector)
POST /api/ai/chat                 → RAG chat for a given meetingId, streamed response
GET  /api/meetings                → list meetings for Meeting Intelligence
GET  /api/meetings/[id]           → selected meeting + insights
POST /api/follow-ups/[id]/status  → update follow-up status
```
Never invent alternate paths or flip a method between sessions — this list is the contract.

## Security
Never expose to the browser: `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `GROQ_API_KEY`, `STREAM_SECRET_KEY`, `CLERK_SECRET_KEY`.
Never run from the browser: embedding generation, RAG retrieval, LLM calls, Supabase service-role writes. All of the above go through API routes only, using the Supabase server client and AI SDK server-side.

## Code Standards
Small functions. Explicit types, `strict` TypeScript, no `any`. No changes outside the current task's scope. No over-engineering. No unrelated refactors. Every AI/agent call wrapped in try/catch, failures logged, never crash the whole run.

## Rules That Never Change
- Never use hardcoded hex values or raw Tailwind color classes
- Design Fidelity Rule: when a task references a `context/designs/*.png` file, every visual decision (colors, spacing, icon treatment, badge style) must be verified against that image directly — not carried over from the existing component's current styling, even for details not explicitly called out in the prompt. If the design image doesn't clearly show a detail, ask rather than reuse the old value.
- Update `progress-tracker.md` and `ui-registry.md` after every feature
- Before any third party library — load its installed skill first, then read `context/library-docs.md` for project-specific rules
- Never use a paid API — Gemini and Groq (both free-tier) only, Supabase only for backend/vector storage
- If the same problem persists after one corrective prompt — stop immediately and run /recover

## Fallback Rule
When unsure: keep it small, ask one focused question, save a prompt, get approval, then build. Rule of thumb: if you'd have to repeat it in more than one prompt, it belongs in AGENTS.md or context/.

## Available Skills
- `/architect` — before any complex feature. Think before building.
- `/imprint` — after any new UI component. Capture patterns.
- `/review` — before demo or when something feels off.
- `/recover` — when something breaks after one failed correction.
- `/remember save` — when a feature spans multiple sessions.
- `/remember restore` — when returning after a multi-session feature.
