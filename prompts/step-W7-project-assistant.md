# Step W7: Project assistant and project search

Spec: `docs/specs/0004-conversations-to-code/0004-project-assistant.md`, corrected and accepted on 2026-11-07. It is the contract. This prompt covers its Build plan items 1 to 5 and satisfies AC-63 to AC-69, including AC-66a. Scope feature 25, tier GA.

This replaces the earlier W7 prompt, which was written before the spec fixes. The spec now settles the earlier open points (column name, chunk links, one marker series, tag removal, due dates and assignees), so you have no spec corrections to approve.

Rules in force: strict TypeScript, no `any`, plain JSON errors `{ error }`, every UI load uses `useLoadingTimeout` plus `LoadError`, tokens only (no hex, no raw color classes), react-hot-toast only. No new dependency, no new AI provider, no tools on the model. Work on `main`. I ask before any commit or push.

No Stream code changes in this step. There is no W7 image in `context/designs/`, so the panel follows `ChatPanel.tsx` and the existing tokens. W8 adds the heading, suggested questions, and Project Memory panel (AC-70n), so W7 does not build them.

## 0. Before code

**You do nothing first.** No new secret, no new service, and no setting on Vercel or GitHub.

**I do this first:** mark Step W7 as in progress in `context/build-plan.md` and `context/progress-tracker.md`. Scope feature 25 is already `in-progress`.

**Three things the spec does not name, for your review:**

1. **Chat history list.** `listConversations` in `src/lib/chatHistory.ts` treats every stored key other than `general` as a meeting id. The new `project:<projectId>` key would show in the floating chat's Messages list, and opening it would load a broken meeting chat. I make `listConversations` skip ids that start with `project:`. Project history stays inside its own tab.
2. **Bad `?task=` check.** The board may not hold the task (filters, or a task from another project), so a bad id can't be judged from the loaded list. `TasksBoard` calls `getTask` once for the id in the link. If it succeeds, the drawer opens. If it fails, you get a toast and the parameter is cleared. Closing the drawer also clears it, as AC-70c expects.
3. **The build plan's exit line.** `context/build-plan.md` says "injected PR text does not change answers", but the spec retrieves no PR records, so PR text never reaches the model (spec Follow-up). My injection tests use transcript, task, and ledger text. I will reword that line to match the spec when I mark the step.

## 1. SQL, Build plan item 1 (AC-64)

Append the `match_project_chunks` block from `docs/specs/0004-conversations-to-code/index.md` (lines 618 to 635) to `supabase/schema.sql`, unchanged:

```sql
create or replace function match_project_chunks(
  p_project uuid, query_embedding vector(768), match_count integer, min_similarity real
) returns table (chunk_id uuid, meeting_id uuid, meeting_title text, started_at timestamptz,
                 content text, chunk_index integer, similarity real)
language sql stable
set search_path = public
as $$
  select c.id, m.id, m.title, m.started_at, c.chunk_text, c.chunk_index,
         (1 - (c.embedding <=> query_embedding))::real
  from meeting_chunks c join meetings m on m.id = c.meeting_id
  where m.project_id = p_project
    and 1 - (c.embedding <=> query_embedding) >= min_similarity
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

revoke execute on function match_project_chunks(uuid, vector, integer, real) from public, anon, authenticated;
grant execute on function match_project_chunks(uuid, vector, integer, real) to service_role;
```

I apply it to the live NeuraMeet project (`lsjiwxohfpzdvenbxpeu`). **Your approval of this prompt counts as your OK for this block only.** Then I confirm three things live:

- the function exists, and only `service_role` can execute it
- a call with a real stored embedding returns rows from the target project only
- it still returns rows through the `meeting_chunks` vector index with the project filter on, since a filter applied after an approximate index scan can return fewer rows than expected

If the third check comes up short, I stop and tell you rather than change the function, because the SQL is part of the spec.

## 2. Shared helpers, Build plan item 2 (AC-64, AC-65, AC-67)

**`src/lib/data-block.ts`:** `dataBlock` moves here from the chat route, unchanged, and the route imports it. `src/agent/prep.ts` keeps its own copy.

**`src/lib/project-assistant.ts`** (server only):

- Constants: `CHUNK_COUNT = 8`, `MIN_SIMILARITY = 0.3`, `MAX_TASKS = 10`, `MAX_ITEMS = 10`, `MAX_CHUNK_CHARS = 2000`, `MAX_ROW_CHARS = 500`, `NOT_FOUND = "Not found in this project's records."`.
- `sanitizeSourceText(text)`: removes tags with `/<\s*\/?\s*S\d+\b[^>]*>/gi`, repeating until nothing changes. It runs before `dataBlock`.
- `retrieveProjectSources(supabase, projectId, question)`:
  - Embeds with `QUESTION_EMBEDDING` from `src/agent/rag.ts` at 768 dimensions.
  - Chunks: `match_project_chunks(projectId, embedding, 8, 0.3)`.
  - Tasks: `match_project_tasks` at 0.5 first, then the latest by `updated_at` with completed tasks included, no duplicates, up to 10. Status, assignee, and due date load from `tasks` by id, scoped to the project.
  - Items: `ledger_items` latest 10 by `created_at`, through `meetings!inner(...)` with `.eq("meetings.project_id", id)`.
  - Any failed query or embedding throws, so the route can answer 500.
