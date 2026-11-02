# Project Overview

## About the Project

NeuraMeet is an AI-integrated meeting platform. Users create or join real-time video meetings (Stream Video SDK), and every meeting becomes searchable, summarized intelligence: AI-generated summary, extracted action items, an auto-assigned category, and a meeting-aware chat that answers questions grounded in that specific meeting's content (RAG). Transcripts can be uploaded directly or generated from a meeting recording. Action items convert into trackable Follow-ups.

**Direction from Phase W (adopted 2026-11-02, from the PDF `NeuraMeet UI Overview`):** NeuraMeet grows into "the development workspace that connects conversations with code" for software houses, dev teams, and university FYP teams. Projects hold members with roles, meetings, reviewed tasks on a Kanban board, a linked GitHub repo, a Decisions and Promises log, an activity timeline, and a project AI assistant. The differentiator is the **Proof Chain**: a promise spoken in a meeting (English, Urdu, or both) is traced to a reviewed task, then to a PR merged into the default branch, and shown as kept back on the meeting. Research: `reports/Conversations to code workspace.md`.

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

### Signature Feature: Promise Ledger (new, Steps S0+, before Deploy)
- The one feature meant to make NeuraMeet stand out. Chosen from the October 2026 research (`reports/NeuraMeet unique FYP feature.md`), which found that summaries, action items, chat, search, prep, and engagement insights already ship in Zoom, Teams, Otter, Read.ai, and Fireflies
- After each meeting, extract every decision and every promise (who, what, by when) from the transcript, in English, Urdu, or mixed Urdu English
- When a later meeting is processed, mark each earlier item kept, still open, overdue, or reversed, always with the exact quote and timestamp as proof
- The owner confirms or rejects each match (human in the loop), so a wrong "broken promise" verdict is never shown as fact
- Runs after the meeting on transcripts NeuraMeet already has; reuses Gemini + Groq, pgvector, action items, and follow ups. No live listening, no new provider
- Panel claim (keep it this narrow): no major meeting platform or mainstream notetaker in our review checks promise follow through across meetings, and none does it for Urdu English speech
- Step S0 is `/architect promise ledger`; it decides the data model, the new API route (to be added to the AGENTS.md contract list), and the build steps. Workflow tier GA
- Evaluation for the thesis: accuracy on a small hand labelled set (Urdu English results reported separately) plus a 6 to 10 person task study
- All zero cost, existing free tiers only

### Signature Feature: Live Ledger (new, Steps LL0+, after the Promise Ledger, before Deploy)
- Takes the Promise Ledger into the live call. Chosen from the November 2026 research (`reports/NeuraMeet second signature feature.md`), which found most live AI features (captions, live summaries, polls, reactions) already standard, but no product pushes a past promise with its exact quote into a live call
- Promise Check-in: the owner sees a ranked panel of open and overdue promises, raises one so every participant sees it as a quote card, and marks it Kept, Still open, or Reversed during the call
- Agreement Check: the host types a decision, each participant taps Agree or Not yet, and it is saved to the ledger as "agreed by N of M", so a quiet "we agreed" becomes an explicit, logged agreement
- After the call, live marks and agreements are reconciled into the ledger (owner stays the final reviewer)
- Reuses the server side Stream `sendCallEvent` path (already used by guest join), the in room `custom` event listener, and the existing ledger RPCs. Stream custom events are capped at 5 KB, so cards carry ids and a short quote, not transcripts
- Cost per meeting: about one embedding and zero to a few LLM calls; no Stream paid captions, no extra Whisper calls, no new provider
- Not in the first build: an automatic speech trigger that raises a promise when someone mentions it (stretch step only; stored transcripts have no timestamps and the cleanup pass outputs English)
- Step LL0 is `/architect live ledger`; it decides the routes (to be added to the AGENTS.md contract list), the live marks storage, the event shape, and checks every Stream API against the official `stream-react` skill. Workflow tier GA
- All zero cost, existing free tiers only

