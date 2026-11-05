-- NeuraMeet Database Schema
-- Run this in the Supabase SQL Editor after creating your project.
-- Requires pgvector extension for RAG embeddings.
--
-- NOTE ON ROW LEVEL SECURITY (RLS):
-- Auth is handled by Clerk, NOT Supabase auth, so Supabase never sees the
-- authenticated user. We therefore do NOT add auth.uid()-based RLS policies
-- (they would silently break every query). Instead, every read/write is scoped
-- by user_id in application code and executed through the service-role client
-- (which bypasses RLS) from server-only API routes / Server Actions. Keep it
-- that way — never add Supabase-auth RLS here.

-- 1. Enable pgvector extension
create extension if not exists vector;

-- 2. Tables

-- meetings: one row per Stream call
create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  stream_call_id text unique not null,
  user_id text not null,
  title text not null default '',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled', 'active', 'ended')),
  created_at timestamptz not null default now()
);

-- transcripts: raw transcript text linked to a meeting
-- processing_state tracks the async lifecycle of a recording-derived transcript:
--   not_started: row not yet created from a recording
--   pending: generation (STT + merge) is in flight (row exists, raw_text may be '')
--   ready: raw_text + (for owner) insights are available
--   no_recording: Stream has no finalized individual recordings yet (retryable)
--   too_short: recording too short to transcribe
--   failed: a hard error occurred (retryable from the client)
create table if not exists transcripts (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid unique references meetings(id) on delete cascade not null,
  source text not null default 'upload' check (source in ('upload', 'recording')),
  raw_text text not null default '',
  language text,
  processing_state text not null default 'not_started'
    check (processing_state in ('not_started','pending','ready','failed','no_recording','too_short')),
  created_at timestamptz not null default now()
);

-- meeting_insights: AI-generated summary, category, key points, decisions
create table if not exists meeting_insights (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid unique references meetings(id) on delete cascade not null,
  summary text not null,
  key_points text[] not null default '{}',
  decisions text[] not null default '{}',
  category text not null,
  detected_topics text[] not null default '{}',
  processed_at timestamptz not null default now()
);

-- action_items: extracted per meeting, feeds follow_ups
create table if not exists action_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references meetings(id) on delete cascade not null,
  title text not null,
  assignee text,
  due_date date,
  created_at timestamptz not null default now()
);

-- follow_ups: user-editable status/notes, references action_items and meetings
create table if not exists follow_ups (
  id uuid primary key default gen_random_uuid(),
  action_item_id uuid references action_items(id) on delete cascade not null,
  meeting_id uuid references meetings(id) on delete cascade not null,
  status text not null default 'pending' check (status in ('pending', 'needs_attention', 'completed')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  notes text,
  updated_at timestamptz not null default now()
);

-- meeting_chunks: chunked + embedded transcript content for RAG
create table if not exists meeting_chunks (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references meetings(id) on delete cascade not null,
  chunk_text text not null,
  embedding vector(768),
  chunk_index integer not null
);

-- 3. Indexes

create index if not exists idx_meetings_user_id on meetings(user_id);
create index if not exists idx_meetings_stream_call_id on meetings(stream_call_id);
create index if not exists idx_action_items_meeting_id on action_items(meeting_id);
create index if not exists idx_follow_ups_meeting_id on follow_ups(meeting_id);
create index if not exists idx_follow_ups_action_item_id on follow_ups(action_item_id);
create index if not exists idx_meeting_chunks_meeting_id on meeting_chunks(meeting_id);
create index if not exists idx_meeting_chunks_embedding on meeting_chunks using ivfflat (embedding vector_cosine_ops);

-- 4. RPC function for similarity search (RAG retrieval)

create or replace function match_meeting_chunks(
  query_embedding vector(768),
  match_meeting_id uuid,
  match_count int default 5
)
returns table (
  id uuid,
  meeting_id uuid,
  chunk_text text,
  chunk_index integer,
  similarity float
)
language sql
stable
as $$
  select
    mc.id,
    mc.meeting_id,
    mc.chunk_text,
    mc.chunk_index,
    1 - (mc.embedding <=> query_embedding) as similarity
  from meeting_chunks mc
  where mc.meeting_id = match_meeting_id
  order by mc.embedding <=> query_embedding
  limit match_count;
$$;

-- Cross-meeting similarity search (C1): join meeting_chunks to meetings and
-- scope by the owning user_id so a user never sees another user's chunks.
create or replace function match_meeting_chunks_user(
  query_embedding vector(768),
  p_user_id text,
  match_count int default 20,
  similarity_threshold float default 0.0
)
returns table (
  id uuid,
  meeting_id uuid,
  meeting_title text,
  chunk_text text,
  chunk_index integer,
  similarity float
)
language sql
stable
as $$
  select
    mc.id,
    mc.meeting_id,
    m.title as meeting_title,
    mc.chunk_text,
    mc.chunk_index,
    1 - (mc.embedding <=> query_embedding) as similarity
  from meeting_chunks mc
  join meetings m on m.id = mc.meeting_id
  where m.user_id = p_user_id
    and 1 - (mc.embedding <=> query_embedding) >= similarity_threshold
  order by mc.embedding <=> query_embedding
  limit match_count;
$$;

-- attendance_events: one row per join session per participant (Auto Attendance, Steps B1/B2)
-- Join opens a row; leave closes it (reconnect closes + reopens a row). Talk time is the
-- cumulative mic-enabled (unmuted) duration, accumulated server-side from mic toggle events.
create table if not exists attendance_events (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references meetings(id) on delete cascade not null,
  user_id text not null,
  stream_user_id text,
  participant_email text,
  participant_name text,
  session_started_at timestamptz not null default now(),
  session_ended_at timestamptz,
  mic_toggles integer not null default 0,
  camera_toggles integer not null default 0,
  talk_time_seconds integer not null default 0,
  mic_enabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_attendance_events_meeting_id on attendance_events(meeting_id);

-- Enforce exactly one OPEN session row per (meeting, user). The app-level
-- idempotency check (findOpenRow before insert) is not race-safe: concurrent
-- join events from the subscription + seed effect (and from both clients in a
-- call) can both pass the check and both insert, producing duplicate rows
-- (e.g. 4 rows for 2 participants). This partial index closes that race.
-- Reconnects legitimately open a new row because the prior one is closed
-- (session_ended_at set), so it falls outside this index.
create unique index if not exists idx_attendance_open_session_uniq
  on attendance_events (meeting_id, user_id)
  where session_ended_at is null;

-- 5. Privileges
-- The app's server-side client uses the service_role key, which maps to the
-- Postgres `service_role` role. That role is NOT auto-granted privileges on
-- tables created via the SQL Editor in some projects, so inserts/selects fail
-- with "42501 permission denied" until granted explicitly. RLS stays disabled
-- (see header note) — service_role bypasses RLS regardless of these grants.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;

-- Migration: add processing_state to existing transcripts tables (idempotent).
-- Run against the live DB if the table already exists without the column.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'transcripts' and column_name = 'processing_state'
  ) then
    alter table transcripts
      add column processing_state text not null default 'not_started'
      check (processing_state in ('not_started','pending','ready','failed','no_recording','too_short'));
  end if;
  -- raw_text was previously NOT NULL with no default; relax to allow an empty
  -- sentinel for pending/failed rows while keeping the constraint.
  if exists (
    select 1 from information_schema.columns
    where table_name = 'transcripts' and column_name = 'raw_text'
      and column_default is null
  ) then
    alter table transcripts alter column raw_text set default '';
  end if;
end $$;

-- Migration: add language to existing transcripts tables (idempotent).
-- Carries the Whisper language hint actually used for a generated transcript so
-- the cache can be keyed by language (a different selected language must
-- re-transcribe instead of returning a stale cached text). Run against the live
-- DB if the table already exists without the column.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'transcripts' and column_name = 'language'
  ) then
    alter table transcripts add column language text;
  end if;
