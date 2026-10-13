# Architecture

## Stack

| Layer                     | Tool                                  | Purpose                                                   |
| -------------------------- | -------------------------------------- | ---------------------------------------------------------- |
| Framework                  | Next.js 15 (App Router)               | Full stack framework                                       |
| Auth                        | Clerk                                  | User auth, session, protected routes                        |
| Video / Meetings            | Stream Video SDK (`@stream-io/*`)     | Real-time calls, recordings, call state                     |
| Database + Storage + Vector | **Supabase** (Postgres + pgvector)    | All AI/meeting data, transcript storage, RAG embeddings     |
| AI orchestration            | **Vercel AI SDK** (`ai`, `@ai-sdk/*`) | Model calls, structured output, streaming chat              |
| AI model — primary          | **Google Gemini** (`@ai-sdk/google`)  | Summaries, action-item extraction, category, chat — free tier |
| AI model — fallback         | **Groq** (`@ai-sdk/groq`)             | Same tasks, used when Gemini rate-limited — free tier        |
| Embeddings                  | Gemini embedding model via AI SDK      | Chunk embeddings stored in `meeting_chunks.embedding`         |
| E2E testing                 | Playwright                             | Critical-flow tests (join meeting, upload transcript, AI chat) |
| Optional enrichment          | Oxylabs                                | Web scraping for topic/company enrichment (stretch feature)   |
| Styling                     | Tailwind CSS + Aceternity-style kit    | UI components and styling                                    |
| Language                    | TypeScript strict                      | Throughout                                                    |

No paid APIs anywhere in this stack. No FastAPI/Python backend — Next.js API routes own all AI/agent logic.

---

## Folder Structure

```
/
├── AGENTS.md
├── context/
│   ├── project-overview.md
│   ├── architecture.md
│   ├── ui-tokens.md
│   ├── ui-rules.md
│   ├── ui-registry.md
│   ├── code-standards.md
│   ├── library-docs.md
│   ├── build-plan.md
│   └── progress-tracker.md
├── src/
│   ├── actions/
│   │   ├── stream.actions.ts            → Stream token provider (existing, bug-fixed)
│   │   ├── meetings.ts                  → Server Actions: meeting metadata read/write
│   │   └── follow-ups.ts                → Server Actions: follow-up status updates
│   ├── app/
│   │   ├── (auth)/...                   → sign-in / sign-up (existing)
│   │   ├── (root)/(home)/page.tsx       → Dashboard
│   │   ├── (root)/(home)/previous/page.tsx
│   │   ├── (root)/(home)/recording/page.tsx
│   │   ├── (root)/(home)/upcoming/page.tsx
│   │   ├── (root)/(home)/personal-room/page.tsx
│   │   ├── (root)/meeting/[id]/page.tsx → Meeting Room (existing)
│   │   ├── (root)/meeting-intelligence/page.tsx        → Meeting list
│   │   ├── (root)/meeting-intelligence/[id]/page.tsx   → Selected meeting + tabs
│   │   ├── (root)/ai-chat/page.tsx      → General Ask AI
│   │   ├── (root)/follow-ups/page.tsx   → Follow-up list
│   │   ├── (root)/follow-ups/[id]/page.tsx → Follow-up details
│   │   ├── (root)/settings/page.tsx
│   │   └── api/
│   │       ├── transcript/upload/route.ts   → Store uploaded/generated transcript
│   │       ├── ai/process/route.ts          → Summary + action items + category (AI SDK)
│   │       ├── ai/embed/route.ts            → Chunk + embed transcript (pgvector)
│   │       ├── ai/chat/route.ts             → Meeting-scoped RAG chat (streamed)
│   │       ├── meetings/route.ts            → List meetings
│   │       ├── meetings/[id]/route.ts       → Selected meeting + insights
│   │       └── follow-ups/[id]/status/route.ts
│   ├── agent/
│   │   ├── process.ts                   → Summary/action-items/category extraction logic
│   │   ├── embed.ts                     → Chunking + embedding logic
│   │   ├── rag.ts                       → Retrieval logic (pgvector similarity search)
│   │   ├── models.ts                    → Gemini/Groq provider setup (AI SDK)
│   │   └── types.ts                     → Agent-specific TypeScript types
│   ├── components/
│   │   ├── ui/                          → existing Aceternity-style kit + shadcn additions
│   │   ├── MeetingRoom.tsx, MeetingSetup.tsx, MeetingModel.tsx, Sidebar.tsx (existing)
│   │   ├── meeting-intelligence/
│   │   │   ├── MeetingList.tsx
│   │   │   ├── MeetingTabs.tsx
│   │   │   ├── SummaryTab.tsx
│   │   │   ├── ActionItemsTab.tsx
│   │   │   ├── RecordingTab.tsx
│   │   │   ├── CategoryTab.tsx
│   │   │   └── AiChatTab.tsx
│   │   ├── ai-chat/
│   │   │   └── ChatPanel.tsx            → Shared by AiChatTab and general /ai-chat page
│   │   └── follow-ups/
│   │       ├── FollowUpList.tsx
│   │       └── FollowUpDetails.tsx
│   ├── hooks/
│   │   ├── useGetCall.ts, useGetCallbyId.ts (existing)
│   │   ├── useMeetingInsights.ts        → Fetch summary/action items/category for a meeting
│   │   └── useMeetingChat.ts            → AI SDK `useChat` wrapper scoped to a meetingId
│   ├── lib/
│   │   ├── utils.ts (existing)
│   │   ├── supabase-client.ts           → Browser Supabase client (anon key only)
│   │   └── supabase-server.ts           → Server Supabase client (service role, server-only)
│   └── middleware.ts (existing, route matcher fixed)
└── e2e/
    └── *.spec.ts                        → Playwright tests
```

