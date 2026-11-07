# 0004. Conversations to Code, Project Workspace

**Status**: In Progress
**Date**: 2026-11-03
**Mode**: FEATURE
**Scope feature**: [docs/scope/scope.md, rows 20 to 27. Project Workspace](../../scope/scope.md)
**Workflow tier**: GA
**Build approach**: Extend, built as end to end slices (one W step at a time, each one shippable)
**Builds on**: [0001. Promise Ledger](../0001-promise-ledger/index.md) · [0002. Live Ledger](../0002-live-ledger/index.md) · [0003. Tasdeeq, Verified Minutes](../0003-tasdeeq-verified-minutes/index.md)

## Structure

This is an umbrella spec. This file holds the shared contract every step builds on: the role matrix, the final SQL, the authorization helper, the full API list, the free tier budget, and the build order. Each child spec is complete enough to build its step from on its own.

| Child spec | What it is | Decision it supports | ACs |
|---|---|---|---|
| [0004-projects-roles.md](0004-projects-roles.md) | W1. Projects, members, roles, `requireProjectRole`, route migration, offboarding | Role matrix, authorization, offboarding | AC-1 to AC-12 |
| [0004-invitations.md](0004-invitations.md) | W2. Email invites, link invites, join requests, copy link fallback | Invitations | AC-13 to AC-22 |
| [0004-project-meetings.md](0004-project-meetings.md) | W3. Meetings inside a project, moving a meeting in, the consent notice, retention | Project meetings, retention, members only call type | AC-23 to AC-29, AC-30a, AC-30b |
| [0004-review-gate-tasks.md](0004-review-gate-tasks.md) | W4. Proposals, the review gate, keyed tasks, the Kanban board | Review gate, tasks | AC-30 to AC-42 |
| [0004-github.md](0004-github.md) | W5. GitHub App, webhooks, linking rules, revert, Sync | GitHub | AC-43 to AC-56 |
| [0004-proof-chain.md](0004-proof-chain.md) | W6. Decisions and Promises tab, code evidence, Outcome card, Activity | Proof Chain surfaces | AC-57 to AC-62 |
| [0004-project-assistant.md](0004-project-assistant.md) | W7. Project scoped chat and search | Project assistant | AC-63 to AC-69 |
| [0004-workspace-shell.md](0004-workspace-shell.md) | W8. Workspace shell, personal views, notifications, daily digest, Ctrl K | Notifications, digest, shell | AC-70 to AC-79 |
| [0004-security-e2e.md](0004-security-e2e.md) | W9. Security suite and the bilingual end to end run | Verification | AC-80 to AC-84 |

Reasoning and options: see [rationale.md](rationale.md).

## Summary

NeuraMeet becomes a project workspace. You create a project, invite your team with a role (Owner, Admin, Developer, Viewer), and hold the project's meetings inside it. After a meeting, the AI no longer creates follow ups on its own for project meetings. It proposes tasks, each tied to the exact quote that produced it, and an Owner or Admin confirms them. Confirmed tasks get a key such as `NM-42` and live on a Kanban board.

When a developer opens a pull request (a proposed code change on GitHub) that says "Closes NM-42" and it is merged into the main branch, the task completes on its own, and the promise it came from gets a "kept" suggestion that the Owner or Admin confirms. That chain, from spoken quote to reviewed task to merged code to kept promise, is the Proof Chain, and it is what makes this feature worth building. Everything uses tools you already run for free: Supabase, Gemini and Groq, Stream, Clerk, Vercel Hobby, Resend, and a free GitHub App.

## Requirements

### User stories

- As a project Owner, you want to create a project and invite your team with a clear role, so each person sees exactly what their role allows.
- As an Owner or Admin, you want people who open a shared link to wait for your approval, so a forwarded link never lets a stranger in.
- As a member, you want a clear notice before a project call that it is recorded, transcribed, and kept, so you agree knowingly.
- As an Owner or Admin, you want the AI to propose tasks with the quote behind each one, so you confirm real commitments instead of AI guesses.
- As a Developer, you want to create tasks and move your own or unassigned ones on a board, so the board matches the work.
- As an Owner, you want to connect GitHub once, so merged pull requests complete tasks without anyone updating the board by hand.
- As an Owner or Admin, you want a merged pull request to suggest that the linked promise was kept, and you confirm it, so the ledger stays human checked.
- As a member, you want to see the full chain for a promise (quote, task, pull request, outcome), so you can show what was said and what was shipped.
- As a Developer, you want to ask questions about one project's meetings and tasks, with citations, so answers stay inside that project.
- As a member, you want in app notifications and an optional morning digest, so you notice what needs you without checking every page.
- As a removed member, you lose access at once, and your open tasks become unassigned, so nothing stays stuck on you.

### Acceptance criteria

The acceptance criteria live once, in the child spec that builds them (see the AC column in Structure). Each is IDed globally (AC-1 to AC-84), so `/develop` and `/check verify` can cite them without ambiguity. The shared contract below (role matrix, SQL, API, invariants) binds every child.

## Decision

**Chosen option**: Option B, our own Supabase tables for projects and roles, one shared server role check, a human review gate before any task exists, and a free GitHub App whose merge completes the task while the promise waits for the Owner or Admin to confirm.

Projects, members, roles, invitations, tasks, and GitHub links live in new Supabase tables behind one `requireProjectRole` helper, extend the existing `action_items` and `ledger_links` tables instead of duplicating them, and reuse Gemini, Groq, pgvector, Stream, Resend, and the existing API style, with no new paid service and no new AI provider (basis: your AGENTS.md, the zero cost rule and the Phase W locked decisions).

**Implementation skills**: `stream-react` (getstream, `.claude/skills/stream-react/`) for the W3 join and consent screen · `architect`, `develop`, `test`, `audit` workflow skills.

## Feature design

### Role matrix

"Member" means an active member (a `project_members` row with `removed_at is null`). Personal meetings (no `project_id`) keep today's rules: `meetings.user_id` is the owner.

| Capability | Owner | Admin | Developer | Viewer |
|---|---|---|---|---|
| See the project, member list, meeting list, summaries, categories | yes | yes | yes | yes |
| See Decisions and Promises, tasks, board, Activity | yes | yes | yes | yes, without quotes, transcript lines, or private repo details (removed on the server) |
| See transcripts, recordings, engagement, AI chat, project assistant, search | yes | yes | yes | no |
| See repo names, PR titles and links on private repos | yes | yes | yes | no (sees "Completed by merge") |
| Create a project meeting, move your own personal meeting in | yes | yes | yes | no |
| Join a project call (consent tick required) | yes | yes | yes | yes |
| Upload or generate a transcript, run AI processing, embed | yes | yes | no | no |
| Attendance PDF, guest admit and deny, Live Ledger owner actions, Tasdeeq open and seal and assign | yes | yes | no | no |
| See proposals | yes | yes | read only | no |
| Confirm, reject, or merge proposals | yes | yes | no | no |
| Review ledger links (meeting and code) | yes | yes | no | no |
| Create a task | yes | yes | yes | no |
| Move, edit, assign a task | any task | any task | own or unassigned (may assign an unassigned task to self) | no |
| Complete a task by hand (evidence note required) | any | any | own | no |
| Invite by email or link, approve join requests, revoke invites | yes | yes | no | no |
| Change a role | any role except own | Developer and Viewer only, never own, never Admin | no | no |
| Remove a member | anyone but self | Developers and Viewers (checked inside `remove_project_member`) | no | no |
| Leave the project | after transferring | yes | yes | yes |
| Transfer ownership (to an active Admin) | yes | no | no | no |
| Connect GitHub, link and unlink repos | yes | no | no | no |
| Run GitHub Sync | yes | yes | no | no |
| Delete a project meeting | yes | no | no | no |
| Delete the project (typed confirm, deletes its meetings too; 409 while any of them has sealed minutes) | yes | no | no | no |