end $$;

-- Migration: add stream_user_id to attendance_events (idempotent). It carries the
-- participant's connected Stream user id (the id Stream embeds in the individual
-- recording filename), which lets transcript generation map a recording to the
-- real participant name even when that id differs from the Clerk user_id.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'attendance_events' and column_name = 'stream_user_id'
  ) then
    alter table attendance_events add column stream_user_id text;
  end if;
end $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Migration: add guest_admission_mode to meetings (G3). Zero-cost column on the
-- existing meetings table. Stores the per meeting admission mode for guests:
-- 'approval' (default — guests wait for owner Accept/Deny via the G2 flow) or
-- 'open' (guests join immediately, no owner approval). Column level DEFAULT means
-- even meetings created lazily (at first attendance event or transcript upload
-- per the B2 debug fix) get a safe closed default. No new DB table, no new provider.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'meetings' and column_name = 'guest_admission_mode'
  ) then
    alter table meetings
      add column guest_admission_mode text NOT NULL DEFAULT 'approval'
      check (guest_admission_mode in ('approval', 'open'));
  end if;
end $$;

-- Migration: make attendance_events.user_id nullable (G3, bundled per G0 §4.5.3).
-- Signed in writers always supply non-null user_id; guest writers (G4) will omit it.
-- Additive migration — signed in writers never hit the null path.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'attendance_events' and column_name = 'user_id'
      and is_nullable = 'NO'
  ) then
    alter table attendance_events alter column user_id drop not null;
  end if;
end $$;

-- Migration: guest_requests table (supersedes G0 §4.4.2/§4.4.5 in-memory store).
-- Root cause of the 403 in production: Vercel serverless functions do NOT share
-- module-level Map state across instances — a guest created on instance A was
-- invisible to the admit route on instance B. This table is the durable backing.
-- TTL (10 min) -> expires_at column. Dedup nonce -> unique index. Mint promise
-- race -> INSERT ... ON CONFLICT ... DO NOTHING (atomic single source of truth).
create table if not exists guest_requests (
  guest_token    text primary key,            -- server-issued uuid, prefixed gt_
  meeting_id     text not null,               -- Stream call id (same as meetings.stream_call_id)
  request_nonce  text not null,               -- client-generated uuid for dedup
  name           text not null,               -- display name for owner toast + attendance
  email          text,                        -- optional contact for owner
  status         text not null default 'pending'
    check (status in ('pending', 'minting', 'admitted', 'denied', 'expired')),
  stream_user_id text,                        -- Stream guest user id (set after createGuestUser)
  access_token   text,                        -- Stream guest access token (set after createGuestUser)
  created_at     timestamptz not null default now(),
  minted_at      timestamptz,                 -- when createGuestUser resolved
  expires_at     timestamptz not null         -- 10-min TTL from creation
);

-- Dedup: exactly one pending/minting row per (meeting_id, request_nonce).
-- The partial index covers only pending/minting so a re-INSERT after the row
-- expired or was admitted/denied does NOT conflict — it creates fresh.
create unique index if not exists idx_guest_requests_nonce_uniq
  on guest_requests (meeting_id, request_nonce)
  where status in ('pending', 'minting');

-- Promise Ledger (spec 0001, slice 1): decisions and promises extracted per
-- meeting, plus links that later meetings suggest as evidence (kept/reversed).
-- Ownership always comes from meetings.user_id. RLS is enabled with NO policies
-- so only the service_role client (which bypasses RLS) can touch these rows;
-- no Supabase auth policies are added (see header note).
create table if not exists ledger_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references meetings(id) on delete cascade not null,
  action_item_id uuid references action_items(id) on delete set null,
  kind text not null check (kind in ('decision', 'promise')),
  statement text not null,
  quote text not null,
  quote_language text not null check (quote_language in ('en', 'ur', 'mixed')),
  speaker text,
  assignee text,
  due_date date,
  line_number integer not null,
  status text not null default 'open' check (status in ('open', 'kept', 'reversed')),
  embedding vector(768),
  created_at timestamptz not null default now()
);

