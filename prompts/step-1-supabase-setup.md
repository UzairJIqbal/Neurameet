# Step 1 — Supabase Setup

## Goal
Install Supabase packages, create client wrappers, prepare the SQL schema the user runs in the Supabase dashboard, and wire env vars. After this step, every subsequent step can import `supabaseServer()` or `supabase` and query/write data.

## Prerequisites (user does manually)
1. Create a free-tier Supabase project at https://supabase.com
2. Copy the project URL and anon key into `.env.local` (see env vars below)
3. Copy the service role key (Settings → API) into `.env.local`
4. Run the SQL from `supabase/schema.sql` in the Supabase SQL Editor

## What to build

### 1. Install packages
```bash
npm install @supabase/supabase-js @supabase/ssr
```

### 2. Create `src/lib/supabase-client.ts`
Browser-only client. Uses `createBrowserClient` from `@supabase/ssr`.
```ts
import { createBrowserClient } from "@supabase/ssr";

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
```

### 3. Create `src/lib/supabase-server.ts`
Server-only client. Uses `createClient` from `@supabase/supabase-js` with service role key.
```ts
import { createClient } from "@supabase/supabase-js";

export const supabaseServer = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
```

### 4. Create `supabase/schema.sql`
Full SQL script the user pastes into the Supabase SQL Editor. Must include, in this order:
1. `create extension if not exists vector;`
2. All 6 tables (`meetings`, `transcripts`, `meeting_insights`, `action_items`, `follow_ups`, `meeting_chunks`) with exact columns, types, and constraints from `context/architecture.md`
3. Foreign keys referencing `meetings(id)`
4. Indexes: primary keys (uuid default gen_random_uuid), `meetings.user_id`, `meetings.stream_call_id` (unique), `transcripts.meeting_id` (unique), `meeting_insights.meeting_id` (unique), `action_items.meeting_id`, `follow_ups.meeting_id`, `meeting_chunks.meeting_id`, and the ivfflat index on `meeting_chunks.embedding` for cosine ops
5. `match_meeting_chunks` RPC function that takes `query_embedding vector(768)`, `match_meeting_id uuid`, `match_count int` and returns matching chunks ordered by cosine distance (`embedding <=> query_embedding`), filtered to `meeting_id = match_meeting_id`

### 5. Update `.env.local` template
Add these placeholder lines (user fills in real values):
```
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```
Do NOT overwrite existing env vars — only append these 3 lines.

### 6. Update context files
- `context/progress-tracker.md` — mark Step 1 as done, update Next Action to Step 2
- `context/ui-registry.md` — no UI components added, no change needed

## Files to create/modify
- `src/lib/supabase-client.ts` (new)
- `src/lib/supabase-server.ts` (new)
- `supabase/schema.sql` (new)
- `.env.local` (append 3 lines)
- `context/progress-tracker.md` (update)

## Verification
1. `npx tsc --noEmit` passes
2. Both client files export the correct functions
3. `supabase/schema.sql` runs without errors in the Supabase SQL Editor (user verifies)
4. `match_meeting_chunks` RPC function is callable (user verifies after SQL run)
