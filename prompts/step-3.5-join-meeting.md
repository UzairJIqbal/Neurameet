# Step 3.5 — Feature 4: Join Meeting (standalone page)

**Goal:** Build the standalone **Join Meeting page** at `/join-meeting` matching
`context/designs/join-meeting.png` + `join-meeting.html`, and repoint the dashboard
"Join Meeting" quick action to it. The Join *modal* in `MeetingModel.tsx` is already
styled (Feature 3) and keeps serving New + Schedule only.

**Reference assets (read first):**
- `context/designs/join-meeting.png` — source of truth for layout/spacing/icon treatment
- `context/designs/join-meeting.html` — token values + structure
- `context/ui-tokens.md` — locked color/type/radius tokens (supersedes everything else)
- `context/ui-registry.md` — existing component patterns (Sidebar_Com, ModalBody, stateful-button)
- Existing patterns: `src/app/(root)/(home)/personal-room/page.tsx`, `src/components/Sidebar.tsx`, `src/components/DashboardContent.tsx`, `src/lib/utils.ts`

---

## 1. New route + page

Create `src/app/(root)/(home)/join-meeting/page.tsx`:

```tsx
import Sidebar_Com from "@/components/Sidebar";
import JoinMeetingPage from "@/components/JoinMeetingPage";

const JoinMeeting = () => {
  return <Sidebar_Com type="joinMeeting" />; // type added in §3
};

export default JoinMeeting;
```

> The `(home)/layout.tsx` already provides `bg-surface` + `pt-20` content padding and
> renders `<Sidebar_Com>` children inside `flex-1`. The page component centers its card.

## 2. New component `src/components/JoinMeetingPage.tsx`

Client component (needs `useUser`, `useRouter`, clipboard, local input state).
Follow the design card exactly with **locked tokens** (no hex, no raw color classes):

**Card shell** (centered in content area):
```
className="mx-auto flex w-full max-w-md flex-col gap-6 rounded-lg border border-outline-variant bg-surface-container-lowest p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)] lg:p-8"
```
(`(home)/layout` already centers via `flex-1`; wrap card in a `flex min-h-full items-center justify-center` if needed.)

**Header block** (`text-center`):
- Icon circle: `flex h-16 w-16 mx-auto mb-4 items-center justify-center rounded-full bg-surface-container-low text-primary-container` with lucide `Video` (size 28). lucide-react is already installed (used in Sidebar).
- Heading: `text-display-lg font-display-lg text-on-surface mb-2` → "Join Meeting"
- Subtitle: `text-body-md font-body-md text-on-surface-variant` → "Enter meeting code or paste the meeting link to join the meeting."

**Form** (`flex flex-col gap-5`):
- Label: `text-label-caps font-label-caps uppercase tracking-wider text-on-surface` → "Meeting Code or Link"
- Input: `h-12 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-4 text-body-md font-body-md text-on-surface placeholder:text-outline focus:border-primary-container focus:outline-none focus:ring-2 focus:ring-primary-container/20 transition-all` (focus glow per design `.input-glow`). `type="text"`, `placeholder="https://meet.neurameet.com/abc-xyz"`, controlled `value`/`onChange`.
- Join button: reuse `stateful-button` base OR explicit `h-12 w-full rounded-lg bg-primary-container text-on-primary text-body-md font-body-md font-semibold transition-colors hover:bg-primary flex items-center justify-center gap-2` with label "Join Meeting" + lucide `ArrowRight`. On click → `handleJoin()`.

**Divider:** `my-2 h-px w-full bg-surface-variant` → use `bg-outline-variant` (locked border token; `surface-variant` is a fill color, not a divider — prefer `bg-outline-variant`).

