# Step 7 — Follow-ups (auto-generate + List + Details + status Server Action)

**Skills to load first:** `/architect` (complex feature — already reasoned). Supporting reads (do BEFORE writing any code):
- `context/architecture.md` (schema: `action_items`, `follow_ups`; folder structure; system boundaries)
- `context/ui-tokens.md`, `context/ui-rules.md`, `context/ui-registry.md` (component + token patterns)
- `context/code-standards.md`, `context/library-docs.md`
- Mirror patterns: `src/components/meeting-intelligence/MeetingList.tsx`, `src/components/meeting-intelligence/MeetingDetail.tsx`, `src/components/Sidebar.tsx` (`Sidebar_Com` type switch), `src/app/api/meetings/route.ts` (auth + user-scoped join read), `src/app/api/ai/process/route.ts` (where `action_items` are written).

**Decision (confirmed with user):** follow-up status update = **Server Action** (`actions/follow-ups.ts`), NOT an API route. Honors `architecture.md` + `build-plan.md` Step 7 wording. Do NOT create `POST /api/follow-ups/[id]/status`.

---

## Scope

Three deliverables, all within AGENTS.md boundaries (UI displays only; reads via API routes; writes via Server Actions; Supabase server client only):

1. **Auto-generate `follow_ups` from `action_items`** — close the gap in the Step 3 process pipeline.
2. **Follow-up List page** (`/follow-ups`) — `GET /api/follow-ups` + `FollowUpList.tsx`.
3. **Follow-up Details page** (`/follow-ups/[id]`) — `GET /api/follow-ups/[id]` + `FollowUpDetails.tsx` + status Server Action.
4. **Status update Server Action** `src/actions/follow-ups.ts`.

Out of scope (do NOT build): the general `/ai-chat` page, change-category write path, Playwright E2E (Step 9), replacing `DashboardContent`'s static `followUps` array (deferred — separate task). Do not overbuild.

---

## 1. Auto-generate `follow_ups` from `action_items`

File: `src/app/api/ai/process/route.ts`

In the existing `POST` handler, the `action_items` insert currently writes without returning ids and does NOT create `follow_ups`. Change so that, after `action_items` insert succeeds, we also create a `follow_up` per action item.

- Change the `action_items` insert to capture the inserted rows:
  ```ts
  const { data: insertedItems, error: actionItemsError } = await supabase
    .from("action_items")
    .insert(
      result.actionItems.map((item) => ({
        meeting_id: meetingId,
        title: item.title,
        assignee: item.assignee ?? null,
        due_date: item.dueDate ?? null,
      })),
    )
    .select("id, meeting_id");
  ```
- After a successful (non-error) `action_items` insert, generate `follow_ups` for the returned items:
  ```ts
  if (!actionItemsError && insertedItems && insertedItems.length > 0) {
    const { error: followUpError } = await supabase.from("follow_ups").insert(
      insertedItems.map((ai) => ({
        action_item_id: ai.id,
        meeting_id: ai.meeting_id,
        status: "pending",
        priority: "medium",
        notes: null,
        updated_at: new Date().toISOString(),
      })),
    );
    if (followUpError) {
      console.error("Failed to auto-generate follow-ups:", followUpError);
      // Non-fatal — insights + action items are already saved
    }
  }
  ```
- Keep the existing `actionItemsError` non-fatal handling; wrap the follow-up insert in its own try/catch or rely on the outer `try`. **Every AI/DB step stays non-fatal past insights** (insights are the gate; action items + follow-ups degrade gracefully with logged errors).
- `follow_ups` columns: `id` (uuid, default), `action_item_id`, `meeting_id`, `status` (`pending`/`needs_attention`/`completed`), `priority` (`low`/`medium`/`high`), `notes`, `updated_at`. No `created_at` column exists on `follow_ups` — do NOT insert one.

### One-time backfill (existing data only)
The 3 already-processed meetings have `action_items` but no `follow_ups`. Run this ONCE in the Supabase SQL Editor (this is a manual data fix, not a feature — consistent with the manual re-embed decision):
```sql
INSERT INTO follow_ups (action_item_id, meeting_id, status, priority, updated_at)
SELECT ai.id, ai.meeting_id, 'pending', 'medium', now()
FROM action_items ai
WHERE NOT EXISTS (SELECT 1 FROM follow_ups f WHERE f.action_item_id = ai.id);
```

---