Every route that is "owner only" today now accepts the project Owner or Admin when the meeting has a `project_id`, except meeting delete, which stays Owner only.

### Authorization contract (`src/lib/project-auth.ts`, server only)

```ts
export type ProjectRole = "owner" | "admin" | "developer" | "viewer";
export type MeetingNeed = "read" | "content" | "manage" | "owner";

export class ProjectAccessError extends Error {
  constructor(public status: 403 | 404, message: string) { super(message); }
}

// Throws 404 when the caller is not an active member (never reveals the project exists),
// 403 when the caller's role is not in `allowed`.
export async function requireProjectRole(
  supabase: SupabaseClient, userId: string, projectId: string, allowed: readonly ProjectRole[],
): Promise<{ role: ProjectRole }>;

// One gate for every meeting route. Personal meeting: "manage" and "owner" need
// meetings.user_id === userId; "read" and "content" keep each route's existing
// participant rule (passed in as `personalFallback`). Project meeting:
// read → any role, content → owner|admin|developer, manage → owner|admin, owner → owner.
export async function requireMeetingAccess(
  supabase: SupabaseClient, userId: string, meetingId: string, need: MeetingNeed,
  personalFallback?: () => Promise<boolean>,
): Promise<{ meetingId: string; projectId: string | null; role: ProjectRole | null }>;
```

Rules: every check reads `project_members` on every request (no caching, so removal takes effect at once). A route turns `ProjectAccessError` into its status with a plain message. The route migration table is in [0004-projects-roles.md](0004-projects-roles.md).

### Data model (final SQL, appended to `supabase/schema.sql` slice by slice)