create table if not exists ledger_links (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references ledger_items(id) on delete cascade not null,
  evidence_meeting_id uuid references meetings(id) on delete cascade not null,
  relation text not null check (relation in ('kept', 'reversed')),
  quote text not null,
  speaker text,
  line_number integer not null,
  confidence real not null,
  state text not null default 'suggested' check (state in ('suggested', 'confirmed', 'rejected')),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (item_id, evidence_meeting_id)
);

create index if not exists idx_ledger_items_meeting_id on ledger_items(meeting_id);
create index if not exists idx_ledger_links_evidence_meeting_id on ledger_links(evidence_meeting_id);

alter table ledger_items enable row level security;
alter table ledger_links enable row level security;

GRANT SELECT, INSERT, UPDATE, DELETE ON ledger_items, ledger_links TO service_role;

-- Item status = relation of the confirmed link with the latest decided_at,
-- else 'open'. The single SQL home of this rule; the review route keeps the
-- app side copy in one helper.
create or replace function ledger_recompute_item_status(p_item_id uuid)
returns void
language sql
set search_path = public
as $$
  update ledger_items li
  set status = coalesce(
    (
      select ll.relation
      from ledger_links ll
      where ll.item_id = p_item_id and ll.state = 'confirmed'
      order by ll.decided_at desc nulls last
      limit 1
    ),
    'open'
  )
  where li.id = p_item_id;
$$;

-- When a confirmed link disappears (e.g. its evidence meeting was deleted and
-- the link cascaded away), recompute the item's status from what remains. If
-- the item itself is being cascaded, the update simply matches no row.
create or replace function ledger_links_after_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.state = 'confirmed' then
    perform ledger_recompute_item_status(old.item_id);
  end if;
  return old;
end;
$$;

create or replace trigger trg_ledger_links_after_delete
  after delete on ledger_links
  for each row execute function ledger_links_after_delete();

GRANT EXECUTE ON FUNCTION ledger_recompute_item_status(uuid) TO service_role;

-- Promise Ledger slice 2: the owner's open items from EARLIER meetings, ranked
-- by their best cosine similarity to any chunk of this meeting. Only items with
-- an embedding qualify; the judge decides which candidates really match.
create or replace function match_ledger_candidates(
  p_meeting_id uuid,
  p_user_id text,
  match_count int default 15
)
returns table (
  id uuid,
  meeting_id uuid,
  kind text,
  statement text,
  quote text,
  assignee text,
  due_date date,
  similarity float
)
language sql
stable
set search_path = public
as $$
  select
    li.id,
    li.meeting_id,
    li.kind,
    li.statement,
    li.quote,
    li.assignee,
    li.due_date,
    best.similarity
  from ledger_items li
  join meetings m on m.id = li.meeting_id
  cross join lateral (
    select max(1 - (mc.embedding <=> li.embedding)) as similarity
    from meeting_chunks mc
    where mc.meeting_id = p_meeting_id
  ) best
  where m.user_id = p_user_id
    and li.status = 'open'
    and li.embedding is not null
    and li.meeting_id <> p_meeting_id
    and m.started_at < (select started_at from meetings where id = p_meeting_id)
    and best.similarity is not null
  order by best.similarity desc
  limit match_count;
$$;

GRANT EXECUTE ON FUNCTION match_ledger_candidates(uuid, text, int) TO service_role;

-- Promise Ledger slice 4 (prep hook, AC-15): the owner's open items ranked by
-- cosine similarity to the prep title plus notes embedding. Overdue is derived
-- in code; it is a subset of open.
create or replace function match_ledger_prep_items(
  query_embedding vector(768),
  p_user_id text,
  match_count int default 5
)
returns table (
  id uuid,
  meeting_id uuid,
  meeting_title text,
  meeting_started_at timestamptz,
  kind text,
  statement text,
  quote text,
  assignee text,
  due_date date,
  similarity float
)
language sql
stable
set search_path = public
as $$
  select
    li.id,
    li.meeting_id,
    m.title,
    m.started_at,
    li.kind,
    li.statement,
    li.quote,
    li.assignee,
    li.due_date,
    1 - (li.embedding <=> query_embedding) as similarity
  from ledger_items li
  join meetings m on m.id = li.meeting_id
  where m.user_id = p_user_id
    and li.status = 'open'
    and li.embedding is not null
  order by li.embedding <=> query_embedding
  limit match_count;
$$;

GRANT EXECUTE ON FUNCTION match_ledger_prep_items(vector, text, int) TO service_role;

-- ---------------------------------------------------------------------------
-- Live Ledger (spec docs/specs/0002-live-ledger): live marks raised during a
-- call, Agreement Checks, and their votes. Same posture as the ledger tables:
-- RLS on with no policies, so only the service_role client can touch rows.
-- ---------------------------------------------------------------------------
create table if not exists ledger_live_marks (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references meetings(id) on delete cascade not null, -- the live meeting
  item_id uuid references ledger_items(id) on delete cascade not null, -- an item from an earlier meeting
  mark text check (mark in ('kept', 'open', 'reversed')),             -- null while raised, not marked
  raised_at timestamptz not null default now(),
  marked_at timestamptz,
  closed_at timestamptz,
  unique (meeting_id, item_id)
);
create index if not exists ledger_live_marks_meeting_idx
  on ledger_live_marks (meeting_id, raised_at desc);

create table if not exists ledger_agreements (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references meetings(id) on delete cascade not null,
  statement text not null check (char_length(statement) between 1 and 280),
  status text not null default 'open' check (status in ('open', 'closed')),
  agreed_count integer,
  total_count integer,
  ledger_item_id uuid references ledger_items(id) on delete set null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);