## 2. Read API routes (mirror `src/app/api/meetings/route.ts`)

### `GET /api/follow-ups` — `src/app/api/follow-ups/route.ts` (new)
- `auth()` → 401 if no `userId`.
- Query `follow_ups`, scoped to the user via the `meetings` FK join on `user_id`:
  ```ts
  const { data, error } = await supabase
    .from("follow_ups")
    .select(
      "id, status, priority, notes, updated_at, meeting_id, action_item_id, meetings(title), action_items(title, assignee, due_date)",
    )
    // ownership scope: follow_ups → meetings.user_id
    .eq("meetings.user_id", userId)
    .order("updated_at", { ascending: false });
  ```
- If Supabase cannot resolve the dotted `meetings.user_id` filter through the FK, fall back to: fetch the user's `meeting_id`s first (`meetings.select('id').eq('user_id', userId)`), then `.in("meeting_id", ids)`. Never query across users.
- Map to a typed `FollowUpItem[]` (see §5). Return `{ followUps }`. try/catch → 500.

### `GET /api/follow-ups/[id]` — `src/app/api/follow-ups/[id]/route.ts` (new)
- `auth()` → 401.
- Load the single follow_up by `id`, scoping ownership via `meetings.user_id` join (or `.in("meeting_id", userMeetingIds)`). Include `meetings(title, started_at, status)` + `action_items(title, assignee, due_date)` context.
- 404 if not found / not owned. Return `{ followUp }` typed as `FollowUpDetail`. try/catch → 500.

---

## 3. Server Action — `src/actions/follow-ups.ts` (new)

```ts
"use server";
import "server-only";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";

export type FollowUpStatus = "pending" | "needs_attention" | "completed";

export async function updateFollowUpStatus(id: string, status: FollowUpStatus) {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Unauthorized" } as const;

  try {
    const supabase = supabaseServer();
    // Ownership check: follow_up must belong to one of the user's meetings
    const { data: fu, error: fuError } = await supabase
      .from("follow_ups")
      .select("meeting_id, meetings(user_id)")
      .eq("id", id)
      .single();
    if (fuError || !fu || fu.meetings?.user_id !== userId) {
      return { ok: false, error: "Not found" } as const;
    }

    const { error } = await supabase
      .from("follow_ups")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("Failed to update follow-up:", error);
      return { ok: false, error: "Update failed" } as const;
    }

    revalidatePath("/follow-ups");
    revalidatePath(`/follow-ups/${id}`);
    return { ok: true } as const;
  } catch (err) {
    console.error("updateFollowUpStatus error:", err);
    return { ok: false, error: "Update failed" } as const;
  }
}
```
- Server Action rules from AGENTS.md: `import "server-only"`, never calls agent functions, uses `supabaseServer()` for writes, scopes by `user_id`, wrapped in try/catch, never crashes the run.
- Called from `FollowUpDetails` via a `<form action={...}>` or `useTransition` + `bind`. After success, the `revalidatePath` refreshes the list/detail. (Optionally also drive the UI status chip from the returned result.)

---

## 4. UI components

### `src/lib/meeting-types.ts` — add types
```ts
export type FollowUpStatus = "pending" | "needs_attention" | "completed";
export type FollowUpPriority = "low" | "medium" | "high";

export interface FollowUpItem {
  id: string;
  meetingId: string;
  actionItemId: string;
  status: FollowUpStatus;
  priority: FollowUpPriority;
  notes: string | null;
  updatedAt: string;
  meetingTitle: string | null;
  actionTitle: string | null;
  assignee: string | null;
  dueDate: string | null;
}

export interface FollowUpDetail extends FollowUpItem {
  meetingStatus: string | null;
  meetingStartedAt: string | null;
}
```
(Note: if a `FollowUpStatus` type already exists elsewhere, reuse it — do not duplicate. Check `meeting-types.ts` first.)

### `src/components/follow-ups/FollowUpList.tsx` (new, `"use client"`)
Mirror `MeetingList.tsx` exactly:
- `useState<FollowUpItem[]>`, `isLoading`, `useEffect` fetch `GET /api/follow-ups`.
- Loading → `<LoaderOne />`.
- Card pattern (match existing list pages): `bg-surface-container-lowest rounded-xl border border-outline-variant shadow-[0_4px_20px_rgba(0,0,0,0.04)]`, header row with count, `divide-y divide-surface-variant` rows. Each row: status chip (`bg-surface-container text-primary` icon chip) + `text-on-surface` action title + `text-on-surface-variant` meeting title / due date / assignee. Row links to `/follow-ups/${id}`.
- Empty state per `ui-rules.md` (muted text + lucide icon).
- Error → `react-hot-toast` + empty list.