```sql
-- ===== W1. Projects and members =====
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  task_prefix text not null check (task_prefix ~ '^[A-Z]{2,5}$'), -- fixed after creation
  next_task_number integer not null default 1,
  created_by text not null,                                        -- Clerk user id
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists project_members (
  project_id uuid references projects(id) on delete cascade not null,
  user_id text not null,                                           -- Clerk user id
  role text not null check (role in ('owner', 'admin', 'developer', 'viewer')),
  added_by text,
  joined_at timestamptz not null default now(),
  removed_at timestamptz,                                          -- null = active
  removed_by text,
  primary key (project_id, user_id)
);
create unique index if not exists project_members_one_owner
  on project_members (project_id) where role = 'owner' and removed_at is null;
create index if not exists project_members_active_user
  on project_members (user_id) where removed_at is null;

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,                     -- no FK, the trail outlives a deleted project
  actor_id text,                       -- null = system or GitHub
  action text not null,                -- e.g. member.removed, invite.created, repo.linked
  target_type text,
  target_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_project on audit_log (project_id, created_at desc);

alter table meetings
  add column if not exists project_id uuid references projects(id) on delete restrict;
create index if not exists meetings_project on meetings (project_id) where project_id is not null;

-- Atomic helpers (supabase-js has no transactions).
create or replace function create_project(p_name text, p_prefix text, p_user text)
returns projects language plpgsql as $$
declare p projects;
begin
  insert into projects (name, task_prefix, created_by) values (p_name, p_prefix, p_user) returning * into p;
  insert into project_members (project_id, user_id, role, added_by) values (p.id, p_user, 'owner', p_user);
  insert into audit_log (project_id, actor_id, action, target_type, target_id)
    values (p.id, p_user, 'project.created', 'project', p.id::text);
  return p;
end $$;

create or replace function transfer_project_ownership(p_project uuid, p_from text, p_to text)
returns void language plpgsql as $$
begin
  perform 1 from project_members where project_id = p_project and user_id = p_from
    and role = 'owner' and removed_at is null for update;
  if not found then raise exception 'not_owner'; end if;
  perform 1 from project_members where project_id = p_project and user_id = p_to
    and role = 'admin' and removed_at is null for update;
  if not found then raise exception 'target_not_admin'; end if;
  update project_members set role = 'admin' where project_id = p_project and user_id = p_from;
  update project_members set role = 'owner' where project_id = p_project and user_id = p_to;
  insert into audit_log (project_id, actor_id, action, target_type, target_id)
    values (p_project, p_from, 'project.ownership_transferred', 'member', p_to);
end $$;

-- Promise Ledger matching on a project meeting looks at the whole project, not only
-- the creator's meetings. Same signature, so the existing callers keep working.
create or replace function match_ledger_candidates(
  p_meeting_id uuid, p_user_id text, match_count int default 15
) returns table (id uuid, meeting_id uuid, kind text, statement text, quote text,
                 assignee text, due_date date, similarity float)
language sql stable set search_path = public as $$
  with target as (select project_id, started_at from meetings where id = p_meeting_id)
  select li.id, li.meeting_id, li.kind, li.statement, li.quote, li.assignee, li.due_date,
         best.similarity
  from ledger_items li
  join meetings m on m.id = li.meeting_id
  cross join target
  cross join lateral (
    select max(1 - (mc.embedding <=> li.embedding)) as similarity
    from meeting_chunks mc where mc.meeting_id = p_meeting_id
  ) best
  where (case when target.project_id is null
              then m.user_id = p_user_id and m.project_id is null
              else m.project_id = target.project_id end)
    and li.status = 'open' and li.embedding is not null
    and li.meeting_id <> p_meeting_id
    and m.started_at < target.started_at
    and best.similarity is not null
  order by best.similarity desc
  limit match_count;
$$;

-- ===== W2. Invitations =====
create table if not exists project_invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  kind text not null check (kind in ('email', 'link')),
  email text check (email = lower(email)),         -- lowercased, email kind only
  role text not null check (role in ('admin', 'developer', 'viewer')),
  token_hash text not null unique,                  -- SHA-256 hex of the raw token
  created_by text not null,
  expires_at timestamptz not null,                  -- created_at + 7 days
  revoked_at timestamptz,
  used_at timestamptz,                              -- email kind only (single use)
  used_by text,
  created_at timestamptz not null default now(),
  check ((kind = 'email') = (email is not null)),
  check (kind = 'email' or role <> 'admin')         -- links never grant Admin
);

create table if not exists project_join_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  invitation_id uuid references project_invitations(id) on delete set null,
  user_id text not null,
  display_name text not null,
  email text,
  role text not null check (role in ('developer', 'viewer')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists project_join_requests_one_pending
  on project_join_requests (project_id, user_id) where status = 'pending';
create unique index if not exists project_invitations_one_live_email
  on project_invitations (project_id, email) where kind = 'email' and revoked_at is null and used_at is null;
create index if not exists project_join_requests_invitation
  on project_join_requests (invitation_id) where status = 'pending';
create index if not exists audit_log_actor_action
  on audit_log (actor_id, action, created_at desc);   -- AC-22 failed accept count

-- ===== W3. Project meetings and consent =====
create table if not exists meeting_participants (
  meeting_id uuid references meetings(id) on delete cascade not null,
  user_id text not null,
  consented_at timestamptz not null,     -- latest tick; every join ticks again
  notice_version text not null,          -- e.g. 'w3-v1'
  primary key (meeting_id, user_id)
);
alter table guest_requests add column if not exists consented_at timestamptz;
alter table meetings add column if not exists stream_call_type text not null default 'default'
  check (stream_call_type in ('default', 'project'));   -- 'project' = members only Stream call type

-- ===== W4. Proposals, tasks, board =====
alter table action_items
  add column if not exists review_state text not null default 'auto'
    check (review_state in ('auto', 'proposed', 'confirmed', 'rejected')),
  add column if not exists quote text,
  add column if not exists quote_speaker text,
  add column if not exists quote_line integer,
  add column if not exists quote_verified boolean not null default false,
  add column if not exists proposed_assignee_id text,   -- set only by the own track rule
  add column if not exists duplicate_of_task_id uuid,   -- FK added after tasks exists
  add column if not exists duplicate_score real,
  add column if not exists embedding vector(768),        -- title, copied to the task on confirm
  add column if not exists merged_into_task_id uuid,     -- set by a merge decision; FK below
  add column if not exists reviewed_by text,
  add column if not exists reviewed_at timestamptz;

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  number integer not null,                               -- key = projects.task_prefix || '-' || number
  title text not null check (char_length(title) between 1 and 200),
  description text,
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'in_review', 'completed', 'blocked')),
  position double precision not null default 0,          -- order inside a column
  assignee_id text,                                      -- null = Unassigned
  due_date date,
  source_action_item_id uuid unique references action_items(id) on delete set null,
  source_meeting_id uuid references meetings(id) on delete set null,
  quote text,                                            -- snapshot, survives meeting delete
  quote_speaker text,
  quote_line integer,
  completion_kind text check (completion_kind in ('manual', 'merge')),
  completion_evidence text,                              -- required note for manual
  completed_at timestamptz,
  completed_by text,                                     -- null when completed by merge
  embedding vector(768),                                 -- title, for the duplicate check
  version integer not null default 1,                    -- optimistic concurrency (ifVersion)
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, number),
  check ((status = 'completed') = (completion_kind is not null)),
  check (completion_kind is distinct from 'manual' or completion_evidence is not null)
);
create index if not exists tasks_board on tasks (project_id, status, position);
create index if not exists tasks_assignee on tasks (assignee_id) where assignee_id is not null;
alter table action_items drop constraint if exists action_items_duplicate_of_task_fk;
alter table action_items add constraint action_items_duplicate_of_task_fk
  foreign key (duplicate_of_task_id) references tasks(id) on delete set null;
alter table action_items drop constraint if exists action_items_merged_into_task_fk;
alter table action_items add constraint action_items_merged_into_task_fk
  foreign key (merged_into_task_id) references tasks(id) on delete set null;

create table if not exists task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade not null,
  project_id uuid references projects(id) on delete cascade not null,
  actor_id text,                                          -- null = GitHub or system
  kind text not null check (kind in ('created', 'edited', 'status_changed', 'assigned',
    'unassigned', 'completed_manual', 'completed_by_merge', 'reopened_by_revert',
    'pr_linked', 'pr_state_changed', 'proposal_merged')),
  from_value text,
  to_value text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists task_events_task on task_events (task_id, created_at);

-- Key counter with a row lock, so two creators never get the same number.
create or replace function create_project_task(
  p_project uuid, p_title text, p_description text, p_assignee text, p_due date,
  p_source_action_item uuid, p_source_meeting uuid, p_quote text, p_quote_speaker text,
  p_quote_line integer, p_embedding vector(768), p_actor text
) returns tasks language plpgsql as $$
declare n integer; t tasks;
begin
  update projects set next_task_number = next_task_number + 1, updated_at = now()
    where id = p_project returning next_task_number - 1 into n;
  if n is null then raise exception 'project_not_found'; end if;
  insert into tasks (project_id, number, title, description, assignee_id, due_date,
    source_action_item_id, source_meeting_id, quote, quote_speaker, quote_line, embedding, created_by,
    position)
  values (p_project, n, p_title, p_description, p_assignee, p_due, p_source_action_item,
    p_source_meeting, p_quote, p_quote_speaker, p_quote_line, p_embedding, p_actor,
    coalesce((select max(position) from tasks where project_id = p_project and status = 'todo'), 0) + 1)
  returning * into t;
  insert into task_events (task_id, project_id, actor_id, kind, to_value)
    values (t.id, p_project, p_actor, 'created', t.status);
  return t;
end $$;

create or replace function match_project_tasks(p_project uuid, p_embedding vector(768), p_threshold real)
returns table (id uuid, number integer, title text, similarity real) language sql stable as $$
  select t.id, t.number, t.title, (1 - (t.embedding <=> p_embedding))::real
  from tasks t
  where t.project_id = p_project and t.status <> 'completed' and t.embedding is not null
    and 1 - (t.embedding <=> p_embedding) >= p_threshold
  order by t.embedding <=> p_embedding limit 3;
$$;

-- Offboarding: removal and unassignment in one step.
create or replace function remove_project_member(p_project uuid, p_user text, p_actor text,
  p_actor_role text)
returns void language plpgsql as $$
begin
  -- An Admin removes only Developers and Viewers (or leaves); the role is checked here,
  -- in the same statement, so a role change cannot race the removal.
  update project_members set removed_at = now(), removed_by = p_actor
    where project_id = p_project and user_id = p_user and removed_at is null and role <> 'owner'
      and (p_actor = p_user or p_actor_role = 'owner' or role in ('developer', 'viewer'));
  if not found then raise exception 'not_removable'; end if;
  insert into task_events (task_id, project_id, actor_id, kind, from_value)
    select id, project_id, p_actor, 'unassigned', p_user from tasks
    where project_id = p_project and assignee_id = p_user and status <> 'completed';
  update tasks set assignee_id = null, updated_at = now()
    where project_id = p_project and assignee_id = p_user and status <> 'completed';
  insert into audit_log (project_id, actor_id, action, target_type, target_id)
    values (p_project, p_actor, case when p_actor = p_user then 'member.left' else 'member.removed' end, 'member', p_user);
end $$;

-- ===== W5. GitHub =====
create table if not exists github_installations (
  installation_id bigint primary key,
  account_login text not null,
  account_type text not null,               -- 'User' | 'Organization'
  installed_by text not null,               -- Clerk user id, proven at setup; a second claim never overwrites it
  suspended_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

-- Who proved access to an installation with their own GitHub token. Stores no GitHub
-- identity; a claim older than 30 days no longer lets you link repos.
create table if not exists github_installation_claims (
  installation_id bigint references github_installations(installation_id) on delete cascade not null,
  user_id text not null,                    -- Clerk user id
  claimed_at timestamptz not null default now(),
  primary key (installation_id, user_id)
);

create table if not exists github_repos (
  repo_id bigint primary key,               -- one project per repo
  installation_id bigint references github_installations(installation_id) on delete cascade not null,
  project_id uuid references projects(id) on delete cascade not null,
  full_name text not null,
  default_branch text not null,             -- refreshed from every webhook payload
  private boolean not null,
  linked_by text not null,
  linked_at timestamptz not null default now()
);
create index if not exists github_repos_project on github_repos (project_id);

create table if not exists github_deliveries (
  delivery_id text primary key,             -- X-GitHub-Delivery
  event text not null,
  action text,
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists task_links (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade not null,
  repo_id bigint not null,                  -- no FK, history survives an unlink
  repo_full_name text not null,             -- snapshot
  pr_number integer not null,
  pr_title text not null,
  pr_url text not null,
  state text not null check (state in ('draft', 'open', 'closed', 'merged')),
  closes boolean not null default false,    -- a closing word names this key right now
  from_fork boolean not null default false, -- moves nothing, blocks nothing, completes only once merged
  base_ref text not null,
  merge_sha text,
  merged_at timestamptz,
  reverted_at timestamptz,
  reverted_by_pr integer,
  pr_updated_at timestamptz not null,       -- pull_request.updated_at; older events are ignored
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (task_id, repo_id, pr_number)
);
create index if not exists task_links_pr on task_links (repo_id, pr_number);

-- Code evidence on the Promise Ledger. Ships here because W5 writes the first code
-- link, and it must come before the functions below that use these columns.
alter table ledger_links alter column evidence_meeting_id drop not null;
alter table ledger_links alter column line_number drop not null;
alter table ledger_links
  add column if not exists evidence_kind text not null default 'meeting'
    check (evidence_kind in ('meeting', 'code')),
  add column if not exists evidence_task_link_id uuid references task_links(id) on delete cascade;
alter table ledger_links drop constraint if exists ledger_links_evidence_shape;
alter table ledger_links add constraint ledger_links_evidence_shape check (
  (evidence_kind = 'meeting' and evidence_meeting_id is not null and line_number is not null
     and evidence_task_link_id is null)
  or (evidence_kind = 'code' and evidence_task_link_id is not null and evidence_meeting_id is null
     and relation = 'kept'));
create unique index if not exists ledger_links_code_unique
  on ledger_links (item_id, evidence_task_link_id) where evidence_task_link_id is not null;

-- A "kept" suggestion for each promise behind this task, including proposals merged into it.
create or replace function add_code_ledger_links(p_task uuid, p_link uuid)
returns void language sql set search_path = public as $$
  insert into ledger_links (item_id, evidence_kind, evidence_task_link_id, relation, quote,
                            confidence, state)
  select li.id, 'code', l.id, 'kept', l.pr_title, 1, 'suggested'
  from task_links l
  join tasks t on t.id = l.task_id
  join ledger_items li on li.action_item_id = t.source_action_item_id
    or li.action_item_id in (select ai.id from action_items ai where ai.merged_into_task_id = t.id)
  where l.id = p_link and l.task_id = p_task
  on conflict (item_id, evidence_task_link_id) where evidence_task_link_id is not null do nothing;
$$;

-- Merge completion under a row lock, so two closing PRs processed at once never
-- leave the task open, and a later "closed" event can complete it. Only links in a
-- repo linked now under a live installation can block, or the task would wait forever
-- on a PR Sync can no longer read. Fork PRs never block. A merge older than the latest
-- reopen is spent, so a person's reopen sticks.
create or replace function apply_merge_completion(p_task uuid)
returns text language plpgsql set search_path = public as $$
declare t tasks; done task_links; v_reopened timestamptz;
begin
  select * into t from tasks where id = p_task for update;
  if not found then return 'not_found'; end if;
  if t.completion_kind = 'merge' then return 'already_completed'; end if;
  if t.status <> 'completed' and exists (
    select 1 from task_links l
    join github_repos r on r.repo_id = l.repo_id
    join github_installations i on i.installation_id = r.installation_id
    where l.task_id = p_task and l.closes and not l.from_fork and l.state in ('open', 'draft')
      and i.suspended_at is null and i.deleted_at is null
  ) then return 'waiting'; end if;
  select max(created_at) into v_reopened from task_events
    where task_id = p_task and from_value = 'completed'
      and kind in ('status_changed', 'reopened_by_revert');
  select l.* into done from task_links l
    join github_repos r on r.repo_id = l.repo_id and r.default_branch = l.base_ref
    where l.task_id = p_task and l.closes and l.state = 'merged' and l.reverted_at is null
      and (v_reopened is null or l.merged_at > v_reopened)
    order by l.merged_at desc limit 1;
  if done.id is null then return 'no_qualifying_merge'; end if;
  -- Completed by hand before the merge: the task stays manual, the promise still gets evidence.
  if t.status = 'completed' then
    perform add_code_ledger_links(p_task, done.id);
    return 'already_completed';
  end if;
  update tasks set status = 'completed', completion_kind = 'merge',
    completion_evidence = done.pr_url, completed_at = now(), completed_by = null,
    version = version + 1, updated_at = now() where id = p_task;
  insert into task_events (task_id, project_id, actor_id, kind, from_value, to_value, detail)
    values (p_task, t.project_id, null, 'completed_by_merge', t.status, 'completed',
            jsonb_build_object('source', 'github', 'taskLinkId', done.id));
  perform add_code_ledger_links(p_task, done.id);
  return 'completed';
end $$;

-- A board move from GitHub. update_task needs an actor and ifVersion; this needs neither,
-- but bumps version so an open board gets the normal 409.
create or replace function apply_github_move(p_task uuid, p_from text[], p_to text, p_link uuid)
returns text language plpgsql set search_path = public as $$
declare t tasks;
begin
  select * into t from tasks where id = p_task for update;
  if not found or not (t.status = any(p_from)) then return 'skipped'; end if;
  update tasks set status = p_to, version = version + 1, updated_at = now() where id = p_task;
  insert into task_events (task_id, project_id, actor_id, kind, from_value, to_value, detail)
    values (p_task, t.project_id, null, 'status_changed', t.status, p_to,
            jsonb_build_object('source', 'github', 'taskLinkId', p_link));
  return 'moved';
end $$;

-- A merged revert. Reopens only when this link is the merge that completed the task.
create or replace function apply_merge_revert(p_link uuid, p_by_pr integer)
returns text language plpgsql set search_path = public as $$
declare l task_links; t tasks; r record;
begin
  select * into l from task_links where id = p_link;
  if not found then return 'not_found'; end if;
  select * into t from tasks where id = l.task_id for update;
  select * into l from task_links where id = p_link;     -- read again under the lock
  if l.state <> 'merged' or l.reverted_at is not null then return 'skipped'; end if;
  update task_links set reverted_at = now(), reverted_by_pr = p_by_pr where id = p_link;
  delete from ledger_links where evidence_task_link_id = p_link and state = 'suggested';
  for r in update ledger_links set state = 'rejected', decided_at = now()
           where evidence_task_link_id = p_link and state = 'confirmed' returning item_id loop
    perform ledger_recompute_item_status(r.item_id);
  end loop;
  if t.completion_kind is distinct from 'merge' or t.completion_evidence is distinct from l.pr_url then
    return 'reverted';
  end if;
  update tasks set status = 'in_progress', completion_kind = null, completion_evidence = null,
    completed_at = null, completed_by = null, version = version + 1, updated_at = now()
    where id = t.id;
  insert into task_events (task_id, project_id, actor_id, kind, from_value, to_value, detail)
    values (t.id, t.project_id, null, 'reopened_by_revert', 'completed', 'in_progress',
            jsonb_build_object('source', 'github', 'taskLinkId', p_link));
  return 'reopened';
end $$;

-- ===== W6. Activity =====
alter table ledger_links add column if not exists decided_by text;   -- null on old rows and live mark confirms
create index if not exists task_events_project on task_events (project_id, created_at desc);
create index if not exists ledger_links_confirmed on ledger_links (decided_at desc) where state = 'confirmed';

-- row_id breaks ties for the cursor. Keys that hold a quote, evidence, title, or invite ref
-- are dropped here, and the route allowlists again per kind.
create or replace view project_activity with (security_invoker = true) as
  select 'te:' || te.id::text as row_id, te.project_id, te.created_at as occurred_at, te.actor_id,
         'task.' || te.kind as kind, 'task' as subject_type, te.task_id::text as subject_id,
         jsonb_build_object('from', te.from_value, 'to', te.to_value)
           || (te.detail - 'quote' - 'evidence' - 'title' - 'actionItemId') as detail
    from task_events te
  union all
  select 'mt:' || m.id::text, m.project_id, m.created_at, m.user_id, 'meeting.created', 'meeting', m.id::text,
         jsonb_build_object('title', m.title)
    from meetings m where m.project_id is not null
  union all
  select 'll:' || ll.id::text, m.project_id, ll.decided_at, ll.decided_by,
         'ledger.' || ll.relation || '_confirmed', 'ledger_item',
         ll.item_id::text, jsonb_build_object('evidence', ll.evidence_kind)
    from ledger_links ll join ledger_items li on li.id = ll.item_id
    join meetings m on m.id = li.meeting_id
    where m.project_id is not null and ll.state = 'confirmed' and ll.decided_at is not null
  union all
  select 'au:' || a.id::text, a.project_id, a.created_at, a.actor_id, a.action, a.target_type, a.target_id,
         a.detail - 'ref'
    from audit_log a where a.project_id is not null
      and a.action in ('project.created', 'project.ownership_transferred', 'member.joined',
        'member.removed', 'member.left', 'member.restored', 'member.role_changed', 'repo.linked',
        'repo.unlinked', 'meeting.moved');   -- allowlist: invite and join request rows (emails) never show
grant select on project_activity to service_role;

-- ===== W7. Project assistant retrieval (filter by project inside SQL) =====
create or replace function match_project_chunks(
  p_project uuid, query_embedding vector(768), match_count integer, min_similarity real
) returns table (chunk_id uuid, meeting_id uuid, meeting_title text, started_at timestamptz,
                 content text, similarity real)
language sql stable as $$
  select c.id, m.id, m.title, m.started_at, c.content, (1 - (c.embedding <=> query_embedding))::real
  from meeting_chunks c join meetings m on m.id = c.meeting_id
  where m.project_id = p_project
    and 1 - (c.embedding <=> query_embedding) >= min_similarity
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- ===== W8. Notifications and the server copy of the email toggle =====
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  project_id uuid references projects(id) on delete cascade,
  kind text not null check (kind in ('task_assigned', 'proposals_ready', 'join_request',
    'join_approved', 'task_completed_by_merge', 'task_reopened_by_revert', 'kept_suggestion')),
  title text not null,
  body text not null,
  link text not null,                    -- app path only, never an outside URL
  dedupe_key text not null unique,       -- e.g. 'task_assigned:<taskId>:<userId>:<eventId>'
  read_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user on notifications (user_id, created_at desc);

create table if not exists user_settings (
  user_id text primary key,
  email_notifications boolean not null default true,  -- missing row = true, same as DEFAULT_PREFS
  digest_sent_on date,                                 -- PKT day of the last digest (budget and once a day)
  updated_at timestamptz not null default now()
);

alter table projects enable row level security;
alter table project_members enable row level security;
alter table audit_log enable row level security;
alter table project_invitations enable row level security;
alter table project_join_requests enable row level security;
alter table meeting_participants enable row level security;
alter table tasks enable row level security;
alter table task_events enable row level security;
alter table github_installations enable row level security;
alter table github_installation_claims enable row level security;
alter table github_repos enable row level security;
alter table github_deliveries enable row level security;
alter table task_links enable row level security;
alter table notifications enable row level security;
alter table user_settings enable row level security;
-- No policies: every read and write goes through the service role on the server,
-- same as every existing table. Grant to service_role per slice, as 0002 and 0003 do.
-- Views and functions are not covered by RLS, so each slice also revokes the defaults:
revoke all on project_activity from anon, authenticated;
-- and for every new function: revoke execute on function <name>(<args>) from public, anon, authenticated;
-- then grant execute to service_role.
```

