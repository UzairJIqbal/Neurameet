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
