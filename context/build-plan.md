# Build Plan

Order matters — each step depends on the one before it being real, not assumed. Each step gets its own `/architect` pass, its own approved prompt in `prompts/`, and its own verification before moving on.

---

## Step 0 — Fix existing bugs (foundation)
- `middleware.ts` route matcher — add leading slashes, match real paths
- `stream.actions.ts` — fix `issued` timestamp calculation
- Remove duplicate `sonner` usage in favor of `react-hot-toast`
- `MeetingSetup.tsx` — fix missing `break` in the `music calls` switch case

## Step 0.5 — Auth system verification
Test-and-verify checkpoint. Do not proceed to Step 3.5 until this passes.

**Test matrix:**
- [ ] Sign-up flow — new user creation works end-to-end
- [ ] Sign-in flow — existing user authenticates successfully
- [ ] Sign-out — session cleared, redirect to public page
- [ ] Session persistence — close tab, reopen, still authenticated
- [ ] Protected route redirect (unauthenticated) — direct URL to `/dashboard` bounces to sign-in
- [ ] Protected route redirect (authenticated) — direct URL to `/`, `/sign-in`, `/sign-up` bounces to `/dashboard`
- [ ] OAuth flows — Google and/or GitHub sign-in work end-to-end
- [ ] Edge case: expired session — token refresh or graceful re-login
- [ ] Edge case: direct URL access while authenticated on public routes
- [ ] Middleware + client-side redirect both fire correctly (no double-redirect loops)

**Outcome:** All checkboxes pass → proceed to Step 3.5. Any failure → fix before moving on.

## Step 3.5 — Existing feature audit + redesign
Sequential, one-at-a-time verification + redesign. Do not batch features — each must pass both function and design checks before the next opens.

For each feature:
1. **Test** — confirm current implementation works functionally
2. **Fix** — resolve anything broken
3. **Redesign** — match `context/ui-tokens.md` + relevant `context/designs/*.png` (where a matching design exists). Same Design Fidelity Rule as the dashboard shell: no invented styling.
4. **Verify** — both function and design pass → close this feature, open the next.

**Features in order:**
1. Meeting Room — grid/speaker layouts, controls, participant list, end call
2. Meeting Setup — device/mic checks, audio type selection
3. New Meeting — modal creation flow
4. Join Meeting — modal join flow
5. Previous — past meetings list
6. Upcoming — scheduled meetings list
7. Recording — recording list
8. Personal Room — personal room page

## Step 1 — Supabase setup
- Create Supabase project (free tier)
- Enable `pgvector` extension
- Create tables: `meetings`, `transcripts`, `meeting_insights`, `action_items`, `follow_ups`, `meeting_chunks`
- Create `match_meeting_chunks` RPC function for similarity search
- Add `lib/supabase-client.ts` and `lib/supabase-server.ts`

## Step 2 — AI provider setup
- Install `ai`, `@ai-sdk/google`, `@ai-sdk/groq`
- Add `agent/models.ts` with Gemini primary + Groq fallback
- Verify both keys work with a trivial `generateText` call before building features on top

## Step 3 — Upload Transcript → AI Processing
- `POST /api/transcript/upload` — store transcript
- `POST /api/ai/process` — `generateObject` extraction (summary, key points, decisions, category, action items)
- Write results to `meeting_insights` and `action_items`
- Wire the existing "Upload Transcript" Quick Action card to this flow

## Step 4 — Meeting Intelligence UI
- Meeting List page (reads `meetings` + `meeting_insights`)
- Selected Meeting header + tabs: Overview, Summary, Action Items, Recording, Category
- Recording tab reads the Stream recording URL for that call

## Step 5 — RAG embeddings
- `POST /api/ai/embed` — chunk transcript, embed via Gemini embedding model, store in `meeting_chunks`
- Runs automatically right after Step 3's processing completes

## Step 6 — AI Chat (meeting-scoped + general)
- `POST /api/ai/chat` — streamed, retrieves top-k chunks via `match_meeting_chunks` when `meetingId` present
- `ChatPanel` component (AI SDK `useChat`), used in `AiChatTab` and general `/ai-chat`

## Step 7 — Follow-ups
- Auto-generate `follow_ups` rows from `action_items` after Step 3
- Follow-up List + Details pages, status update Server Action

## Step 8 — Recordings + Settings polish
- Recordings library page, linking each recording back to its meeting's insight page
- Settings page (basic preferences)

## Step 9 — Playwright regression pass
Full end-to-end regression. This is the final checkpoint, not the only one — Steps 0.5 and 3.6 catch issues earlier.
- Join meeting, upload transcript → insights appear, ask a question in AI Chat, mark a follow-up complete

## Step 10 — Deploy, then polish and harden
- Deploy to Vercel (free tier)
- Verify every navigation path, loading state, error state, and that no secret leaks to the client bundle
- Confirm all AI/DB usage stays within Supabase and Gemini/Groq free-tier limits

---

Each step = one short prompt naming the relevant skills, one AI-written plan in `prompts/`, one approval, one implementation, one verification — per the Vibe Engineering loop.