Each slice adds only its own block (the headings above). The ledger_links change ships with W5, because W5 writes the first code link. RLS and grants ship with each table.

### State transitions

**Task status** (`tasks.status`):

```
todo ⇄ in_progress ⇄ in_review → completed
any open status ⇄ blocked (by hand only)
completed → in_progress   (revert, or Owner/Admin reopens by hand)
```

GitHub moves (rules in [0004-github.md](0004-github.md)): a linked draft PR moves `todo → in_progress`; a linked ready PR moves `todo | in_progress → in_review`; a closed unmerged PR moves `in_review → in_progress` when no other open linked PR remains; a qualifying merge moves any open status to `completed` with `completion_kind = 'merge'`. GitHub never moves a `blocked` task except to complete it.

**Proposal** (`action_items.review_state` on project meetings): `proposed → confirmed` (a task is created) · `proposed → rejected` · `proposed → rejected` with `proposal_merged` (its quote is added to an existing task). Personal meetings stay `auto` and keep follow ups.

**Join request**: `pending → approved | denied`. **Invitation**: active → used (email) · revoked · expired (read time check, `now() > expires_at`).

**Code ledger link**: `suggested → confirmed | rejected` by Owner or Admin through the existing review route. A revert deletes a `suggested` code link and moves a `confirmed` one to `rejected`, and `ledger_recompute_item_status` runs as today.