create unique index if not exists ledger_agreements_one_open
  on ledger_agreements (meeting_id) where status = 'open';

create table if not exists ledger_agreement_votes (
  agreement_id uuid references ledger_agreements(id) on delete cascade not null,
  voter_id text not null, -- Clerk id or verified Stream guest id
  vote text not null check (vote in ('agree', 'not_yet')),
  voted_at timestamptz not null default now(),
  primary key (agreement_id, voter_id)
);

alter table ledger_items
  add column if not exists source text not null default 'transcript'
    check (source in ('transcript', 'live_agreement')),
  add column if not exists agreed_count integer,
  add column if not exists total_count integer;

alter table ledger_live_marks enable row level security;
alter table ledger_agreements enable row level security;
alter table ledger_agreement_votes enable row level security;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON ledger_live_marks, ledger_agreements, ledger_agreement_votes TO service_role;

-- Tasdeeq, Verified Minutes (spec docs/specs/0003-tasdeeq-verified-minutes):
-- attendees confirm, correct, or record a view on the AI minutes, then the
-- owner seals them with a signed, chained SHA-256 fingerprint.
alter table meeting_insights
  add column if not exists minutes_draft jsonb; -- null for meetings processed before Tasdeeq

create table if not exists minutes_reviews (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid unique references meetings(id) on delete cascade not null,
  status text not null default 'open' check (status in ('open', 'sealing', 'sealed')), -- cancel deletes the row
  deadline_days integer not null check (deadline_days in (3, 7)),
  deadline_at timestamptz not null,
  opened_at timestamptz not null default now(),
  coverage jsonb not null,                -- { lastLine, totalLines, text }
  transcript_source text not null check (transcript_source in ('upload', 'recording')),
  transcript_sha256 text not null
);

create table if not exists minutes_lines (
  id uuid primary key default gen_random_uuid(),
  review_id uuid references minutes_reviews(id) on delete cascade not null,
  position integer not null,
  section text not null check (section in ('summary', 'key_point', 'decision', 'action_item')),
  text text not null,
  evidence jsonb not null default '[]',   -- [{ quote, lineNumber, speaker }], at most 2
  supported boolean not null,
  speaker_labels text[] not null default '{}',
  action_item_id uuid references action_items(id) on delete set null,
  assignee text,
  unique (review_id, position)
);

create table if not exists minutes_attesters (
  review_id uuid references minutes_reviews(id) on delete cascade not null,
  user_id text not null,                  -- Clerk id
  display_name text not null,
  email text,
  is_owner boolean not null default false,
  done_at timestamptz,
  primary key (review_id, user_id)
);

create table if not exists minutes_speaker_claims (
  review_id uuid references minutes_reviews(id) on delete cascade not null,
  speaker_label text not null,           -- the label key (lowercase, trimmed, spaces collapsed)
  display_label text not null,           -- first seen spelling
  user_id text not null,
  claimed_by text not null check (claimed_by in ('self', 'owner')),
  claimed_at timestamptz not null default now(),
  primary key (review_id, speaker_label),
  foreign key (review_id, user_id) references minutes_attesters(review_id, user_id) on delete cascade
);

create table if not exists minutes_attestations (
  line_id uuid references minutes_lines(id) on delete cascade not null,
  user_id text not null,
  action text not null check (action in ('confirm', 'correct', 'view')),
  note text check (note is null or char_length(note) between 1 and 500),
  late boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (line_id, user_id),
  check (action = 'confirm' or note is not null)
);

create table if not exists minutes_dissent_suggestions (
  id uuid primary key default gen_random_uuid(),
  review_id uuid references minutes_reviews(id) on delete cascade not null,
  speaker_label text not null,
  topic text not null,
  position text not null,
  quote text not null,
  line_number integer not null,
  related_line_id uuid references minutes_lines(id) on delete set null,
  status text not null default 'suggested' check (status in ('suggested', 'adopted', 'dismissed'))
);

create table if not exists minutes_seals (
  id uuid primary key default gen_random_uuid(),
  review_id uuid unique references minutes_reviews(id) on delete restrict not null,
  meeting_id uuid references meetings(id) on delete restrict not null,
  owner_id text not null,
  content_sha256 text not null,
  prev_seal_sha256 text,
  signature text not null,                -- base64 Ed25519
  key_id text not null,
  bundle jsonb not null,
  status_text text not null,
  sealed_at timestamptz not null default now()
);
create index if not exists minutes_seals_owner_idx on minutes_seals (owner_id, sealed_at desc);

alter table minutes_reviews enable row level security;
alter table minutes_lines enable row level security;
alter table minutes_attesters enable row level security;
alter table minutes_speaker_claims enable row level security;
alter table minutes_attestations enable row level security;
alter table minutes_dissent_suggestions enable row level security;
alter table minutes_seals enable row level security;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON minutes_reviews, minutes_lines, minutes_attesters, minutes_speaker_claims,
     minutes_attestations, minutes_dissent_suggestions, minutes_seals TO service_role;

-- ===== W1. Projects and members (spec 0004) =====
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
returns projects language plpgsql set search_path = public as $$
declare p projects;
begin
  insert into projects (name, task_prefix, created_by) values (p_name, p_prefix, p_user) returning * into p;
  insert into project_members (project_id, user_id, role, added_by) values (p.id, p_user, 'owner', p_user);
  insert into audit_log (project_id, actor_id, action, target_type, target_id)
    values (p.id, p_user, 'project.created', 'project', p.id::text);
  return p;
end $$;

create or replace function transfer_project_ownership(p_project uuid, p_from text, p_to text)
returns void language plpgsql set search_path = public as $$
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

-- W1 body: tasks do not exist yet. The W4 block below replaces this with the full body that also
-- unassigns the member's unfinished tasks (see the umbrella spec).
create or replace function remove_project_member(p_project uuid, p_user text, p_actor text,
  p_actor_role text)
