# Codebase gap analysis: NeuraMeet today vs the "Conversations to Code Workspace" PDF

Method: the PDF (`/Users/UzairIqbal/Downloads/NeuraMeet-UI-Overview.pdf`, 27 pages: cover, 4 overview pages, 21 screen pages) was rendered page by page with PDFKit. Its text was extracted, and screens 02, 05, 12 and 14 were viewed as images. The codebase was surveyed read only on 2026-11-02. "Sources" below are local file paths (repo root `/Users/UzairIqbal/Projects/neurameet`) or PDF pages. No web research was needed. The PDF has **no separate design system page** with a palette or type scale. The only design spec is the "Design" paragraph on page 2, plus what the screenshots show.

## Q1. Screen-by-screen gap matrix (21 PDF screens)

### Takeaway
About 4 of the 21 screens exist (auth, meeting room, meeting detail AI summary, meeting detail action items) and about 4 are partial (dashboard, settings, My Meetings, AI assistant). The other 13 are missing because they depend on concepts the codebase lacks: projects/workspaces, members/roles/invitations, tasks with a kanban lifecycle, GitHub, an activity feed, and notifications. The meeting → AI → review half of the PDF is largely built. The project/team → task → code half is not.

### Cited Findings
Legend: E = exists, P = partial, M = missing, C = conflicts with current design or behaviour. Effort: S ≤ 2 days, M 3–6 days, L 1–3 weeks (one developer, with existing patterns).

