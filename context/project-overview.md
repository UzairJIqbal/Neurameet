# Project Overview

## About the Project

NeuraMeet is an AI-integrated meeting platform. Users create or join real-time video meetings (Stream Video SDK), and every meeting becomes searchable, summarized intelligence: AI-generated summary, extracted action items, an auto-assigned category, and a meeting-aware chat that answers questions grounded in that specific meeting's content (RAG). Transcripts can be uploaded directly or generated from a meeting recording. Action items convert into trackable Follow-ups.

---

## The Problem It Solves

Meetings generate decisions and tasks that get lost the moment the call ends. NeuraMeet removes the manual note-taking and re-reading step — it turns a transcript into a structured summary, a list of who-owes-what action items, a category for quick scanning, and a chat interface so anyone can ask "what did we decide about X" instead of scrubbing a recording.

---

## Pages

```
/                          → Dashboard (home) — Quick Actions, Meeting Intelligence, Follow-ups
/personal-room             → Personal Room (always-available call)
/previous                  → Previous meetings
/recording                 → Recordings library
/upcoming                  → Upcoming/scheduled meetings
/meeting/[id]               → Meeting Room (Stream call UI)
/meeting-intelligence        → Meeting list → selected meeting insight tabs
/meeting-intelligence/[id]   → Overview / Summary / Action Items / Recording / Category / AI Chat
/ai-chat                    → General Ask AI entry point
/follow-ups                 → Follow-up list → Follow-up details
/settings                   → Settings
/sign-in, /sign-up          → Clerk auth
```

---

## Navigation

Dark left sidebar (existing `Sidebar.tsx`): Dashboard, Meeting Intelligence, AI Chat, Recordings, Follow-ups, Settings. Header: greeting, search, notifications, "Ask NeuraMeet AI" button. No top navbar — sidebar is primary nav, matches the supplied UI reference.

---

## Core User Flow

### Quick Actions (Dashboard)
- **New Meeting** → meeting setup form → Create Meeting (Stream `call.getOrCreate`) → Meeting Room
- **Join Meeting** → paste code/link → Meeting Room
- **Upload Transcript** → file drop → `POST /api/transcript/upload` → AI Processing → Meeting Insights
- **Ask AI** → AI Chat (no meeting context, general assistant)

### Meeting Intelligence
- Meeting List: title, date, action ("Open Insights")
- Selecting a meeting loads Selected Meeting header (date, duration, participants, AI status badge) + tabs: **Overview, Summary, Action Items, Recording, Category, AI Chat**
- Summary: AI summary + key outcomes (action items count, key points, decisions)
- Action Items: task list with assignee + due date, decisions list
- Recording: video player + download (from Stream recording, when available)
- Category: classification + detected topics, with a "Change category" control
- AI Chat: meeting-scoped RAG chat — question in, retrieved-context answer out, streamed

### Upload Transcript → AI Processing
1. User uploads a transcript file (or pastes text)
2. `POST /api/transcript/upload` stores it in `transcripts`
3. `POST /api/ai/process` (Gemini/Groq via Vercel AI SDK) extracts summary, action items, category
4. `POST /api/ai/embed` chunks the transcript and stores embeddings in `meeting_chunks` (pgvector) for RAG
5. User is redirected to the meeting's insight tabs

### Follow-ups
- Auto-generated from extracted action items (assignee, due date, status: Pending/Needs attention/Completed)
- Follow-up List: filter (All/Due Soon/Needs Attention/Completed)
- Follow-up Details: task, assigned to, due date, status, related meeting, description, notes, "Mark as Completed"

### Recordings
- Library of meeting recordings sourced from Stream, linked back to their meeting's insight page

---

## Data Architecture

### Meeting Data
- Lives in Supabase `meetings` table, one row per Stream call
- `transcripts` — raw transcript text/source, linked to a meeting
- `meeting_chunks` — chunked + embedded transcript content (pgvector) for RAG retrieval, never edited by the user
- `action_items` — extracted per meeting, feeds `follow_ups`
- `follow_ups` — user-editable status/notes, references `action_items` and `meetings`

### AI Output
- Summary, category, key outcomes stored on `meetings`/a dedicated `meeting_insights` row — generated once per processing run, re-generated only if the user re-runs processing
- Never affects Clerk user data or Stream call data

