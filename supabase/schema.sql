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
create table if not exists transcripts (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid unique references meetings(id) on delete cascade not null,
  source text not null default 'upload' check (source in ('upload', 'recording')),
  raw_text text not null,
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

-- 5. Privileges
-- The app's server-side client uses the service_role key, which maps to the
-- Postgres `service_role` role. That role is NOT auto-granted privileges on
-- tables created via the SQL Editor in some projects, so inserts/selects fail
-- with "42501 permission denied" until granted explicitly. RLS stays disabled
-- (see header note) — service_role bypasses RLS regardless of these grants.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