| # | PDF screen (page) | Status | Existing route / component | Gap | Effort |
|---|---|---|---|---|---|
| 01 | Sign In / Sign Up / Forgot Password (p7) | E (C on styling) | `src/app/(auth)/sign-in/[[...sign-in]]/page.tsx`, `sign-up`, `forgot-password`, `verify-email`; `src/components/auth/SignInForm.tsx`, `SignUpForm.tsx`, `ForgotPasswordForm.tsx`, `AuthLayout.tsx`; Google SSO via `src/app/sso-callback/page.tsx` | Restyle only. The current right panel is a dark testimonial (`context/ui-tokens.md` invariant). "Remember me" is not confirmed. | S |
| 02 | My Dashboard (p8) | P | `src/app/(root)/(home)/dashboard/page.tsx`, `src/components/DashboardContent.tsx` (fetches `/api/meetings` and `/api/follow-ups`) | Has meetings and follow-ups. Missing: my projects, focus tasks with status filters, a notifications widget, GitHub contributions, project shortcuts in the sidebar. | M |
| 03 | My Projects (p9) | M | none | Needs a projects table, list/grid, filters, and a pending-invitations banner. | M |
| 04 | Create New Project (p10) | M | none | Needs a form plus optional GitHub repo connect. | M (L with GitHub) |
| 05 | Project Workspace · Overview (p11) | M | none | Project header, 9 tabs, stats, progress donut, upcoming project meeting, activity, recent tasks, team card. | L |
| 06 | Project Tasks · Kanban (p12) | M (closest: follow-ups) | `src/app/(root)/(home)/follow-ups/page.tsx`, `src/components/follow-ups/FollowUpList.tsx` | Follow-ups are a flat list with statuses `pending/needs_attention/completed`. The PDF needs To Do / In Progress / In Review / Completed / Blocked, drag and drop, filters, task IDs (ECP-15), GitHub refs. | L |
| 07 | Task Details (p13) | P (closest: follow-up details) | `src/app/(root)/(home)/follow-ups/[id]/page.tsx`, `src/components/follow-ups/FollowUpDetails.tsx` | Missing: editable assignee and due date as a real user, comments, activity history, GitHub links, "development simulator", completion evidence. | M–L |
| 08 | Project Members (p14) | M | none (only Stream call members: `src/app/api/meetings/[id]/members/route.ts`) | Roles Owner/Admin/Developer/Viewer, GitHub username, task counts. | M |
| 09 | Add Members dialog (p15) | M | none (Resend email infra exists: `src/lib/email.ts`) | Email invites, invite link with expiry/disable/owner approval. | M |
| 10 | Invitation Acceptance `/invite/:token` (p16) | M | none (`src/middleware.ts` has no `/invite` route) | Public route plus accept/approve flow. | S–M |
| 11 | Project Meetings (p17) | P | `upcoming/page.tsx` (`UpcomingPage.tsx`), `previous/page.tsx` (`PreviousPage.tsx`), `meeting-intelligence/page.tsx` (`MeetingList.tsx`), schedule dialog in `src/components/MeetingModel.tsx` | Meetings are per user, not per project. The schedule dialog has no participant picker or meeting type: Stream `members` is only `[{ user_id: user.id, role: "admin" }]` (`MeetingModel.tsx:122,187`). | M |
| 12 | Live Meeting (p18) | P | `src/app/(root)/meeting/[id]/page.tsx`, `src/components/MeetingRoom.tsx` (1,163 lines), `MeetingSetup.tsx`, `DeviceSetup.tsx`, `EndCallButton.tsx`, guest lobby `meeting/[id]/guest` | Exists: Stream layouts (`PaginatedGridLayout`, `SpeakerLayout`), screen share, reactions (`defaultEmojiReactionMap`), participants panel (`CallParticipantsList`), recordings panel, Live Ledger side panel (`LiveLedgerPanel`). Missing: live captions, live transcript panel, in-call text chat (0 "chat" matches in `MeetingRoom.tsx`), REC timer badge. Raise hand is unverified. | M (L if live captions) |
| 13 | Meeting Details · AI Summary (p19) | E (C on tab set) | `src/app/(root)/(home)/meeting-intelligence/[id]/page.tsx`, `MeetingDetail.tsx`, `MeetingTabs.tsx` with `OverviewTab`, `SummaryTab`, `RecordingTab`, `CategoryTab`, `AiChatTab`, `EngagementTab`, `LedgerTab`, `MinutesTab`; also `src/app/after-meeting/[id]/page.tsx` (`AfterMeetingRecap.tsx`) | The PDF tabs are AI Summary / Transcript / Decisions / Action Items with a side recording player and an Outcome card. The codebase has no dedicated Transcript tab; decisions are in `meeting_insights.decisions` and the Ledger tab. Mostly a regroup and restyle. | S–M |
| 14 | Meeting Details · Action Items (p20) | P | `ActionItemsTab.tsx`; `action_items` + `follow_ups` tables | Today action items are auto-created and follow-ups generated with no human gate. The PDF requires "AI proposed → Review/Edit/Dismiss → Confirm and Create Tasks", priority, a suggested assignee only on explicit acceptance, and "Also create GitHub issues". This conflicts with the current auto-create behaviour (C). | M |
| 15 | GitHub Integration (p21) | M | none (GitHub appears only in auth forms as an OAuth button) | GitHub App/OAuth, repo sync, commits/issues/PRs/contributors, webhooks, automation rules. | L |
| 16 | Development Activity (p22) | M | none | Unified project timeline (GitHub + tasks + meetings + decisions). | M |
| 17 | Decisions (p23) | P | `ledger_items` (kind `decision`/`promise`), `LedgerTab.tsx`, `GET /api/ledger`, `meeting_insights.decisions text[]` | Ledger is per meeting and owner only (`MeetingTabs.tsx:37` `OWNER_ONLY_TABS = ["Recording","Ledger"]`). The PDF needs a project-wide decisions list with tags and participants. | M |
| 18 | AI Project Assistant (p24) | P | `src/app/(root)/(home)/ai-chat/page.tsx` (`GeneralChat.tsx`), `POST /api/ai/chat`, `src/agent/rag.ts`, `GET /api/search` (`SearchPage.tsx`) | RAG covers one meeting (`match_meeting_chunks`) or all meetings owned by the user (`match_meeting_chunks_user`). Missing: project scoping, task/issue/PR sources, citation cards that open records, a project memory panel. | M–L |
| 19 | My Tasks (p25) | P (closest: follow-ups list) | `follow-ups/page.tsx` | Cross-project personal task list with an Overdue filter. Follow-ups are not assigned to user IDs (`action_items.assignee` is free text). | M |
| 20 | Notifications (p26) | M | none (`ReminderManager.tsx` desktop reminders; Resend email in `src/lib/email.ts`) | Needs a notifications table, bell, centre, read/unread state. | M |
| 21 | Settings · Connected Accounts (p27) | P | `src/app/(root)/(home)/settings/page.tsx`, `SettingsPage.tsx`, `src/lib/user-prefs.ts` | Has notification and reminder prefs (A1–A3). Missing: connected accounts (GitHub), appearance, email digest, separate My Profile page. | S–M |