returns void language plpgsql set search_path = public as $$
begin
  -- An Admin removes only Developers and Viewers (or leaves); the role is checked here,
  -- in the same statement, so a role change cannot race the removal.
  update project_members set removed_at = now(), removed_by = p_actor
    where project_id = p_project and user_id = p_user and removed_at is null and role <> 'owner'
      and (p_actor = p_user or p_actor_role = 'owner' or role in ('developer', 'viewer'));
  if not found then raise exception 'not_removable'; end if;
  insert into audit_log (project_id, actor_id, action, target_type, target_id)
    values (p_project, p_actor, case when p_actor = p_user then 'member.left' else 'member.removed' end, 'member', p_user);
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

alter table projects enable row level security;
alter table project_members enable row level security;
alter table audit_log enable row level security;

GRANT SELECT, INSERT, UPDATE, DELETE ON projects, project_members, audit_log TO service_role;

revoke execute on function create_project(text, text, text) from public, anon, authenticated;
revoke execute on function transfer_project_ownership(uuid, text, text) from public, anon, authenticated;
revoke execute on function remove_project_member(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function match_ledger_candidates(uuid, text, int) from public, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_project(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION transfer_project_ownership(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION remove_project_member(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION match_ledger_candidates(uuid, text, int) TO service_role;

-- ===== W2. Invitations (spec 0004, child 0004-invitations) =====
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

-- Joins or restores a member; never changes an active member's role.
-- Returns 'joined', 'restored', or 'member' (already active).
create or replace function upsert_project_member(p_project uuid, p_user text, p_role text,
  p_added_by text, p_via text, p_ref uuid)
returns text language plpgsql set search_path = public as $$
declare existing project_members; was_member boolean;
begin
  select * into existing from project_members
    where project_id = p_project and user_id = p_user for update;
  was_member := found;
  if was_member and existing.removed_at is null then return 'member'; end if;
  if was_member then
    update project_members set role = p_role, removed_at = null, removed_by = null,
      added_by = p_added_by, joined_at = now()
      where project_id = p_project and user_id = p_user;
  else
    insert into project_members (project_id, user_id, role, added_by)
      values (p_project, p_user, p_role, p_added_by)
      on conflict (project_id, user_id) do nothing;
    if not found then return 'member'; end if;   -- a parallel join won the race
  end if;
  insert into audit_log (project_id, actor_id, action, target_type, target_id, detail)
    values (p_project, p_user, case when was_member then 'member.restored' else 'member.joined' end,
      'member', p_user, jsonb_build_object('role', p_role, 'via', p_via, 'ref', p_ref));
  return case when was_member then 'restored' else 'joined' end;
end $$;

-- AC-13, AC-13a: one per project lock, re-invite revokes the live email invite,
-- then the active cap, then the insert. The token is never passed in, only its hash.
create or replace function create_project_invitation(p_project uuid, p_kind text, p_email text,
  p_role text, p_token_hash text, p_created_by text, p_expires_at timestamptz, p_max_active int)
returns project_invitations language plpgsql set search_path = public as $$
declare inv project_invitations; replaced uuid; active int;
begin
  perform pg_advisory_xact_lock(hashtext('invite:' || p_project::text));
  if p_kind = 'email' then
    update project_invitations set revoked_at = now()
      where project_id = p_project and kind = 'email' and email = p_email
        and revoked_at is null and used_at is null
      returning id into replaced;
  end if;
  select count(*) into active from project_invitations
    where project_id = p_project and revoked_at is null and used_at is null and expires_at > now();
  if active >= p_max_active then raise exception 'cap_reached'; end if;
  insert into project_invitations (project_id, kind, email, role, token_hash, created_by, expires_at)
    values (p_project, p_kind, p_email, p_role, p_token_hash, p_created_by, p_expires_at)
    returning * into inv;
  if replaced is not null then
    insert into audit_log (project_id, actor_id, action, target_type, target_id, detail)
      values (p_project, p_created_by, 'invite.revoked', 'invitation', replaced::text,
        jsonb_build_object('replacedBy', inv.id));
  end if;
  insert into audit_log (project_id, actor_id, action, target_type, target_id, detail)
    values (p_project, p_created_by, 'invite.created', 'invitation', inv.id::text,
      jsonb_build_object('kind', p_kind, 'role', p_role));
  return inv;
end $$;

-- AC-17, AC-20: single use, only one of two racing accepts gets the row.
create or replace function accept_email_invitation(p_invitation uuid, p_user text)
returns text language plpgsql set search_path = public as $$
declare inv project_invitations;
begin
  update project_invitations set used_at = now(), used_by = p_user
    where id = p_invitation and kind = 'email' and used_at is null and revoked_at is null
      and expires_at > now()
    returning * into inv;
  if not found then raise exception 'gone'; end if;
  return upsert_project_member(inv.project_id, p_user, inv.role, inv.created_by,
    'email_invite', inv.id);
end $$;

-- AC-18: one pending request per user per project. The invite row is locked so a
-- revoke cannot slip in between the check and the insert (AC-21 invariant).
create or replace function request_project_join(p_invitation uuid, p_user text, p_name text,
  p_email text)
returns project_join_requests language plpgsql set search_path = public as $$
declare inv project_invitations; req project_join_requests;
begin
  select * into inv from project_invitations where id = p_invitation and kind = 'link' for update;
  if not found or inv.revoked_at is not null or inv.expires_at <= now() then
    raise exception 'gone';
  end if;
  insert into project_join_requests (project_id, invitation_id, user_id, display_name, email, role)
    values (inv.project_id, inv.id, p_user, p_name, p_email, inv.role)
    on conflict (project_id, user_id) where status = 'pending' do nothing
    returning * into req;
  if found then
    insert into audit_log (project_id, actor_id, action, target_type, target_id, detail)
      values (inv.project_id, p_user, 'join_request.created', 'join_request', req.id::text,
        jsonb_build_object('invitationId', inv.id, 'role', inv.role));
    return req;
  end if;
  select * into req from project_join_requests
    where project_id = inv.project_id and user_id = p_user and status = 'pending';
  return req;
end $$;

-- AC-21a: revoke is idempotent; a link revoke denies its pending requests.
create or replace function revoke_project_invitation(p_invitation uuid, p_project uuid, p_actor text)
returns void language plpgsql set search_path = public as $$
declare inv project_invitations; denied record;
begin
  select * into inv from project_invitations
    where id = p_invitation and project_id = p_project for update;
  if not found then raise exception 'not_found'; end if;
  if inv.revoked_at is not null then return; end if;
  update project_invitations set revoked_at = now() where id = p_invitation;
  insert into audit_log (project_id, actor_id, action, target_type, target_id, detail)
    values (p_project, p_actor, 'invite.revoked', 'invitation', p_invitation::text,
      jsonb_build_object('kind', inv.kind));
  for denied in
    update project_join_requests set status = 'denied', decided_by = p_actor, decided_at = now()
      where invitation_id = p_invitation and status = 'pending'
      returning id
  loop
    insert into audit_log (project_id, actor_id, action, target_type, target_id, detail)
      values (p_project, p_actor, 'join_request.denied', 'join_request', denied.id::text,
        jsonb_build_object('reason', 'invite_revoked'));
  end loop;
end $$;

-- AC-21: decide once; approve joins or restores with the request's role.
create or replace function decide_join_request(p_request uuid, p_project uuid, p_actor text,
  p_decision text)
returns project_join_requests language plpgsql set search_path = public as $$
declare req project_join_requests;
begin
  select * into req from project_join_requests
    where id = p_request and project_id = p_project for update;
  if not found then raise exception 'not_found'; end if;
  if req.status <> 'pending' then raise exception 'already_decided'; end if;
  update project_join_requests
    set status = case when p_decision = 'approve' then 'approved' else 'denied' end,
        decided_by = p_actor, decided_at = now()
    where id = p_request returning * into req;
  insert into audit_log (project_id, actor_id, action, target_type, target_id, detail)
    values (p_project, p_actor, 'join_request.' || req.status, 'join_request', req.id::text,
      jsonb_build_object('role', req.role));
  if p_decision = 'approve' then
    perform upsert_project_member(p_project, req.user_id, req.role, p_actor,
      'join_request', req.id);
  end if;
  return req;
end $$;

alter table project_invitations enable row level security;
alter table project_join_requests enable row level security;

GRANT SELECT, INSERT, UPDATE, DELETE ON project_invitations, project_join_requests TO service_role;

revoke execute on function upsert_project_member(uuid, text, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function create_project_invitation(uuid, text, text, text, text, text, timestamptz, int) from public, anon, authenticated;
revoke execute on function accept_email_invitation(uuid, text) from public, anon, authenticated;
revoke execute on function request_project_join(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function revoke_project_invitation(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function decide_join_request(uuid, uuid, text, text) from public, anon, authenticated;
GRANT EXECUTE ON FUNCTION upsert_project_member(uuid, text, text, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION create_project_invitation(uuid, text, text, text, text, text, timestamptz, int) TO service_role;
GRANT EXECUTE ON FUNCTION accept_email_invitation(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION request_project_join(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION revoke_project_invitation(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION decide_join_request(uuid, uuid, text, text) TO service_role;

-- ===== W3. Project meetings and consent (spec 0004, child 0004-project-meetings) =====
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

alter table meeting_participants enable row level security;

GRANT SELECT, INSERT, UPDATE, DELETE ON meeting_participants TO service_role;

-- ===== W4. Proposals, tasks, board (spec 0004, child 0004-review-gate-tasks) =====
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
create index if not exists action_items_review on action_items (meeting_id, review_state);
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
) returns tasks language plpgsql set search_path = public as $$
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
returns table (id uuid, number integer, title text, similarity real)
language sql stable set search_path = public as $$
  select t.id, t.number, t.title, (1 - (t.embedding <=> p_embedding))::real
  from tasks t
  where t.project_id = p_project and t.status <> 'completed' and t.embedding is not null
    and 1 - (t.embedding <=> p_embedding) >= p_threshold
  order by t.embedding <=> p_embedding limit 3;
$$;

-- Offboarding: removal and unassignment in one step (replaces the W1 body).
create or replace function remove_project_member(p_project uuid, p_user text, p_actor text,
  p_actor_role text)
returns void language plpgsql set search_path = public as $$
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

-- Reprocess a project meeting: refuse once anything was reviewed, otherwise swap
-- the unreviewed rows for the new proposals. The meeting row lock makes a confirm
-- that lands during the AI call win (AC-34). 'auto' rows on a project meeting are
-- from before W4 and go too, with their follow ups.
create or replace function replace_meeting_proposals(p_meeting uuid, p_items jsonb, p_actor text)
returns setof uuid language plpgsql set search_path = public as $$
begin
  perform 1 from meetings where id = p_meeting for update;
  if not found then raise exception 'meeting_not_found'; end if;
  if exists (
    select 1 from action_items ai
    where ai.meeting_id = p_meeting
      and (ai.review_state in ('confirmed', 'rejected')
           or exists (select 1 from tasks t where t.source_action_item_id = ai.id))
  ) then
    raise exception 'proposals_reviewed';
  end if;
  delete from action_items where meeting_id = p_meeting and review_state in ('proposed', 'auto');
  insert into action_items (id, meeting_id, title, assignee, due_date, review_state, quote,
    quote_speaker, quote_line, quote_verified, proposed_assignee_id, duplicate_of_task_id,
    duplicate_score, embedding)
  select x.id, p_meeting, x.title, x.assignee, x.due_date, 'proposed', x.quote,
    x.quote_speaker, x.quote_line, coalesce(x.quote_verified, false), x.proposed_assignee_id,
    x.duplicate_of_task_id, x.duplicate_score, x.embedding::vector(768)
  from jsonb_to_recordset(p_items) as x(id uuid, title text, assignee text, due_date date,
    quote text, quote_speaker text, quote_line integer, quote_verified boolean,
    proposed_assignee_id text, duplicate_of_task_id uuid, duplicate_score real, embedding text);
  return query
    select (e.value->>'id')::uuid from jsonb_array_elements(p_items) with ordinality as e(value, n)
    order by e.n;
end $$;

-- Every proposal decision. The meeting lock plus the review_state guard mean a
-- double click or two reviewers never make two tasks (AC-35, AC-36).
create or replace function review_proposal(p_item uuid, p_decision text, p_title text,
  p_assignee text, p_assignee_given boolean, p_due date, p_merge_task uuid,
  p_embedding vector(768), p_actor text, p_confirm_without_quote boolean)
returns jsonb language plpgsql set search_path = public as $$
declare ai action_items; v_meeting uuid; v_project uuid; v_assignee text; v_title text;
  t tasks; target tasks;
begin
  select meeting_id into v_meeting from action_items where id = p_item;
  if v_meeting is null then raise exception 'not_found'; end if;
  select project_id into v_project from meetings where id = v_meeting for update;
  if v_project is null then raise exception 'not_found'; end if;
  select * into ai from action_items where id = p_item;
  if ai.review_state <> 'proposed' then raise exception 'already_decided'; end if;

  if p_decision = 'confirm' then
    if not ai.quote_verified and not coalesce(p_confirm_without_quote, false) then
      raise exception 'quote_unverified';
    end if;
    v_assignee := case when p_assignee_given then p_assignee else ai.proposed_assignee_id end;
    if v_assignee is not null and not exists (
      select 1 from project_members
      where project_id = v_project and user_id = v_assignee and removed_at is null
    ) then
      raise exception 'assignee_not_member';
    end if;
    v_title := coalesce(p_title, ai.title);
    update action_items set review_state = 'confirmed', reviewed_by = p_actor, reviewed_at = now()
      where id = p_item and review_state = 'proposed';
    if not found then raise exception 'already_decided'; end if;
    t := create_project_task(v_project, v_title, null, v_assignee, p_due, ai.id, ai.meeting_id,
      case when ai.quote_verified then ai.quote end,
      case when ai.quote_verified then ai.quote_speaker end,
      case when ai.quote_verified then ai.quote_line end,
      coalesce(p_embedding, case when v_title = ai.title then ai.embedding end), p_actor);
    return jsonb_build_object('taskId', t.id);
  elsif p_decision = 'merge' then
    select * into target from tasks where id = p_merge_task for update;
    if not found or target.project_id <> v_project or target.status = 'completed' then
      raise exception 'task_closed';
    end if;
    update action_items set review_state = 'rejected', merged_into_task_id = target.id,
      reviewed_by = p_actor, reviewed_at = now()
      where id = p_item and review_state = 'proposed';
    if not found then raise exception 'already_decided'; end if;
    insert into task_events (task_id, project_id, actor_id, kind, detail)
      values (target.id, v_project, p_actor, 'proposal_merged',
        jsonb_build_object('quote', case when ai.quote_verified then ai.quote end,
          'actionItemId', ai.id, 'title', ai.title, 'meetingId', ai.meeting_id));
    return jsonb_build_object('taskId', target.id);
  elsif p_decision = 'reject' then
    update action_items set review_state = 'rejected', reviewed_by = p_actor, reviewed_at = now()
      where id = p_item and review_state = 'proposed';
    if not found then raise exception 'already_decided'; end if;
    return jsonb_build_object('itemId', ai.id);
  end if;
  raise exception 'bad_decision';
end $$;

-- Board edits. The row lock plus the version check give ifVersion semantics;
-- the route checks the role matrix against the same version first (AC-39, AC-40).
create or replace function update_task(p_task uuid, p_actor text, p_patch jsonb,
  p_if_version integer)
returns jsonb language plpgsql set search_path = public as $$
declare o tasks; n tasks; v_status text; v_assignee text; v_completing boolean;
begin
  select * into o from tasks where id = p_task for update;
  if not found then raise exception 'not_found'; end if;
  if o.version <> p_if_version then raise exception 'stale'; end if;
  v_status := coalesce(p_patch->>'status', o.status);
  v_assignee := case when p_patch ? 'assigneeId' then p_patch->>'assigneeId' else o.assignee_id end;
  v_completing := v_status = 'completed' and o.status <> 'completed';
  if v_assignee is distinct from o.assignee_id and v_assignee is not null and not exists (
    select 1 from project_members
    where project_id = o.project_id and user_id = v_assignee and removed_at is null
  ) then
    raise exception 'assignee_not_member';
  end if;
  if v_completing and coalesce(btrim(p_patch->>'completionEvidence'), '') = '' then
    raise exception 'evidence_required';
  end if;
  update tasks set
    status = v_status,
    position = coalesce((p_patch->>'position')::double precision, o.position),
    assignee_id = v_assignee,
    title = coalesce(p_patch->>'title', o.title),
    description = case when p_patch ? 'description' then p_patch->>'description' else o.description end,
    due_date = case when p_patch ? 'dueDate' then (p_patch->>'dueDate')::date else o.due_date end,
    completion_kind = case when v_completing then 'manual'
      when v_status <> 'completed' then null else o.completion_kind end,
    completion_evidence = case when v_completing then btrim(p_patch->>'completionEvidence')
      when v_status <> 'completed' then null else o.completion_evidence end,
    completed_at = case when v_completing then now()
      when v_status <> 'completed' then null else o.completed_at end,
    completed_by = case when v_completing then p_actor
      when v_status <> 'completed' then null else o.completed_by end,
    version = o.version + 1,
    updated_at = now()
  where id = p_task returning * into n;

  if n.status <> o.status then
    insert into task_events (task_id, project_id, actor_id, kind, from_value, to_value, detail)
      values (n.id, n.project_id, p_actor,
        case when v_completing then 'completed_manual' else 'status_changed' end,
        o.status, n.status,
        case when v_completing then jsonb_build_object('evidence', n.completion_evidence)
          else '{}'::jsonb end);
  end if;
  if n.assignee_id is distinct from o.assignee_id then
    insert into task_events (task_id, project_id, actor_id, kind, from_value, to_value)
      values (n.id, n.project_id, p_actor,
        case when n.assignee_id is null then 'unassigned' else 'assigned' end,
        o.assignee_id, n.assignee_id);
  end if;
  if n.title <> o.title then
    insert into task_events (task_id, project_id, actor_id, kind, from_value, to_value, detail)
      values (n.id, n.project_id, p_actor, 'edited', o.title, n.title, '{"field":"title"}');
  end if;
  if n.description is distinct from o.description then
    insert into task_events (task_id, project_id, actor_id, kind, detail)
      values (n.id, n.project_id, p_actor, 'edited', '{"field":"description"}');
  end if;
  if n.due_date is distinct from o.due_date then
    insert into task_events (task_id, project_id, actor_id, kind, from_value, to_value, detail)
      values (n.id, n.project_id, p_actor, 'edited', o.due_date::text, n.due_date::text,
        '{"field":"dueDate"}');
  end if;
  return jsonb_build_object('taskId', n.id);
end $$;

-- Tight gaps after many drops: reset one column to 1, 2, 3. No version bump and
-- no events, so it never turns someone else's drag into a 409.
create or replace function renumber_task_column(p_project uuid, p_status text)
returns void language plpgsql set search_path = public as $$
begin
  perform 1 from tasks where project_id = p_project and status = p_status for update;
  update tasks t set position = r.rn
    from (select id, row_number() over (order by position, number) as rn
          from tasks where project_id = p_project and status = p_status) r
    where t.id = r.id;
end $$;

-- Move a personal meeting into a project (W3 AC-24, AC-25).
create or replace function move_meeting_to_project(p_meeting uuid, p_project uuid, p_actor text)
returns void language plpgsql set search_path = public as $$
declare r action_items; t tasks;
begin
  update meetings set project_id = p_project
    where id = p_meeting and project_id is null and user_id = p_actor;
  if not found then raise exception 'not_movable'; end if;
  if exists (select 1 from minutes_reviews where meeting_id = p_meeting) then
    raise exception 'minutes_review';
  end if;
  update action_items ai set review_state = 'proposed'
    from follow_ups f where f.action_item_id = ai.id and f.meeting_id = p_meeting
    and f.status <> 'completed';
  for r in select ai.* from action_items ai join follow_ups f on f.action_item_id = ai.id
           where f.meeting_id = p_meeting and f.status = 'completed' loop
    t := create_project_task(p_project, r.title, null, null, r.due_date, r.id, p_meeting,
                             null, null, null, null, p_actor);
    update tasks set status = 'completed', completion_kind = 'manual',
      completion_evidence = 'Completed as a follow up before the move',
      completed_at = now(), completed_by = p_actor where id = t.id;
    update action_items set review_state = 'confirmed', reviewed_by = p_actor, reviewed_at = now()
      where id = r.id;
  end loop;
  delete from follow_ups where meeting_id = p_meeting;
  insert into audit_log (project_id, actor_id, action, target_type, target_id)
    values (p_project, p_actor, 'meeting.moved', 'meeting', p_meeting::text);
end $$;

alter table tasks enable row level security;
alter table task_events enable row level security;

GRANT SELECT, INSERT, UPDATE, DELETE ON tasks, task_events TO service_role;

revoke execute on function create_project_task(uuid, text, text, text, date, uuid, uuid, text, text, integer, vector, text) from public, anon, authenticated;
revoke execute on function match_project_tasks(uuid, vector, real) from public, anon, authenticated;
revoke execute on function remove_project_member(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function replace_meeting_proposals(uuid, jsonb, text) from public, anon, authenticated;
revoke execute on function review_proposal(uuid, text, text, text, boolean, date, uuid, vector, text, boolean) from public, anon, authenticated;
revoke execute on function update_task(uuid, text, jsonb, integer) from public, anon, authenticated;
revoke execute on function renumber_task_column(uuid, text) from public, anon, authenticated;
revoke execute on function move_meeting_to_project(uuid, uuid, text) from public, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_project_task(uuid, text, text, text, date, uuid, uuid, text, text, integer, vector, text) TO service_role;
GRANT EXECUTE ON FUNCTION match_project_tasks(uuid, vector, real) TO service_role;
GRANT EXECUTE ON FUNCTION remove_project_member(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION replace_meeting_proposals(uuid, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION review_proposal(uuid, text, text, text, boolean, date, uuid, vector, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION update_task(uuid, text, jsonb, integer) TO service_role;
GRANT EXECUTE ON FUNCTION renumber_task_column(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION move_meeting_to_project(uuid, uuid, text) TO service_role;

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

alter table github_installations enable row level security;
alter table github_installation_claims enable row level security;
alter table github_repos enable row level security;
alter table github_deliveries enable row level security;
alter table task_links enable row level security;

GRANT SELECT, INSERT, UPDATE, DELETE ON github_installations, github_installation_claims, github_repos, github_deliveries, task_links TO service_role;

revoke execute on function add_code_ledger_links(uuid, uuid) from public, anon, authenticated;
revoke execute on function apply_merge_completion(uuid) from public, anon, authenticated;
revoke execute on function apply_github_move(uuid, text[], text, uuid) from public, anon, authenticated;
revoke execute on function apply_merge_revert(uuid, integer) from public, anon, authenticated;
GRANT EXECUTE ON FUNCTION add_code_ledger_links(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION apply_merge_completion(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION apply_github_move(uuid, text[], text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION apply_merge_revert(uuid, integer) TO service_role;