---

## System Boundaries

| Folder        | Owns                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------ |
| `app/`         | Pages and API routes only. No business logic.                                              |
| `agent/`       | All AI logic — processing, embedding, RAG retrieval, model setup. Never imports React.     |
| `actions/`     | Server Actions for UI-triggered mutations only (meeting metadata, follow-up status).       |
| `components/`  | UI only. No data fetching logic beyond hooks. No direct Supabase/AI SDK calls.              |
| `lib/`         | Third-party client initialisation and shared utilities only.                                |
| `hooks/`       | Client-side data fetching wrappers only — call API routes, never Supabase directly from client. |

---

## Data Flow

### UI Mutations (Server Actions)
```
User interaction in component
        ↓
Server Action in actions/
        ↓
Supabase server client write
        ↓
Revalidate
```

### Transcript → AI Processing (API Routes)
```
User uploads transcript / meeting ends with recording
        ↓
POST /api/transcript/upload → stores in transcripts table
        ↓
POST /api/ai/process → agent/process.ts → Gemini (fallback Groq) via AI SDK
        ↓
Writes summary + action_items + category to DB
        ↓
POST /api/ai/embed → agent/embed.ts → chunks transcript, embeds via Gemini embedding model
        ↓
Stores vectors in meeting_chunks (pgvector)
        ↓
Meeting Intelligence tabs revalidated
```

### AI Chat (RAG, API Route)
```
User asks a question (meeting-scoped or general)
        ↓
POST /api/ai/chat { meetingId?, message }
        ↓
General branch (no meetingId): inject the signed-in user's real context so the
assistant can answer identity/account questions instead of claiming no access:
  - Clerk `currentUser()` → display name + primary email
  - Supabase `meetings` (user-scoped) → list + per-status count summary
  - Stream recordings (`getUserRecordings`, src/lib/recordings.ts) fetched lazily
    only when the message mentions "record"
        ↓
Meeting-scoped branch (meetingId present): agent/rag.ts embeds the question and
runs pgvector similarity search on that meeting's meeting_chunks
        ↓
System prompt + (context | relevant chunks) + question
        → Gemini (fallback Groq) via AI SDK streaming
        ↓
Streamed response to ChatPanel (AI SDK useChat)
```
Note: the model is instructed to use the injected counts verbatim rather than
re-counting the (truncated to 12) meeting list, so "how many scheduled" answers
are accurate. All context lookups are isolated in try/catch so a Clerk/DB/Stream
failure degrades to "less personalized" instead of crashing the request.

---

## Supabase Database Schema