### API contracts (add to AGENTS.md before coding, see the exact lines below)

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| /api/projects | POST | name, taskPrefix | project | signed in | 422 bad prefix |
| /api/projects | GET | | your projects + role | signed in | |
| /api/projects/[id] | GET | | project, your role, counts | member | 404 |
| /api/projects/[id] | PATCH | name | project | owner | 403, 404 |
| /api/projects/[id] | DELETE | confirmName | ok | owner | 409 sealed minutes, 422 name mismatch |
| /api/projects/[id]/members | GET | | members with role, name, email | member | 404 |
| /api/projects/[id]/members/[userId] | PATCH | role | member | owner, admin (limits in matrix) | 403, 409 own role |
| /api/projects/[id]/members/[userId] | DELETE | | ok | owner, admin, or self (leave) | 409 owner must transfer |
| /api/projects/[id]/transfer | POST | userId | ok | owner | 409 not an admin |
| /api/projects/[id]/invitations | POST | kind, email?, role | invitation, link (once) | owner, admin | 403 admin role by non owner, 422 |
| /api/projects/[id]/invitations | GET | | active invitations (no token) | owner, admin | |
| /api/projects/[id]/invitations/[invitationId] | DELETE | | ok | owner, admin | 404 |
| /api/invitations/preview | GET | token | projectName, role, kind, status | signed in | 410 gone, 429 |
| /api/invitations/accept | POST | token | status joined or pending, projectId | signed in | 410 used or expired, 403 email mismatch, 429 |
| /api/projects/[id]/join-requests | GET | | pending requests | owner, admin | |
| /api/projects/[id]/join-requests/[requestId] | POST | decision | request | owner, admin | 409 decided |
| /api/meetings/[id]/project | POST | projectId | meeting | meeting creator, developer+ in target | 409 already in a project, 409 minutes review |
| /api/meetings/[id]/consent | POST | noticeVersion | consentedAt | member | 404 |
| /api/projects/[id]/proposals | GET | meetingId? | proposals | owner, admin, developer (read only) | 403 viewer |
| /api/proposals/[id]/review | POST | decision, edits, mergeIntoTaskId?, confirmWithoutQuote? | task or proposal | owner, admin | 409 decided, 422 no quote |
| /api/projects/[id]/tasks | GET | status?, assigneeId?, q?, cursor | tasks | member | |
| /api/projects/[id]/tasks | POST | title, description?, assigneeId?, dueDate? | task | developer+ | 422 assignee not a member |
| /api/tasks/[id] | GET | | task, events, links, chain | member | 404 |
| /api/tasks/[id] | PATCH | changes, ifVersion | task | developer+ (own or unassigned), owner/admin any | 409 stale, 403 |
| /api/github/callback | GET | installation_id, setup_action, code, state | redirect | owner (from signed state) | 403 installation not yours, 400 bad state |
| /api/github/webhook | POST | raw body, signature, delivery id | 202 | HMAC | 401 bad signature, 413 over 1 MB |
| /api/projects/[id]/github/repos | GET | | repos with link state, installUrl (signed state) | owner | |
| /api/projects/[id]/github/repos | POST | repoId | repo | owner | 409 linked to another project, 422 not in your installation |
| /api/projects/[id]/github/repos/[repoId] | DELETE | | ok | owner | 404 |
| /api/projects/[id]/github/sync | POST | | counts | owner, admin | 429 within 60 s |
| /api/projects/[id]/ledger | GET | kind?, status?, cursor | ledger items with links and task keys | member (redacted for viewer) | 404 |
| /api/projects/[id]/activity | GET | before? | events | member | |
| /api/projects/search | GET | q | projects, tasks, meetings (5 each) | signed in, active projects only | |
| /api/notifications | GET | cursor | items, unreadCount | signed in | |
| /api/notifications/read | POST | ids or all | ok | signed in | |
| /api/settings/notifications | POST | emailNotifications | ok | signed in | |
| /api/cron/daily | GET | | counts | Vercel cron (`CRON_SECRET`) | 401 |
| /api/ai/chat (extended) | POST | projectId, messages | stream + citations | developer+ | 403 viewer |
| /api/search (extended) | POST | query, projectId? | results | developer+ for projectId | 403 |
| /api/ai/process (extended) | POST | meetingId | proposals instead of follow ups on project meetings | owner, admin | 409 minutes review, 409 proposals already reviewed |
| /api/meetings (extended) | GET | projectId? | personal + project meetings, projectId, role | signed in | 404 not a member |
| /api/meetings/[id] (extended) | GET | | adds projectId, role, canManage; Viewer gets no transcript fields and only confirmed action items | read | |