Supporting facts:
- The PDF names two halves: "Meetings → tasks" (recorded, transcribed, AI summary, decisions, proposed tasks, human review) and "Tasks → code" (GitHub issues/commits/PRs; webhooks move tasks to In Review on PR open and to Completed on merge). — PDF p2
- Seven required journeys A–G: new project, invite, project meeting, meeting to tasks, developer work and GitHub, personal workspace, AI assistant. — PDF p5
- The current sidebar has 11 items: Dashboard, Meeting Intelligence, AI Chat, Recordings, Follow-ups, Previous, Upcoming, Personal Room, Search, Prep, Settings. — `constants/index.tsx:31-81`
- The PDF sidebar is My Dashboard, My Tasks, My Meetings, My Projects, Notifications, AI Assistant, a PROJECTS list, then Settings and User Profile. The top bar has breadcrumbs, Ctrl K search, a bell and help. — PDF p4, p8 screenshot

### Inferences
- Screens with no PDF counterpart that would have to be kept, merged or hidden: Recordings library (`recording/page.tsx`), Personal Room, Prep (`prep/page.tsx`, `POST /api/prep`), Search, Follow-ups, the Engagement, Ledger and Minutes tabs, the guest lobby, the public `/minutes/verify/[sealId]` page, and the landing page. Most fold naturally into project tabs (Recordings → meeting detail, Prep → project overview "next meeting", Search → Ctrl K).
- The largest net-new effort is GitHub (screens 04, 07, 15, 16 and parts of 02, 05 and 14), then projects/members/invites (03–05, 08–10).

### Gaps
- Screens 03, 04, 06, 07, 09, 10, 13, 15–17 and 19–21 were read from caption text, not viewed as images. Fine-grained widget-level gaps on those screens were not catalogued.
- Raise hand in `MeetingRoom.tsx` is unconfirmed: the "hand" grep matches are probably `handle…` identifiers.

## Q2. Data model: new tables and how existing tables map

### Takeaway
No project, team or workspace concept exists. Every meeting is owned by a single Clerk `user_id`, and "attendee" is inferred from `attendance_events` rows. Most PDF entities need new tables. Existing tables map cleanly enough to be extended: `action_items`/`follow_ups` become proposed tasks and tasks, and `ledger_items` becomes decisions.

