# Step A6 — Make Dashboard Global Search Functional

**Skill context:** `/architect A6` (blueprint approved). Part of Layer 1 (UI functionality audit/repair), the A0 audit source of truth.

## Goal
Make the dashboard "Search anything…" input at `src/components/DashboardContent.tsx` functional. It is currently a dead `type="text"` with no `onChange`/`onSubmit`/`onKeyDown`.

## Behavior (agreed in /architect)
- **Dashboard-scoped** filter over the data the dashboard already holds client-side (`meetings` + `followUps` from component state). NOT a new app-wide search backend.
- Searches **meeting titles** + **follow-up titles / source meeting** only (transcript semantic search is C1, separate).
- **Live**: a controlled input that filters on every keystroke (no Enter/submit required).
- **Both panels filter in place** — Meeting Intelligence + Meeting Follow-ups. No new route, no new backend, zero cost.

## Implementation (`src/components/DashboardContent.tsx`)
1. Import `X` from `lucide-react`.
2. Add `const [query, setQuery] = useState("");`.
3. Derive filtered lists (after the `openFollowUps` block):
   - `const q = query.trim().toLowerCase();`
   - `filteredMeetings = q ? meetings.filter(m => m.title.toLowerCase().includes(q)) : meetings;`
   - `filteredFollowUps = q ? followUps.filter(f => `${f.actionTitle ?? ""} ${f.meetingTitle ?? ""}`.toLowerCase().includes(q)) : followUps;`
   - `visibleMeetings = q ? filteredMeetings : meetings.slice(0, 3);`
   - `visibleFollowUps = q ? filteredFollowUps : followUps.slice(0, 3);` (cap only when no query)
4. Bind the input: `value={query}`, `onChange={(e) => setQuery(e.target.value)}`, `aria-label="Search meetings and follow-ups"`. Add a clear (✕) button when `query` is non-empty that resets to `""`. Keep `hidden md:block`.
5. Render both panels from `visibleMeetings` / `visibleFollowUps` instead of `meetings.slice(0,3)` / `followUps.slice(0,3)`.
6. Empty states per panel:
   - truly no data (`meetings.length === 0` / `followUps.length === 0`) → existing "No meetings yet." (+ Upload CTA) / "No follow-ups yet."
   - has data but no match (`q && filteredX.length === 0`) → "No results for '<query>'." (no CTA)
7. Hide each "View All" link while `q` is non-empty.

## Verification
- Type a substring of a real meeting title → only that meeting shows; follow-up panel filters too.
- Type a non-matching string → both panels show "No results for '…'".
- Clear (✕ or empty) → lists return to 3-cap + "View All" visible.
- `npx tsc --noEmit` clean; `npx next build` exit 0.

## After build (AGENTS.md rule)
Update `context/progress-tracker.md`, `context/ui-registry.md`, mark `context/build-plan.md` A6 ✅ DONE.