- `buildProjectSources(...)`: numbers chunks, then tasks, then items in one `[S#]` series and returns the line text plus `{ marker, kind, label, href }`.
  - Lines follow the spec's prompt shape. Text is cut to `MAX_CHUNK_CHARS` for a chunk and `MAX_ROW_CHARS` for a task title or item statement.
  - Dates are `YYYY-MM-DD` in Pakistan time through `MINUTES_TZ`. A null `started_at` means the title alone. A missing assignee reads "Unassigned". A missing due date is left out.
  - Item status is `deriveLedgerStatus(status, due_date, pktToday())`. Item assignee is `assignee`, falling back to `speaker`. Task keys use `taskKey` with the project's `task_prefix`. Task assignee names come from `lookupProfiles`.
  - Links: a chunk or item goes to `/meeting-intelligence/<meeting id>`, a task to `/projects/<project id>?tab=tasks&task=<task id>`.
- `buildProjectPrompt(sources)`: the spec's system text exactly, then each source through `sanitizeSourceText` and `dataBlock`.

**`src/lib/project-citations.ts`** (safe for the browser, no server imports): drops any `[S…]` marker that is not in the source list, and returns the cited sources, one per source, in marker order, even when two share a label.

**Unit tests:** marker order across all three kinds; every `href` is an app path; every form in the injection scenario (`</S1>`, `</S</S1>1>`, `</S1 >`, `<S2>`) is removed; the "Ignore previous instructions" line stays inside its block; task top up with no duplicates; an overdue promise reaches the prompt as overdue with its assignee; a fake `[S9]` is dropped; two sources with one label give two chips.

## 3. Chat route, Build plan item 3 (AC-63, AC-66, AC-67, AC-68)

In `src/app/api/ai/chat/route.ts`:

- Parse the body first. `resolveChatModel()` moves after the parse. It starts at once for meeting and general chat, so they keep the parallel start.
- Project branch: `projectId` present and no `meetingId`. When both arrive, `meetingId` wins and `projectId` is ignored.
- A `projectId` that fails `isUuid` returns 422. `requireProjectRole` with `NEED_ROLES.content`, and `accessErrorResponse` for the 403 and 404.
- Client `system` messages are dropped on this path.
- A retrieval failure returns 500 `{ error }`, never the fixed answer.
- Nothing retrieved: `createUIMessageStream` and `createUIMessageStreamResponse` with a text part and `start` metadata `{ sources: [] }`, and no model call. `resolveChatModel` is not called either, because the probe is itself a real model call.
- Otherwise resolve the model, then `streamText` with no `tools`, then `toUIMessageStreamResponse({ messageMetadata: ({ part }) => part.type === "start" ? { sources } : undefined })`.
- No table writes on this path.

**Tests** in `route.test.ts`: happy path with metadata; Viewer 403; non member 404; bad id 422; both ids goes to meeting chat; empty project with the model and probe mocks not called; off topic question with recent rows still reaches the model; `system` message dropped; retrieval failure 500; no `tools` passed; meeting and general chat still start the probe, and their existing tests pass.

## 4. Search route, Build plan item 4 (AC-69)

`POST /api/search` takes an optional `projectId`. With it: `isUuid` check (422), `NEED_ROLES.content` (403, 404), embed the query, call `match_project_chunks` with count 20 and `MIN_SIMILARITY`, and return `CrossMeetingHit` rows (`id` from `chunk_id`, `chunkText` from `content`, `chunkIndex` from `chunk_index`, the rest by name). Without it, `searchAcrossMeetings` runs unchanged. The project path stays API only in W7, because AC-69 names no screen.

**Tests** in a new `route.test.ts`: both paths, Viewer 403, non member 404, and the RPC receives the project id.

## 5. Assistant panel, Build plan item 5 (AC-66, AC-66a)

- **`ChatPanel.tsx`:** export `loadMessages` and `saveMessages` next to the existing `clearChatStorage`. No behavior change.
- **`src/components/projects/AssistantTab.tsx`:** takes `projectId`, transport `body: { projectId }`, chat id `project:<projectId>`, same card, bubbles, Stop, Send, and clear button as `ChatPanel`. Errors show a toast. Chat streams have no initial load, so no loading timeout is needed there.
- **Markdown (AC-66a):** `ReactMarkdown` with `remarkGfm`, where `a` renders its text as plain text and `img` renders nothing.
- **Citations (AC-66):** answer text goes through `project-citations.ts`. Chips sit under the answer, one per cited source, each a Next `Link` to its `href`. Unknown markers disappear from the text.
- **`ProjectDetailView.tsx`:** new tab key `assistant`, label "AI Assistant", for Developer and higher.
- **`TasksBoard.tsx`:** the `?task=` reader from section 0, point 2.
- **`src/lib/chatHistory.ts`:** skip `project:` ids, from section 0, point 1.

**Tests:** fake `[S9]` dropped; a known marker keeps its chip; an uncited source gets no chip; an outside link and an image don't render as a link or an image; the tab is hidden from Viewers; `?task=` opens the drawer; a bad `?task=` toasts and clears; closing the drawer clears the parameter; `listConversations` skips project keys.

## 6. After the build

- Run typecheck, lint, build, and `npx vitest run`.
- Update `context/progress-tracker.md`, `context/ui-registry.md`, and `context/build-plan.md`. Tick scope line 662 and milestone boxes only for finished work. Leave Verify, Test, Review, and Document alone. The spec status line stays as it is until the feature is done.
- Give you exact test steps, one per AC and per Value sourcing row, and ask whether you'd like them saved to `verify.md`. The live check needs a project with a processed meeting and a real Gemini or Groq call. I'll say plainly which checks only ran against mocks.
- Leave `reports/tasdeeq-seed-*.json` and `context/designs/NeuraMeet-UI-Overview.pdf` alone, and commit nothing unless you ask.