### Cited Findings
- `meetings(id, stream_call_id unique, user_id text, title, started_at, ended_at, status scheduled|active|ended, created_at, guest_admission_mode)`. No project or description column. — `supabase/schema.sql:19-27, 272`
- `transcripts(meeting_id unique, source upload|recording, raw_text, language, processing_state)`. — `supabase/schema.sql:38-46`
- `meeting_insights(meeting_id unique, summary, key_points[], decisions[], category, detected_topics[], processed_at)`, plus `minutes_draft` (T1). — `supabase/schema.sql:50-58`; `context/progress-tracker.md` (Step T1)
- `action_items(meeting_id, title, assignee text, due_date)`. No status, priority or review state. — `supabase/schema.sql:62-68`
- `follow_ups(action_item_id, meeting_id, status pending|needs_attention|completed, priority low|medium|high, notes, updated_at)`. — `supabase/schema.sql:72-79`
- `meeting_chunks(meeting_id, chunk_text, embedding vector(768), chunk_index)`. — `supabase/schema.sql:83-88`
- `attendance_events(meeting_id, user_id nullable, stream_user_id, participant_email, participant_name, session_started_at/ended_at, mic/camera toggles, talk_time_seconds)`. — `supabase/schema.sql:167-181, 97`
- `guest_requests` keyed on the Stream call id. — `supabase/schema.sql:296-308`
- `ledger_items(meeting_id, action_item_id, kind decision|promise, statement, quote, quote_language en|ur|mixed, speaker, assignee, due_date, line_number, status open|kept|reversed, embedding, source transcript|live_agreement)` and `ledger_links(item_id, evidence_meeting_id, relation, quote, confidence, state suggested|confirmed|rejected)`. — `supabase/schema.sql:323-351, 545`
- Live Ledger tables: `ledger_live_marks`, `ledger_agreements`, `ledger_agreement_votes`. — `supabase/schema.sql:508-539`
- Tasdeeq tables: `minutes_reviews`, `minutes_lines`, `minutes_attesters`, `minutes_speaker_claims`, `minutes_attestations`, `minutes_dissent_suggestions`, `minutes_seals`. — `supabase/schema.sql:562-643`
- RLS is enabled only on the ledger and minutes tables. All access goes through the service role in API routes. — `supabase/schema.sql:358-359, 549-551, 647-653`
- Meeting ownership check: `GET /api/meetings/[id]` allows the owner (`meeting.user_id === userId`), or else a row in `attendance_events` by `user_id` or `stream_user_id`. — `src/app/api/meetings/[id]/route.ts:46-77`
- The meetings list is owner only: `.eq("user_id", userId)`. — `src/app/api/meetings/route.ts:32-36`
- Scheduling adds only the creator as a Stream member (`members: [{ user_id: user.id, role: "admin" }]`). Others join by link, and a POST to `/api/meetings/[id]/members` adds the caller as a Stream call member. — `src/components/MeetingModel.tsx:122,187`; `src/app/api/meetings/[id]/members/route.ts`

New tables needed (proposed, not yet in code):

| New table | Purpose | Reuses / maps from |
|---|---|---|
| `projects` (id, owner_id, name, description, type, icon, color, status, github_repo_id) | Workspace | none |
| `project_members` (project_id, user_id, role owner/admin/developer/viewer, github_username, joined_at) | Roles | none |
| `project_invitations` (project_id, email or link token, role, expires_at, requires_approval, status pending/accepted/revoked/awaiting_approval) | Invites | `guest_requests` pattern (token, TTL, status) |
| `meetings.project_id` (nullable FK) + `meeting_participants` (meeting_id, user_id, invited/attended) | Project meetings and real invite lists | `attendance_events` stays as the attended record |
| `tasks` (project_id, key such as ECP-15, title, description, status todo/in_progress/in_review/completed/blocked, priority, assignee_user_id, due_date, source_meeting_id, source_action_item_id, position) | Kanban | supersedes `follow_ups` |
| `action_items` + `review_state` (proposed/confirmed/dismissed), priority, suggested_assignee_user_id, evidence quote | Human review gate | extend `action_items` |
| `task_comments`, `task_events` (activity history) | Task drawer | none |
| `github_installations`, `github_repos`, `github_events` (commits, PRs, issues, reviews), `task_github_links` | Tasks → code | none |
| `activity` (project_id, actor, verb, object type/id, at) | Dev Activity and Overview feed | could be a view over tasks, meetings, github_events and ledger_items |
| `notifications` (user_id, type, payload, read_at) | Notification centre | email triggers in `src/lib/email.ts` |
| decisions | Decisions tab | **reuse `ledger_items` where kind='decision'**, add `tags text[]`, scope through `meetings.project_id` |

### Inferences
- `follow_ups` ≈ tasks, but only loosely. Follow-ups have no assignee user ID, no ID key, three statuses against the PDF's five, and they are created automatically. The least disruptive path is a new `tasks` table that follow-ups migrate into (or a view), while `action_items` becomes the "AI proposed" staging layer the PDF's review screen needs.
- `ledger_items` (decision + promise, with quotes, line numbers and embeddings) is a stronger "Decisions" source than the PDF shows. Promises map to tasks with due dates and kept/reversed tracking, which is a differentiator the PDF does not have.
- Project scoping should come from `meetings.project_id`. Every child table (transcripts, chunks, insights, ledger, minutes, attendance) already cascades from `meetings`, so project scoping propagates through one join with no column additions on children.
- Ownership is the single biggest structural change. Every owner-only check that compares `meetings.user_id` (about 29 API route files reference `user_id` equality) must become "project role allows X". Owner-only features (Ledger, Recording, minutes seal, attendance PDF, guest admit) need a role mapping such as Owner/Admin = today's owner.