**Pagination**: every list returns at most 50 rows and a `nextCursor` (`created_at` plus `id`), board columns at most 200 tasks each.

### Exact lines for AGENTS.md (apply only with your OK, `/sync` normally owns AGENTS.md)

API Contracts, append:

```
POST /api/projects                 → create a project { name, taskPrefix (2 to 5 capital letters) }, caller becomes Owner
GET  /api/projects                 → projects you are an active member of, with your role
GET  /api/projects/[id]            → member: project, your role, counts
PATCH /api/projects/[id]           → owner only: { name }
DELETE /api/projects/[id]          → owner only: { confirmName }, deletes the project and its meetings; 409 while any meeting has sealed minutes
GET  /api/projects/[id]/members    → member: active members with role
PATCH /api/projects/[id]/members/[userId]  → owner or admin: { role }; only the owner grants or removes admin; never your own role
DELETE /api/projects/[id]/members/[userId] → owner or admin removes, or you leave; open tasks go Unassigned; the owner must transfer first
POST /api/projects/[id]/transfer   → owner only: { userId } of an active admin
POST /api/projects/[id]/invitations        → owner or admin: { kind: "email" | "link", email?, role }, returns the link once
GET  /api/projects/[id]/invitations        → owner or admin: active invitations, never the token
DELETE /api/projects/[id]/invitations/[invitationId] → owner or admin: revoke
GET  /api/invitations/preview      → signed in: ?token=, project name, role, kind, status for the invite page; consumes nothing
POST /api/invitations/accept       → signed in: { token }; email kind joins, link kind creates a pending join request
GET  /api/projects/[id]/join-requests      → owner or admin: pending join requests
POST /api/projects/[id]/join-requests/[requestId] → owner or admin: { decision: "approve" | "deny" }
POST /api/meetings/[id]/project    → meeting creator with developer or higher in the target: { projectId }, moves a personal meeting in; 409 under a minutes review
POST /api/meetings/[id]/consent    → member: { noticeVersion }, stores the consent tick before joining a project call
GET  /api/meetings/by-call/[callId] → (extended) adds callType ("default" | "project")
POST /api/guest/request-join       → (extended) on a project meeting requires { consented: true }; response adds callType
GET  /api/projects/[id]/proposals  → owner, admin, developer (read only): AI task proposals with quotes
POST /api/proposals/[id]/review    → owner or admin: { decision: "confirm" | "reject" | "merge", title?, assigneeId?, dueDate?, mergeIntoTaskId?, confirmWithoutQuote? }
GET  /api/projects/[id]/tasks      → member: board tasks (?status=&assigneeId=&q=&cursor=)
POST /api/projects/[id]/tasks      → developer or higher: { title, description?, assigneeId?, dueDate? }
GET  /api/tasks/[id]               → member: task, events, PR links, Proof Chain
PATCH /api/tasks/[id]              → developer (own or unassigned) or owner/admin: { status?, position?, assigneeId?, title?, description?, dueDate?, completionEvidence?, ifVersion }, 409 when stale
GET  /api/github/callback          → owner (signed state): GitHub App install callback, installation checked against your own GitHub installations; the user token is discarded
POST /api/github/webhook           → public, HMAC SHA-256 over the raw body, dedupe on X-GitHub-Delivery, 202 then after()
GET  /api/projects/[id]/github/repos       → owner only: repos your installations can see, with link state, and the install URL
POST /api/projects/[id]/github/repos       → owner only: { repoId } from your installation's repo list, 409 when linked to another project
DELETE /api/projects/[id]/github/repos/[repoId] → owner only: unlink
POST /api/projects/[id]/github/sync        → owner or admin: read PR state again for open links and apply the same rules
GET  /api/projects/[id]/ledger     → member: Decisions and Promises across the project's meetings (?kind=&status=&cursor=), redacted for viewers
POST /api/ledger/links/[id]/review → (extended) accepts code links; on a project meeting owner or admin
GET  /api/projects/[id]/activity   → member: Activity timeline (?before=)
GET  /api/projects/search          → signed in: Ctrl K palette (?q=), title and key match across your active projects only
GET  /api/notifications            → signed in: your notifications (?cursor=), unread count
POST /api/notifications/read       → signed in: { ids } or { all: true }
POST /api/settings/notifications   → signed in: { emailNotifications }, the server copy of the email toggle
GET  /api/cron/daily               → Vercel cron only (Bearer CRON_SECRET): digest, delivery purge, GitHub sync
POST /api/ai/chat                  → (extended) { projectId } project assistant, developer or higher, project filtered in SQL, citations built in code
POST /api/search                   → (extended) { query, projectId? } scopes to one project where you are developer or higher (the route is POST in code; the older GET line in this list is wrong)
POST /api/ai/process               → (extended) on a project meeting writes proposals, never follow ups; 409 once any proposal was reviewed
GET  /api/meetings                 → (extended) adds project meetings from your active projects, with projectId and role (?projectId= for one project)
GET  /api/meetings/[id]            → (extended) adds projectId, role, canManage; Viewers get no transcript fields and only confirmed action items
(all owner only meeting routes)    → (extended) on a project meeting the project Owner or Admin passes; meeting delete stays Owner only
```