### `meetings`
| Column          | Type        | Notes                                        |
| ---------------- | ----------- | --------------------------------------------- |
| id               | uuid        | Primary key                                    |
| stream_call_id    | text        | References the Stream call id, unique          |
| user_id          | text        | Clerk user id (creator)                         |
| title            | text        |                                                |
| started_at        | timestamptz |                                                |
| ended_at          | timestamptz | Null until call ends                            |
| status           | text        | scheduled / active / ended                       |
| created_at        | timestamptz |                                                |

### `transcripts`
| Column       | Type        | Notes                                  |
| ------------- | ----------- | ---------------------------------------- |
| id            | uuid        |                                          |
| meeting_id     | uuid        | References meetings, unique              |
| source        | text        | upload / recording                        |
| raw_text       | text        | Required — never save empty               |
| created_at     | timestamptz |                                          |

### `meeting_insights`
| Column          | Type        | Notes                                    |
| ---------------- | ----------- | ------------------------------------------ |
| id               | uuid        |                                            |
| meeting_id        | uuid        | References meetings, unique                |
| summary          | text        | Required after processing                  |
| key_points        | text[]      |                                            |
| decisions        | text[]      |                                            |
| category         | text        | Required after processing                  |
| detected_topics    | text[]      |                                            |
| processed_at      | timestamptz |                                            |

### `action_items`
| Column       | Type        | Notes                                |
| ------------- | ----------- | --------------------------------------- |
| id            | uuid        |                                        |
| meeting_id     | uuid        | References meetings                     |
| title         | text        | Required                                |
| assignee      | text        |                                        |
| due_date       | date        |                                        |
| created_at     | timestamptz |                                        |

### `follow_ups`
| Column          | Type        | Notes                                             |
| ---------------- | ----------- | ---------------------------------------------------|
| id               | uuid        |                                                    |
| action_item_id     | uuid        | References action_items                            |
| meeting_id        | uuid        | References meetings                                 |
| status           | text        | pending / needs_attention / completed              |
| priority         | text        | low / medium / high                                 |
| notes            | text        |                                                     |
| updated_at        | timestamptz |                                                     |

### `meeting_chunks` (RAG / pgvector)
| Column       | Type          | Notes                                      |
| ------------- | ------------- | --------------------------------------------|
| id            | uuid          |                                            |
| meeting_id     | uuid          | References meetings                        |
| chunk_text     | text          | Required                                   |
| embedding     | vector(768)   | pgvector — Gemini embedding dimension       |
| chunk_index    | integer       |                                            |

Enable once in Supabase: `create extension if not exists vector;`

---

## Planned Tables (Advanced Pipeline — filled in at Steps B0/B1)

### `attendance_events` (Auto Attendance — defined at Step B0, created at Step B1)
One row per join session per participant. Placeholder columns (finalized in the B0 `/architect` pass):

| Column             | Type        | Notes                                                  |
| ------------------ | ----------- | ------------------------------------------------------ |
| id                 | uuid        | Primary key                                            |
| meeting_id         | uuid        | References meetings                                    |
| user_id            | text        | Clerk user id                                          |
| participant_email  | text        | Email at session time                                  |
| session_started_at | timestamptz | Set on join                                            |
| session_ended_at   | timestamptz | Null until leave; reconnect closes + reopens a row     |
| talk_time_seconds  | integer     | Computed on leave                                      |
| mic_toggles        | integer     | Count of mic on/off toggles during the session         |
| camera_toggles     | integer     | Count of camera on/off toggles during the session      |
| created_at         | timestamptz |                                                        |

Writes happen server-side only (API route + `supabaseServer()`), never from the browser. Reuses the existing `service_role` GRANT block in `supabase/schema.sql`.

> **Layer 3 (C1–C3) reuses existing tables** — `meeting_chunks` (embeddings for cross-meeting search + prep) and `attendance_events` (speaker engagement talk-time). No additional tables are expected; confirmed at each feature's `/architect` pass.