### Gaps
- The exact count of owner-check call sites was approximated (29 files under `src/app/api` match a `user_id` equality pattern). An exhaustive audit was not done.
- Whether Clerk user IDs can carry a GitHub username (a Clerk GitHub OAuth external account) was not checked.

## Q3. AI pipeline reuse (process, embeddings, RAG, search)

### Takeaway
The pipeline is reusable unchanged for the meeting half: upload or generate transcript → `/api/ai/process` (summary, action items, category, ledger items, minutes draft) → `/api/ai/embed` → RAG. Cross-meeting search already exists, but it is scoped by meeting owner. A project assistant needs a new project-scoped RPC (filter `m.project_id` plus a membership check) and extra sources (tasks, PRs) that are not embedded today.

### Cited Findings
- `match_meeting_chunks(query_embedding, match_meeting_id, match_count)` serves single-meeting RAG. — `supabase/schema.sql:104-112`; `src/agent/rag.ts:30-33`
- `match_meeting_chunks_user` joins `meeting_chunks` to `meetings` and filters `where m.user_id = p_user_id`. Meetings the user only attended are excluded. — `supabase/schema.sql:131-160`
- `GET /api/search` calls `searchAcrossMeetings(userId, query)` (cross-meeting semantic search, C1). — `src/app/api/search/route.ts:8-28`; `src/agent/rag.ts:86-135`
- `/api/ai/chat` general mode injects the user's meeting list and recording summary into the system prompt, with retrieved context wrapped in data tags. — `src/app/api/ai/chat/route.ts:64-94`
- Embeddings are vector(768) (Gemini). Models go through `src/agent/models.ts`, with a Gemini → Groq fallback and a 30 s Gemini timeout. — `supabase/schema.sql:87`; `context/progress-tracker.md` ("Gemini time limit")
- Ledger cross-meeting matching uses a user-scoped RPC as well (`p_user_id`). — `supabase/schema.sql:411-474`
- Meeting prep (`POST /api/prep`, `src/agent/prep.ts`) already pulls related past meetings plus top-5 open ledger items. — AGENTS.md API Contracts; `src/agent/prep.ts`

### Inferences
- A project assistant can be built as a `match_project_chunks(query_embedding, p_project_id, …)` RPC, plus a members check in the route, plus a second retrieval over `ledger_items` (which already has embeddings) and over tasks/PR titles (new embeddings or plain keyword match). Citations already exist in spirit, because search returns `meetingId` and `meetingTitle`.
- Generating "AI proposed tasks" only needs `/api/ai/process` to stop auto-creating follow-ups and write `action_items.review_state='proposed'`. The extraction prompt already returns assignee and due date.

### Gaps
- Not verified: whether the process route's extraction schema includes priority and an "explicit acceptance" signal for assignee suggestion (PDF p20). The ledger extraction (speaker, assignee, quote) is the closest match.

## Q4. Signature features: where they slot into the PDF

### Takeaway
All three signature features fit the PDF without conflict. Promise Ledger → the Decisions tab and task evidence. Live Ledger → the live meeting side panel (next to Transcript/Chat/People). Tasdeeq → the post-meeting review step, which matches the PDF's "nothing is created without human review" ethos. Live Ledger and Tasdeeq are entirely uncommitted in git.