### `src/components/follow-ups/FollowUpDetails.tsx` (new, `"use client"`)
- Receives `id: string` prop. `useEffect` fetch `GET /api/follow-ups/${id}`. Loading → `<LoaderOne />`. 404/not-found → muted empty state.
- Renders: back link to `/follow-ups`, meeting title + status, action item title, assignee, due date, current status chip, priority chip, notes.
- **Status control**: a small set of controls (buttons or a `<select>` in a `<form action={updateFollowUpStatus.bind(null, id, newStatus)}>`). On submit, the Server Action updates + `revalidatePath` refreshes the page data (refetch on revalidate, or use `useTransition` to optimistically reflect). Use locked tokens only (no hardcoded hex). Buttons styled like existing CTAs: `bg-primary-container text-on-primary hover:bg-primary` for primary actions; the three statuses map to `pending` / `needs_attention` / `completed`.
- Show a `react-hot-toast` on failure (Server Action returns `{ ok: false }`).

### Page wiring (mirror meeting-intelligence pages + `Sidebar_Com`)
- `src/app/(root)/(home)/follow-ups/page.tsx` (server component, like `meeting-intelligence/page.tsx`):
  ```tsx
  import Sidebar_Com from "@/components/Sidebar";
  const FollowUpsPage = () => <Sidebar_Com type="followUps" />;
  export default FollowUpsPage;
  ```
- `src/app/(root)/(home)/follow-ups/[id]/page.tsx` (client component, like `meeting-intelligence/[id]/page.tsx`): uses `useParams()`, renders
  ```tsx
  <Sidebar_Com type="followUps">
    <FollowUpDetails id={id} />
  </Sidebar_Com>
  ```
- `src/components/Sidebar.tsx`:
  - Add `"followUps"` to `SidebarPagesTypes` union.
  - Add case: `{type === "followUps" && <FollowUpList />}` inside the `children ?? (...)` block.
- `constants/index.tsx`: the `/follow-ups` sidebar link already exists (label "Follow-ups", href `/follow-ups`). Leave its icon as-is or swap to a more relevant icon if one exists in `public/icons/sidebar/` — optional, not required.

---

## 5. Verify against design tokens / rules
- No hardcoded hex or raw Tailwind color classes — use CSS variables from `ui-tokens.md` (match the existing list pages exactly).
- Card shadow: reuse the exact `shadow-[0_4px_20px_rgba(0,0,0,0.04)]` already used by `MeetingList`/`RecordingPage` for visual consistency (the `.card-shadow` token is the locked equivalent — prefer it if it renders identically).
- Typography: headings use `text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg` (per the consistency pass).
- Loading → `LoaderOne`; empty/error states per `ui-rules.md`.

---

## 6. Checks (run after implementation)
1. `npx tsc --noEmit` — must be clean (strict, no `any`).
2. `npm run build` — must exit 0 (ESLint is `ignoreDuringBuilds: true`, so `tsc` is the real gate).
3. **Backend logic (no browser needed for the write path):**
   - Process a NEW transcript upload (or re-run process for a meeting) → confirm `follow_ups` rows appear for its action items (Supabase: `select count(*) from follow_ups where meeting_id = '<id>'`).
   - Run the backfill SQL once → confirm existing 3 meetings now have `follow_ups`.
   - `GET /api/follow-ups` returns the user's follow-ups only; `GET /api/follow-ups/[id]` returns 401 unauthenticated (correct) and 404 for another user's id.
   - Server Action `updateFollowUpStatus` flips status and `revalidatePath` reflects it on reload.
4. **Browser (you, via Clerk OAuth — can't drive headlessly):** log in at http://localhost:3000 → sidebar "Follow-ups" → list shows items → open one → change status → confirm chip updates and list reflects it.

## 7. After done
- Update `progress-tracker.md` (move Step 7 → Done with bullets) and `ui-registry.md` (capture `FollowUpList`/`FollowUpDetails` + `updateFollowUpStatus` patterns) and `ui-registry.md` component count.
- Update `memory.md` next-session handoff.
- Next: Step 8 (Recordings library + Settings) — or Step 9 E2E if preferred.