### Signature Feature: Tasdeeq, Verified Minutes (Steps T1 to T5, built in code, live run pending)
- Every attendee confirms, corrects, or records a dissent on the AI minutes lines attributed to them; each line links to its supporting transcript lines and unsupported lines are flagged
- Minutes seal on quorum or deadline (SHA-256 chain plus Ed25519 signature); a public verify page detects any later change. Say "tamper evident", never "legally binding"
- Spec `docs/specs/0003-tasdeeq-verified-minutes/index.md`; in Phase W it becomes the optional Verify minutes step before AI proposed tasks are confirmed

### Phase W, Project Workspace: Conversations to Code (new, Steps W-pre, W0 to W9, before Deploy)
- **Personal space:** My Dashboard, My Tasks (with Overdue), My Meetings, My Projects, Notifications, Ctrl K search. Personal meetings with no project keep working
- **Projects:** Owner, Admin, Developer, Viewer roles kept in our own Supabase tables; invitations by email or copyable link with single use hashed tokens, expiry, and owner approval
- **Project tabs:** Overview, Meetings, Tasks (Kanban: To Do, In Progress, In Review, Completed, Blocked), Decisions and Promises (the Promise Ledger), GitHub, Activity, AI Assistant, Members, Settings
- **Review gate:** AI proposes tasks and decisions with a code verified quote, speaker, and timestamp; a duplicate check runs against open tasks; nothing becomes a task until the owner or an admin confirms; optional "also create GitHub issue"
- **GitHub:** a free GitHub App per project repo. A task moves to In Review when a linked non draft PR opens and completes only when a PR with a closing reference merges into the default branch and all linked PRs are done; a revert reopens it; signed webhooks only. Tasks without GitHub complete manually with evidence
- **Proof Chain:** a qualifying merge adds code evidence to the linked promise, the meeting shows an Outcome card, and the Activity timeline joins meetings, decisions, tasks, and PRs
- **Project assistant:** answers only from the project's own meetings, promises, and tasks, with citations built by code and "not found in this project's records" when nothing matches
- **Live meeting:** Live Ledger panel and a recording consent notice. Live captions are deferred (Stream captions are paid with no Urdu); the post call Whisper transcript stays the record
- **Design:** the PDF sets layout and information architecture; colours stay the locked Stitch tokens, plus success and warning tokens
- **Cut:** development simulator, Contributors tab and per developer contribution views, a global assistant outside projects, sprints
- Step W0 is `/architect conversations to code`. Zero cost: free GitHub App, Vercel Hobby, Supabase, Gemini/Groq/pgvector, Stream, Clerk, Resend free tiers only

## Features Out of Scope

- Auto-transcription vendor lock-in beyond one provider (Stream's own transcription or a single chosen provider — decide once, do not add a second)
- Organization accounts beyond Phase W project workspaces (no Clerk Organizations, no cross workspace admin, no billing)
- Live captions in the core (deferred; optional Web Speech experiment after W9)
- Payments or subscriptions
- Mobile app
- Calendar integrations (Google Calendar sync etc.)
- Live collaborative transcript editing
- Custom LLM fine-tuning
- Paid AI APIs (OpenAI, Anthropic, paid Gemini tiers) — Gemini + Groq free tiers only

---

## Target User

Software houses, dev teams, and university FYP teams (Pakistan first, English and Urdu meetings) who need meeting promises to turn into tracked, provable code work; plus small teams and solo professionals who run recurring meetings, want automatic summaries and action-item tracking, and want to ask questions about past meetings without re-watching recordings — without paying for a hosted SaaS.

---

## Success Criteria

- User can create/join a meeting and it appears correctly in Meeting Intelligence afterward
- Uploaded transcript produces an accurate summary, action items, and category within a reasonable time
- Meeting AI Chat answers are grounded in that meeting's actual transcript (RAG), not hallucinated
- Follow-ups correctly reflect extracted action items and update status reliably
- No secret keys or service-role credentials ever reach client bundles
- Promise Ledger flags a reversed decision and tracks a promise across two or more meetings with a quote behind every verdict, including on a bilingual Urdu English meeting
- Live Ledger shows a raised promise to every participant during a call and saves the owner's live mark and any Agreement Check result to the ledger
- Proof Chain: one promise from a real Urdu English project meeting is traced in the UI from quote to reviewed task to merged PR to kept, and a forged webhook, a partial PR, and a non member request are all refused
- Entire stack runs on free-tier services only (Supabase free tier, Gemini/Groq free tier, Stream free tier, Clerk free tier)