### Cited Findings
- Promise Ledger is merged (PR #12, commits `8f419a0`, `208a98d`). Uncommitted edits continue in `src/agent/ledger*.ts`, `src/app/api/ledger/route.ts` and `LedgerTab.tsx`. — `git log`; `git status`
- Live Ledger: LL0–LL4 done, LL5 (live two-person verify) pending. All of its files are untracked: `src/app/api/ledger/live/`, `src/components/live-ledger/` (`LiveLedgerPanel`, `LiveLedgerCard`, `AgreementPrompt`, `CardPreview`), `src/hooks/useLiveLedger.ts`, `src/lib/live-ledger-*.ts`, `docs/specs/0002-live-ledger/`. — `context/progress-tracker.md`; `git status`
- `LiveLedgerPanel` is already mounted inside `MeetingRoom.tsx` (line 940). — `src/components/MeetingRoom.tsx:49,940`
- Tasdeeq Verified Minutes: T1–T5 done in code, with the live three-person run and the planted-error study still owed. Untracked: `src/app/api/minutes/` (8 routes), `src/agent/minutes*.ts`, `src/lib/minutes-*.ts`, `MinutesTab.tsx`, `MinutesReview.tsx`, `src/app/minutes/verify/[sealId]/page.tsx`, `scripts/tasdeeq-seed.ts`, `docs/specs/0003-tasdeeq-verified-minutes/`. It needs `MINUTES_SIGNING_PRIVATE_KEY`/`MINUTES_SIGNING_KEY_ID`. — `context/progress-tracker.md`; `git status`
- The git diff over tracked files is 33 files, +1,359/−55 lines, uncommitted. — `git diff --stat`
- The PDF's Decisions screen is "technical decisions extracted from meetings with tags, source meeting, date and participants; clicking opens the original meeting context and transcript". — PDF p23
- The PDF meeting detail has Decisions and Action Items tabs and an "Outcome" card (decisions, action items, tasks created, awaiting review). — PDF p20 screenshot

### Inferences
- PDF Decisions tab = a project-scoped view of `ledger_items` where kind='decision' (plus `source='live_agreement'` items labelled "agreed by N of M"). It shows quotes and kept/reversed status, which exceeds the PDF.
- PDF task evidence (screen 07) can show ledger `kept` links with their quotes next to GitHub merge evidence. The two sources together form the "conversation → code" proof.
- PDF Live Meeting right panel tabs (Transcript, Chat, People): add a "Ledger" tab hosting `LiveLedgerPanel`.
- Tasdeeq fits as an optional "Verify minutes" step after the AI Summary, before tasks are confirmed. It must respect the 409 lock rules (process, upload and download are blocked under review).

### Gaps
- Unclear whether the PDF's author knows about the three signature features. None of them appear in the PDF.

## Q5. UI and design-token conflicts

### Takeaway
The current app is already a light content area with a dark sidebar (`inverse-surface #2D303D`) and a violet accent (`#830EF9`). The PDF is all-light (white sidebar), deep indigo primary, blue secondary, and green/amber/red status colours. Migration is mostly a token value swap in `tailwind.config.ts` (63 component files use semantic tokens), plus restyling a handful of files that hard-wire the dark shell.

### Cited Findings
- Tokens are locked from the Stitch redesign: `primary #6500C4`, `primary-container #830EF9`, `secondary #525B8E`, `surface #FAF8FF`, `inverse-surface #2D303D` (dark sidebar). Invariant: "Shell is dark, main content area is light". Fonts are Hanken Grotesk and JetBrains Mono. — `context/ui-tokens.md`
- Tokens are defined in `tailwind.config.ts` (`darkMode: ["class"]`, colours at lines 29–53). `src/app/globals.css` keeps a shadcn `.dark` variable block (line 188). — `tailwind.config.ts`; `src/app/globals.css`
- 63 `.tsx` files use `primary-container`/`surface-container` tokens. Only 14 `dark:` class usages exist. — grep of `src`
- Files using `inverse-surface` (dark shell): `src/app/layout.tsx`, `src/app/error.tsx`, `src/app/(root)/meeting/[id]/page.tsx`, `FloatingChat.tsx`, `DeviceSetup.tsx`, `Sidebar.tsx`, `MeetingRoom.tsx`, `ui/sidebar.tsx`, `live-ledger/CardPreview.tsx`, `auth/AuthLayout.tsx`. — grep of `src`
- PDF design: "Light, professional SaaS style: deep indigo primary, blue secondary, off-white canvas, white cards, green/amber/red status colours. Desktop-first and responsive." The screenshots show a white sidebar, an indigo active pill, a dark full-screen live meeting, and a sans UI font with mono for repo names and IDs. — PDF p2, p8, p11, p18
- The token set has no success/warning colours. Status uses `error-container` and `secondary-container` only. — `context/ui-tokens.md` (Status table)
- `context/designs/` holds 16+ locked Stitch PNG/HTML screens (dashboard, follow-ups, meeting tabs, join, new meeting, landing, sign-in). The Design Fidelity Rule binds work to them. — `context/designs/`; AGENTS.md

### Inferences
- Token migration touches: `tailwind.config.ts` (values; add `success`, `warning` and their containers), `context/ui-tokens.md` (rewrite the invariants, since "shell is dark" flips), `context/ui-rules.md`, `context/designs/` (superseded, which needs an explicit decision because the Design Fidelity Rule references them), the 10 `inverse-surface` files above, and `src/tailwind-config.test.ts` (it asserts token values). The live meeting stays dark in both designs, so `MeetingRoom.tsx` styling barely changes.
- Because components use semantic names, swapping the hex values rethemes most screens without touching components.

### Gaps
- Exact PDF hex values and type scale are not given; they would need sampling from the screenshots. The PDF font looks like Inter but this is unconfirmed.

## Q6. Live captions and transcription

### Takeaway
Transcription is post-call only. Stream individual (per-participant) recordings → ffmpeg → Groq Whisper (EN/UR) → merged speaker-labelled transcript → existing pipeline. There is no live caption or live transcript code. The PDF's "Transcribing" badge, caption strip and live Transcript panel are missing.

### Cited Findings
- `src/agent/transcript-generation.ts` is server only. It takes Stream per-participant `.mkv` recordings, extracts 16 kHz mono audio with `ffmpeg-static`, and sends chunks to Groq Whisper with EN/UR auto-detect. "Groq is the SOLE speech-to-text provider — no fallback." — `src/agent/transcript-generation.ts:1-12`
- Trigger is on demand: `POST /api/transcript/download`, with status polled via `GET /api/transcript/status`. — AGENTS.md API Contracts; `src/app/api/transcript/download/route.ts`
- `MeetingRoom.tsx` has 0 matches for `startClosedCaptions|closed_caption|captions`. Comments at lines 325–339 and 486 concern individual audio recording feeding transcripts. — `src/components/MeetingRoom.tsx`
- Composite (mixed video) recording was proven non-functional on this Stream account (D3.4 parked). — `context/progress-tracker.md`
- Live Ledger "speech trigger is a stretch step only" and the zero-cost rule forbids "paid captions, no extra Whisper calls". — AGENTS.md (Live Ledger section)

### Inferences
- Live captions in the PDF would need Stream's closed-caption/transcription feature, whose free-tier availability must be verified with the `stream-react` skill per AGENTS.md. The AGENTS.md rule explicitly excludes paid captions. This is a likely conflict with the zero-cost rule.

### Gaps
- Stream free-tier closed-caption availability was not checked (out of scope: read-only codebase research).

## Q7. Auth, Clerk organisations and ownership checks

### Takeaway
Clerk is used for individual users only. There are zero organisation usages. Authorisation is hand-rolled per route (owner via `meetings.user_id`, participant via `attendance_events`, guest via Stream token).

### Cited Findings
- No matches for `organization|orgId|useOrganization|OrganizationSwitcher` in `src`. — grep of `src`
- `src/middleware.ts` protects `/dashboard`, `/personal-room`, `/previous`, `/recording`, `/upcoming`, `/meeting`, `/meeting-intelligence`, `/follow-ups`, `/ai-chat` and `/settings`. Public routes are `/`, sign-in/up, `/verify-email` and `/meeting/:id/guest`. Note that `/search` and `/prep` are not in the protected list (pages are under `(root)/(home)`, whose layout may guard them). — `src/middleware.ts`
- Owner-only routes per the contract: guest admit/deny, attendance report, meeting/recording/follow-up delete, ledger match/review, live checkin/card/agreement, minutes review/seal. Participant routes: live vote, `GET /api/minutes`, transcript download. — AGENTS.md API Contracts
- Participant resolution helper for Live Ledger: `src/lib/live-ledger-auth.ts`. — file list

### Inferences
- Two paths for projects: (a) Clerk Organisations (gives invitations, roles and an org switcher out of the box, but a Clerk org is a tenant, and users switching orgs conflicts with the PDF's "My Dashboard across all projects"), or (b) app-level `projects`/`project_members` in Supabase with Resend invites. Path (b) better fits "a user belongs to many projects, personal views aggregate across them" and keeps Supabase as the single source of truth. AGENTS.md lists "multi-tenant/org accounts" as out of scope, so either path needs an explicit scope change.

### Gaps
- Clerk free-tier limits on Organisations were not checked.

## Q8. Codebase size and what is reusable untouched

### Takeaway
About 43k lines of TS/TSX: 22 page/layout routes, 41 API route files, 74 components, 77 test files (555 vitest tests at T5). The meeting engine (Stream wrappers, guest flow, attendance, transcript generation, AI process/embed/RAG, ledger, minutes, email) can be reused as is. The app shell, navigation, dashboard and follow-ups are the parts to rework.

### Cited Findings
- 22 `page.tsx`/`layout.tsx` files under `src/app`; 41 `route.ts` files under `src/app/api`; 74 non-test components; 77 test files; 21 files in `src/agent`; about 43,099 lines across `src/**/*.ts*`. — `find`/`wc` on the repo
- 555 vitest tests in 77 files green at Step T5; tsc clean; build exit 0. — `context/progress-tracker.md` (Step T5)
- Stack: Next 15.5, React 19.1, Clerk 6.35, Stream video-react-sdk 1.40 / node-sdk 0.7, Supabase JS 2.112, AI SDK 7 with `@ai-sdk/google` and `@ai-sdk/groq`, pdf-lib, ffmpeg-static, react-hot-toast, zod 4. No drag-and-drop or GitHub library is installed (no `@octokit/*`, no `dnd-kit`). — `package.json`

### Inferences
- Reuse as is: `src/agent/*` (models, embed, rag, ledger, ledger-match, minutes, prep, transcript-generation, speaker-insights), `src/actions/stream.actions.ts`, `src/Providers/`, the guest flow (`src/app/api/guest/*`, `src/lib/guest-store.ts`), attendance (`useAttendanceTracking`, `/api/attendance/*`, `attendance-pdf.ts`), `/api/transcript/*`, `/api/ai/*`, `/api/minutes/*`, `/api/ledger/*`, `src/lib/email.ts`, `useLoadingTimeout` and `LoadError`.
- Extend: `/api/meetings` (project filter), `/api/ai/process` (proposed-task review state), the RAG RPCs (project scope), `MeetingTabs` (regroup tabs), `MeetingRoom` (side panel tabs and captions), `MeetingModel` (participants, type, project).
- Replace or redesign: `Sidebar.tsx` and `constants/index.tsx` (navigation), `DashboardContent.tsx`, follow-ups pages (become tasks), `SettingsPage.tsx` (add connected accounts).
- New dependencies likely: a drag-and-drop library for the kanban and Octokit/GitHub App webhooks. Both are free, but AGENTS.md requires loading their skill or docs first.
- Rough total for the migration (one developer): projects, members and invites about 2–3 weeks; tasks and kanban plus review gate about 2 weeks; GitHub integration and activity about 3–4 weeks; project assistant and decisions about 1 week; shell, token restyle and dashboard about 1–2 weeks. That is roughly 9–12 weeks before polish. This is an inference from the matrix, not a measured estimate.

### Gaps
- Lines of code per area and test coverage per module were not measured.
- Whether this is a fork/new product ("Prepared for Waqas Irshad") or a pivot of the existing FYP is not stated in the PDF. That decides whether the meeting-first screens (Recordings, Personal Room, Prep) are kept.