**Personal Room block** (`flex flex-col gap-3`):
- Heading: `text-body-md font-body-md font-semibold text-on-surface` → "Your Personal Room"
- Link row: `flex items-center justify-between gap-3 rounded-lg border border-dashed border-outline-variant bg-surface-container-low p-3`
  - Link text: `text-label-mono font-label-mono text-on-surface-variant truncate` → `${process.env.NEXT_PUBLIC_BASE_URL}/meeting/${user.id}` (same derivation as `PersonalRoomPage.tsx` line 24-25). Confirm `NEXT_PUBLIC_BASE_URL` is set; fall back to `window.location.origin` if undefined.
  - Copy button: `flex shrink-0 items-center gap-1 text-primary-container hover:text-primary text-label-caps font-label-caps font-bold uppercase transition-colors` with lucide `Copy` → copies the link via `navigator.clipboard.writeText`, `react-hot-toast` "Personal room link copied".

**`handleJoin()`:**
```ts
const meetingId = getMeetingIdFromLink(value.trim());
if (!meetingId) { toast.error("Please enter a valid meeting code or link"); return; }
router.push(`/meeting/${meetingId}`);
```
Reuse `getMeetingIdFromLink` from `src/lib/utils.ts` (already handles URL + raw id).

**Edge cases:** empty `user` (Clerk loading) → render link as empty/placeholder string `""` and disable copy until loaded; never crash.

## 3. Wire `Sidebar_Com` `type`

In `src/components/Sidebar.tsx`:
- Add `"joinMeeting"` to `SidebarPagesTypes`.
- In `Sidebar_Com`, import `JoinMeetingPage` and add branch:
  `{type === "joinMeeting" && <JoinMeetingPage />}` (insert before/after `personalRoom`).

## 4. Repoint dashboard quick action

In `src/components/DashboardContent.tsx`:
- The "Join Meeting" card (around line 119-123, `onClick: () => setMeetingModalType("isJoinMeeting")`) → change to `onClick: () => router.push("/join-meeting")`.
- `router` already imported (line 62). Leave `isJoinMeeting` in the `meetingModalType` union and the `MeetingModel` Join branch **untouched** (modal still serves New/Schedule; removing the branch is out of scope).
- No sidebar nav change (design sidebar keeps Dashboard active; Join is not a nav item).

---

## Token / fidelity notes
- All colors via tokens: `surface-container-lowest`, `outline-variant`, `on-surface`, `on-surface-variant`, `primary-container`, `on-primary`, `primary`, `surface-container-low`, `label-mono`. No hex, no raw Tailwind color classes.
- Radius: card + input + button all `rounded-lg` (ui-tokens: cards=lg; design used rounded-xl/rounded-lg — lg is the locked card radius and is visually equivalent here).
- No `blur-*`, `backdrop-blur-*` anywhere (decorative shadow only, opacity-based).
- Icons: lucide-react `Video`, `ArrowRight`, `Copy` (already a dependency). Do NOT add `@tabler/icons-react` or material symbols.
- Headings use `text-display-lg` (config has `display-lg`; `display-lg-mobile` is not defined in `tailwind.config.ts` — use `text-display-lg`, acceptable on mobile).

## Out of scope (do not build)
- No new sidebar nav item for Join.
- No changes to `MeetingModel` Join branch, New/Schedule modal, or `createMeeting`/`ScheduleMeeting`.
- No Supabase/persistence (Step 1 later).
- No AI features.

## Checks (run after implementation)
1. `npx tsc --noEmit` — clean.
2. `npm run build` — exit 0.
3. `npm run lint` (if configured) — clean.

## Manual test steps (share with user)
1. `npm run dev`, sign in.
2. Dashboard → "Join Meeting" card → lands on `/join-meeting` (centered card, light theme, correct tokens).
3. Paste a valid meeting URL (e.g. `http://localhost:3000/meeting/<id>`) → Join → routes to `/meeting/<id>`.
4. Paste a raw code → Join → routes correctly.
5. Invalid/empty → `react-hot-toast` error, no navigation.
6. Personal Room link shows `…/meeting/<clerk-user-id>`; Copy → toast + clipboard contains link.
7. Visual: verify against `context/designs/join-meeting.png` (icon circle, spacing, dashed personal-room box, button color/hover).

## Follow-ups after approval
- Update `context/ui-registry.md` (add `JoinMeetingPage` row + `join-meeting` route) and `context/progress-tracker.md` (mark Feature 4 done).
- Run `/imprint` after the new component.