### Meeting Experience Polish (Phase D — planned, before Deploy)
Stream-SDK UX/redesign work only: Meeting Setup + Meeting Room redesign to Zoom/Meet quality, plus new professional Stream functionality discovered via a D0 architect audit against the live Stream API (official Stream `stream`/`stream-react` skill). **No new database tables expected** — all work reuses the existing `meetings` / `attendance_events` data and the existing Stream SDK wrappers in `src/actions/stream.actions.ts` and `src/Providers/`. Every candidate Stream feature must be confirmed zero-cost (free tier) via the Stream skill before it is proposed; no paid Stream plan. The Stream SDK verification rule (Invariants) applies to every D-step.

### Transcript Generation (Phase F — planned, before Deploy)
Automatic speaker-labeled transcript creation from real meeting audio (Steps F0–F7). **No new database tables expected** — the merged transcript is fed into the existing pipeline unchanged: `POST /api/transcript/upload` stores it, then `POST /api/ai/process` produces Summary / Action Items / Category, and `POST /api/ai/embed` writes `meeting_chunks` (pgvector) for RAG. The only new server-side work is fetching per-participant audio from Stream (`individual_recording` / `recording` setting), transcribing each track via Groq Whisper free tier (English + Urdu, timestamped), and merging chronologically into "SpeakerName: text" lines before the upload call. **F0 architect verification gate:** the D3.4 recovery (2026-08-21) proved composite frame recording is non-functional on this account and the per-call `individual_recording` override may be a no-op — verify against the installed Stream SDK (or the connected Stream MCP tool) that per-participant audio is actually retrievable before committing F1. All zero-cost: Stream individual recording + Groq Whisper free tier only; no paid transcription service or second provider. **F7 — After-meeting recap (built):** when a call ends (owner ends it, or any participant leaves), `MeetingRoom.tsx` routes everyone to the new public post-call page `/after-meeting/[id]` (outside the `(root)` sidebar group, readable while logged-out) instead of home. The page shows the meeting title, description, total duration, and participant list (from `attendance_events`) plus a Generate Transcript button — the button moved OFF the Recording tab to this page. The page is powered by a new PUBLIC server helper `getMeetingRecap(id)` in `src/lib/meeting-recap.ts` (no auth/owner filter, because every participant incl. logged-out viewers can open it); the owner-only `GET /api/meetings/[id]` is untouched. Generation from the recap page enforces auth (any signed-in participant) on the server via `POST /api/transcript/download` and never triggers AI; the full pipeline (Summary/Action Items/Category/RAG) runs only via the Upload Transcript flow.

---

## Supabase Client Pattern

Two separate instances — never mix them:

```typescript
// lib/supabase-client.ts — browser context only, anon key
import { createBrowserClient } from "@supabase/ssr";

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
```

```typescript
// lib/supabase-server.ts — server context only, service role
import { createClient } from "@supabase/supabase-js";

export const supabaseServer = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
```

---

## Invariants

Rules the AI agent must never violate:

- API routes contain no UI logic. Components contain no DB or AI SDK logic.
- Agent code in `/agent` never imports from `/components` or `/actions`.
- Server Actions never call agent functions. Agent functions are only called from API routes.
- All Supabase server-side writes use `supabaseServer()` — never the browser client, never the anon key for writes.
- No hardcoded hex values or raw Tailwind color classes in components — use CSS variables from ui-tokens.md.
- Every AI SDK / Gemini / Groq call is wrapped in try/catch, with Gemini failures falling back to Groq before surfacing an error.
- Never call a paid API. Gemini and Groq free tiers only. Supabase free tier only.
- `meeting_chunks.embedding` is always populated before RAG chat is available for a meeting — never search an unembedded meeting.
- Always scope Supabase queries by `user_id` (via the owning `meeting_id` → `meetings.user_id`) — never query across users.
- `transcripts.raw_text` is never saved empty.
- Stream video/session logic stays inside existing Stream wrappers — the AI layer never touches call state directly.
- Before modifying Stream SDK code (event handlers, hooks, call lifecycle, device state), verify event names, payload shapes, and API behavior against the installed SDK version via the official Stream `stream`/`stream-react` skill (or the package type definitions in `node_modules/@stream-io/*/dist/**/*.d.ts`). Never assume from memory. Version specific Stream behavior has already caused real bugs here (camera loop, sfuClient crash, red device errors).