Security, append to the "Never expose to the browser" list: `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_APP_CLIENT_SECRET`, `CRON_SECRET`.

### Value sourcing (shared values, each child adds its own)

| Action | Value produced or displayed | Source |
|---|---|---|
| Any project route | caller id | Clerk `auth().userId`, never the body |
| Any project route | caller role | `project_members.role` where `removed_at is null`, read on every request |
| Any meeting route | personal or project | `meetings.project_id` |
| Task key | `NM-42` | `projects.task_prefix` + `-` + `tasks.number` (from `create_project_task`) |
| Member display name and email | name, email | Clerk `users.getUser(userId)` on the server, batched per page; never stored except the join request snapshot |
| Invite email binding | the email to compare | Clerk user's primary email, only when its verification status is `verified` |
| "Today" for overdue and the digest | a date | Asia/Karachi calendar day (the digest is 08:00 PKT); the ledger's existing `today` param stays for meeting pages |
| Links in emails | absolute URL | `NEXT_PUBLIC_APP_URL` + an app path, same as `src/lib/email.ts` |
| Workspace emails sender | from address | `RESEND_WORKSPACE_FROM`; when unset, no workspace email is sent (copy link and in app only) |
| Host controls in the call | `canManage` | `GET /api/meetings/[id]` from `requireMeetingAccess(..., "manage")`; replaces `call.state.createdBy` in `MeetingRoom.tsx` |
| Stream call role | role | `/api/meetings/[id]/members`: `admin` for project Owner and Admin, `call_member` for Developer and Viewer (verify with `stream-react` before W1 ships it) |
| GitHub install `state` | signed value | HMAC SHA-256 with a key derived by `crypto.hkdfSync` from `GITHUB_APP_CLIENT_SECRET` (info `install-state`), never the webhook secret |

### Key invariants

1. Every project has exactly one active Owner (partial unique index plus `transfer_project_ownership`; the Owner cannot be removed or leave).
2. Nobody changes their own role; only the Owner grants or removes Admin.
3. A removed member fails every project check on the next request, and none of their unfinished tasks stays assigned to them.
4. A project meeting never creates follow ups; a task exists only after an Owner or Admin confirms a proposal or a member creates it by hand.
5. A task key is unique per project and never reused (`next_task_number` only grows).
6. A repo belongs to at most one project (`github_repos.repo_id` primary key).
7. A merge completes a task only when every rule in [0004-github.md](0004-github.md) holds; a merge never confirms a promise, it only suggests.
8. Every webhook delivery is processed at most once (`github_deliveries.delivery_id` primary key).
9. The project assistant never reads a row outside the asked project (the filter is inside the SQL function, not in code after retrieval).
10. Retrieved meeting text is data, never instructions, and the assistant has no tools that write.
11. Secrets and GitHub tokens are never stored in the database and never reach the browser.
12. Every access control change (role, removal, transfer, invite, join decision, repo link, meeting move, project delete) writes one `audit_log` row.

### Security model

- **Who reads and writes**: the matrix above, enforced only on the server by `requireProjectRole` and `requireMeetingAccess`. The browser never talks to Supabase with the service key.
- **Pages**: `src/middleware.ts` protects an explicit list, so `/invite(.*)`, `/projects(.*)`, and `/my-tasks(.*)` are added to `isProtectedRoute` (sign in returns to the same page). Webhook and cron routes stay outside it and check their own secret.
- **Viewer redaction**: one shared select per table (`src/lib/project-select.ts`) leaves out quote, transcript line, PR title, repo name, PR URL, and `completion_evidence` for a Viewer, so no route has to remember to strip them; the W9 matrix asserts no such key in any Viewer GET.
- **Not leaking existence**: a non member gets 404 for any project, task, proposal, or project meeting route, the same body as "not found".
- **Invites**: 32 random bytes as base64url; only the SHA-256 hex is stored; the raw token shows once. Email invites are single use and bound to a verified primary email. Link invites never grant Admin and always need approval.
- **GitHub**: the webhook is verified with HMAC SHA-256 over the raw body with `timingSafeEqual` before any parse. The install callback proves the installation belongs to the caller by listing the caller's own installations with a user token; that token and the user identity token are discarded after use.
- **Assistant**: project filter inside SQL, retrieved text wrapped as untrusted data, citations built in code, read only (OWASP LLM01 prompt injection guidance).
- **Audit**: access control changes write `audit_log` (invariant 12). This is a student project with no regulated data in scope, but meeting recordings are personal data, so the consent notice and the "kept until deleted" statement are required (W3).

### Free tier budget

| Service | Free limit (as used here) | This feature's use | Guard |
|---|---|---|---|
| Supabase | 500 MB database | tasks and events are small rows; one 768 float embedding (about 3 KB) per task and proposal | deliveries older than 30 days purged daily |
| Vercel Hobby | cron once a day, function time limit | one daily cron, webhook work in `after()` | Sync capped at 100 PR reads per run |
| GitHub App | free, 5,000 API requests per hour per installation | PR reads only in Sync and setup | 60 second Sync cooldown per project |
| Resend | 3,000 emails a month, 100 a day | invites, event emails, one digest per user per day; existing summary and Tasdeeq emails share the same limit | workspace budget per UTC day: 60 for invites and event emails (count of `notifications.emailed_at` plus `audit_log` `invite.emailed`), 20 for digests (count of `user_settings.digest_sent_on`); the rest stays free for the existing emails; in app always continues |
| Gemini | free tier rate limits | one batch embedding call per processed meeting, one per manual task, assistant same as chat today | Groq fallback for generation as today |
| Stream, Clerk | free tiers | no new Stream feature, no Clerk Organizations or paid roles | |

### Configuration required

- `GITHUB_APP_ID`: the GitHub App's numeric id, to sign the App JWT.
- `GITHUB_APP_PRIVATE_KEY`: the App's PEM private key, server only, for installation tokens.
- `GITHUB_WEBHOOK_SECRET`: the shared secret for `X-Hub-Signature-256`.
- `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`: user authorization for the install proof; the secret is server only and also derives the `state` signing key.
- `NEXT_PUBLIC_GITHUB_APP_SLUG`: the App's public slug, to build the install link.
- `RESEND_WORKSPACE_FROM` (optional): a sender on your verified domain; unset means no workspace email.
- `CRON_SECRET`: Vercel sends it as a Bearer token to `/api/cron/daily`.
- `vercel.json`: one cron, `{ "path": "/api/cron/daily", "schedule": "0 3 * * *" }` (03:00 UTC is 08:00 PKT; Hobby may run it any time within that hour).