---

## Features In Scope

### Core Pipeline (built — Steps 0 to 9 + 9.5)
- Clerk auth (existing)
- Sidebar navigation — Dashboard, Meeting Intelligence, AI Chat, Recordings, Follow-ups, Settings
- New Meeting / Join Meeting / Meeting Room (existing Stream integration, bugs fixed)
- Upload Transcript → AI Processing → Meeting Insights
- Meeting Intelligence: list + Overview/Summary/Action Items/Recording/Category/AI Chat tabs
- Meeting-scoped AI Chat with RAG (Supabase pgvector)
- General Ask AI chat (no meeting context)
- Follow-ups: list + details, generated from action items
- Recordings library
- Settings (Account + Preferences)

### Advanced Pipeline (new — Steps A0 to C3, all pending)
- Functional Settings toggles — AI auto-summary on upload, email notifications, desktop reminders (each made to have a real, zero-cost effect)
- App-wide UI dead-control repair — audit every dead/non-functional control and fix it (Dashboard "View All" links, "Open Insights" buttons, global search, etc.)
- Auto Attendance — live participant join/leave/mic/camera tracking via the Stream SDK (zero cost), stored in Supabase, with a downloadable PDF attendance report per meeting (reachable from the Overview tab). PDF library must be free/zero cost.
- Cross-meeting semantic search across the user's meetings (reuses existing `meeting_chunks` embeddings)
- Meeting prep suggestions from past related meetings
- Per-speaker engagement insights (transcript chunks + attendance + existing AI setup)

All Advanced features reuse the existing Gemini primary + Groq fallback and pgvector; no new paid provider, vector store, or PDF service.

### Meeting Experience Polish (new — Steps D0 to D3+, before Deploy)
- Meeting Setup redesign — device preview, controls, layout, modern Zoom/Google Meet-quality aesthetic
- Meeting Room redesign — call layout, controls, participant grid, modern aesthetic
- New professional Stream Video SDK functionality (per a D0 architect audit against Stream's real, current API via the official Stream `stream`/`stream-react` skill) — better layouts, reactions, screen-share polish, noise cancellation if free-tier, etc., one feature per step
- All zero cost, Stream free tier only — every candidate Stream feature confirmed free via the Stream skill before adoption. No paid Stream plan.

### Transcript Generation (new — Steps F0 to F6, before Deploy)
- On-demand, speaker-labeled transcripts from real meeting audio, downloaded as a `.txt` (as built in F7b); manual upload remains the path into AI processing
- Reuse Stream `individual_recording` (one audio track per participant) so speaker identity is known without a diarization model
- Transcribe each participant track via Groq Whisper free tier (English + Urdu, auto language detection, timestamped segments)
- Merge tracks chronologically into a "SpeakerName: text" formatted transcript
- Summary, Action Items, Category and RAG embeddings run only when the transcript is uploaded through the existing Upload Transcript → AI Processing flow
- F0 architect gate: passed 2026-08-22 — Stream individual recording yields per-participant audio on this account
- All zero cost — Stream individual recording + Groq Whisper free tier only. No paid transcription service or second provider.

## Features Out of Scope

- Auto-transcription vendor lock-in beyond one provider (Stream's own transcription or a single chosen provider — decide once, do not add a second)
- Multi-tenant/organization accounts
- Payments or subscriptions
- Mobile app
- Calendar integrations (Google Calendar sync etc.)
- Live collaborative transcript editing
- Custom LLM fine-tuning
- Paid AI APIs (OpenAI, Anthropic, paid Gemini tiers) — Gemini + Groq free tiers only

---

## Target User

Small teams and solo professionals who run recurring meetings, want automatic summaries and action-item tracking, and want to ask questions about past meetings without re-watching recordings — without paying for a hosted SaaS.

---

## Success Criteria

- User can create/join a meeting and it appears correctly in Meeting Intelligence afterward
- Uploaded transcript produces an accurate summary, action items, and category within a reasonable time
- Meeting AI Chat answers are grounded in that meeting's actual transcript (RAG), not hallucinated
- Follow-ups correctly reflect extracted action items and update status reliably
- No secret keys or service-role credentials ever reach client bundles
- Entire stack runs on free-tier services only (Supabase free tier, Gemini/Groq free tier, Stream free tier, Clerk free tier)