Prerequisite before W5: you create a dev GitHub App (Metadata read, Pull requests read; events `pull_request`, `installation`, `installation_repositories`; "Request user authorization (OAuth) during installation" on, which makes GitHub skip the Setup URL; Callback URL `http://localhost:3000/api/github/callback`; Webhook URL a free smee.io channel forwarded to `/api/github/webhook`, or a free tunnel if smee's forwarding upsets the signature check). At Deploy you create a second App with the production URLs, because an App has one webhook URL. "Redirect on update" is not needed, since the `authorizeUrl` button proves an existing installation.

### Critical test scenarios

Each child lists its own. The cross cutting ones:

- Happy path: create project, invite, approve, hold a bilingual meeting, confirm a proposal into `NM-1`, merge a PR that says "Closes NM-1", the task completes, the Owner confirms the kept suggestion, the chain shows on the meeting and the ledger, verifies **AC-83**.
- Failure case: the same webhook delivered twice changes state once, verifies **AC-45**.
- Auth: a non member gets 404 and a Viewer gets 403 on every content and manage route, verifies **AC-6**, **AC-80**.

## Build plan

Each W step is one shippable end to end slice: its migration block, its routes, its UI, and its tests ship together, then `/check verify`. Order follows the dependency chain.

1. **W1, Projects and roles** ([0004-projects-roles.md](0004-projects-roles.md)): W1 SQL block, `project-auth.ts`, project and member routes, the route migration onto `requireMeetingAccess`, offboarding, a minimal Projects page and Members tab, satisfies **AC-1** to **AC-12**.
2. **W2, Invitations** ([0004-invitations.md](0004-invitations.md)): W2 SQL block, invite and join request routes, `/invite/[token]` page, copy link UI, optional Resend email, satisfies **AC-13** to **AC-22** (plus AC-13a and AC-21a, added at the W2 `/architect`).
3. **W3, Project meetings and consent** ([0004-project-meetings.md](0004-project-meetings.md)): W3 SQL block, project picker on New and Schedule Meeting, members only `project` call type, consent notice before join, guest consent, offboarding removal from live calls (move route ships with W4), satisfies **AC-23** to **AC-29**, **AC-30a**, **AC-30b**.
4. **W4, Review gate and tasks** ([0004-review-gate-tasks.md](0004-review-gate-tasks.md)): W4 SQL block, proposals from `/api/ai/process`, review route, task routes, Kanban with `@hello-pangea/dnd`, satisfies **AC-30** to **AC-42**.
5. **W5, GitHub** ([0004-github.md](0004-github.md)): W5 SQL block including the `ledger_links` change, App JWT and installation tokens with Node `crypto` (no Octokit), install callback and claims, webhook, linking rules, revert, Sync, task drawer, code links on the Ledger tab, satisfies **AC-43** to **AC-56** (plus AC-43a, AC-48a to AC-48d, AC-52a, and AC-55a, added at the W5 `/architect`).
6. **W6, Proof Chain surfaces** ([0004-proof-chain.md](0004-proof-chain.md)): `project_activity` view, Decisions and Promises tab, Outcome card, Activity tab, satisfies **AC-57** to **AC-62**.
7. **W7, Project assistant** ([0004-project-assistant.md](0004-project-assistant.md)): `match_project_chunks`, chat and search extensions, citations, untrusted data wrapping, satisfies **AC-63** to **AC-69**.
8. **W8, Workspace shell and notifications** ([0004-workspace-shell.md](0004-workspace-shell.md)): W8 SQL block, shell and personal views, notifications, digest cron, Ctrl K with `cmdk`, success and warning tokens, satisfies **AC-70** to **AC-79**.
9. **W9, Security suite and end to end** ([0004-security-e2e.md](0004-security-e2e.md)): route matrix tests, webhook and invite attack tests, injection tests, the bilingual run, satisfies **AC-80** to **AC-84**.

## Consequences

**Positive**:
- The Proof Chain becomes real and checkable: quote, task, merged code, kept promise.
- One role check replaces about 30 scattered `meetings.user_id` checks, so new routes get access control right by default.
- Personal meetings keep working unchanged.

**Negative / tradeoffs**:
- Nine steps of work, the largest phase so far; W1 touches almost every API route, so its test burden is high.
- No realtime board: two people moving cards see each other's change only on refetch (focus or 30 seconds), and a stale move gets a 409.
- GitHub does not redeliver failed webhooks; until someone presses Sync or the daily cron runs, a missed merge stays missed.
- Revert detection only understands GitHub's own "Reverts owner/repo#N" format.
- Consent is enforced in our join flow, but a user with a valid Stream token could still reach the call outside our UI (see [0004-project-meetings.md](0004-project-meetings.md)).
- Workspace email needs a verified domain; on the free Resend test sender, invites work by copy link only.

**Neutral**:
- Two new client libraries: `@hello-pangea/dnd` (W4) and `cmdk` (W8).
- Two new tokens (success, warning) in `context/ui-tokens.md` at W8.
- One Vercel cron.

## Follow-up

- [ ] W-pre is not done: commit the Live Ledger and Tasdeeq work, then run LL5 and the Tasdeeq live run before W1.
- [ ] Apply the AGENTS.md API Contracts and Security lines above before W1 (your OK, or `/sync`).
- [ ] Agent skills and MCP discovery was deferred: check for skills covering `@hello-pangea/dnd` and `cmdk` before W4 and W8. Checked for W5 on 2026-11-05: no GitHub Apps skill is installed (`clerk-webhooks` covers Clerk only), and the spec uses plain `fetch` and Node `crypto`, so none is needed.
- [x] Before W3, verify with the `stream-react` skill whether call level permissions can make the consent gate server enforced on the free tier. Settled 2026-11-03: yes, a custom `project` call type without `join-call` for `user` and `guest` (see [0004-project-meetings.md](0004-project-meetings.md)); W3 build step 1 confirms Stream accepts it on this plan.
- [ ] Turn Clerk email verification back on at Deploy; until then the email invite binding trusts an unverified address in dev (see [0004-invitations.md](0004-invitations.md)).
- [ ] Fix the existing AGENTS.md line `GET  /api/search`: the route in `src/app/api/search/route.ts` is `POST` with `{ query }`; W7 extends that POST.
- [x] Before W3, the same `stream-react` check decides whether offboarding can revoke Stream call access. Settled 2026-11-03: removal takes the user off the call members of open `project` calls and kicks them (AC-30b). Their Stream token stays valid but no longer opens any project call.
- [ ] Clerk `user.deleted` is not handled: a deleted Owner leaves a project with no reachable Owner. Decide a recovery path before Deploy.
- [ ] Project pages use the PKT day for overdue while the meeting Ledger tab uses the browser's `today`; near midnight they can differ. Align them in a later polish step.
- [ ] Post W9 stretch: create GitHub issues from tasks (cut from the core, needs Issues write).
- [ ] Post W9 optional: Web Speech live captions experiment (out of the core).

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
