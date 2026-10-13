# Implementation Plan — Step P13.3 (Dashboard responsive: inline rows + mobile search + floating chat cap)

## Context

P13.3 is the Dashboard slice of the P13.0 responsive audit. Three defects are in scope:
- **D3** — `DashboardContent.tsx` inline mini-lists (Meeting Intelligence + Follow-ups) use a hard
  `grid grid-cols-12` with fixed `col-span-6 / col-span-3 / col-span-3` and no `md:` breakpoints and
  no wrapping action cell. On 375px the title/date/action cram and the action button squishes/overflows.
  The dedicated list pages (`PreviousPage.tsx` lines 113–156) already solved this with a responsive
  pattern we will mirror.
- **Mobile search** — the dashboard search input is `hidden md:block` (line 250), so phone users have
  no way to live-filter the two inline panels. Add a mobile entry reusing the existing `query` state.
- **D4 (floating chat)** — `FloatingChat.tsx:122` uses `min-h-[600px]`; on a 375×667 phone that covers
  ~90% of the viewport and obstructs content underneath. The user opted to fold this fix into P13.3.

Out of scope: Quick Actions grid (already responsive `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`),
the two-panel `grid-cols-1` stack (already single-column on mobile), and the global dropdown-token
fix (that is P13.10). The floating chat's *positioning* stays fixed — only its height cap changes.

## Language we agreed on

- **"Dashboard inline rows"** — the mini Meeting Intelligence + Follow-ups lists rendered *inside*
  `DashboardContent.tsx`, not the dedicated `/meeting-intelligence` / `/follow-ups` pages.
- **"Responsive reflow"** — at 375px rows keep the 12-col grid but the action button drops to its own
  full-width row below title+date, matching `PreviousPage.tsx`.
- **"Mobile search entry"** — a full-width `sm:hidden` search bar added to the dashboard content area,
  bound to the existing `query` state (reuses the "No results" empty state).
- **"Floating chat fix"** — cap the expanded panel's min-height on phones so it no longer covers the
  screen; positioning/width behavior unchanged.

## Decisions made

- **Reflow = mirror list pages** (not stacked cards): apply `md:` col-spans + a `col-span-12 mt-2
  flex flex-wrap` action cell, identical to `PreviousPage.tsx`, for visual consistency across the app.
- **Mobile search = separate `sm:hidden` input** (the chosen option): keep the desktop `hidden md:block`
  header search as-is; add a second `sm:hidden` full-width input in the content area bound to the same
  `query`/`setQuery` so both stay in sync. Reuses `query` → no new state, no new filtering logic.
- **Floating chat = responsive min-height**: change `min-h-[600px]` → `min-h-[60vh] sm:min-h-[600px]`.
  Width cap (`max-w-[calc(100vw-3rem)]`) and `max-h-[min(820px,92vh)]` stay; only the floor changes.

## How to build it (all zero-cost, token-only classes — no hex, no raw Tailwind colors)

### File 1 — `src/components/DashboardContent.tsx`

1. **Mobile search bar** (add once, right after the content wrapper opens at line 290 and before the
   "Quick Actions" heading):
   ```tsx
   <div className="relative mb-6 sm:hidden">
     <Search className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-outline" />
     <input
       type="text"
       value={query}
       onChange={(e) => setQuery(e.target.value)}
       placeholder="Search meetings & follow-ups"
       aria-label="Search meetings and follow-ups"
       className="w-full rounded-full border border-surface-variant bg-surface-container-low py-2 pl-9 pr-9 text-body-md text-on-surface outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
     />
     {query && (
       <button
         type="button"
         onClick={() => setQuery("")}
         aria-label="Clear search"
         className="absolute right-3 top-1/2 -translate-y-1/2 text-outline transition-colors hover:text-on-surface"
       >
         <X className="h-4 w-4" />
       </button>
     )}
   </div>
   ```

2. **Meeting Intelligence header** (lines 320–323) → responsive + hide Action col on mobile:
   ```tsx
   <div className="col-span-6 md:col-span-5">Meeting Title</div>
   <div className="col-span-6 md:col-span-3">Date</div>
   <div className="col-span-12 hidden text-right md:col-span-4 md:block">Action</div>
   ```

3. **Meeting Intelligence rows** (lines 362 / 372 / 379):
   - title cell → `col-span-6 flex items-center gap-3 md:col-span-5`
   - date cell → `col-span-6 text-body-md text-on-surface-variant md:col-span-3`
   - action cell → `col-span-12 mt-2 flex flex-wrap justify-end gap-2 md:col-span-4 md:mt-0 md:flex-nowrap`

4. **Follow-ups header** (lines 414–417) → same treatment:
   ```tsx
   <div className="col-span-6 md:col-span-5">Action Item</div>
   <div className="col-span-6 md:col-span-3">Due</div>
   <div className="col-span-12 hidden text-right md:col-span-4 md:block">Action</div>
   ```

5. **Follow-ups rows** (lines 449 / 464 / 469):
   - title cell → `col-span-6 flex items-center gap-3 md:col-span-5`
   - date cell → `col-span-6 text-body-md text-on-surface-variant md:col-span-3`
   - action cell → `col-span-12 mt-2 flex flex-wrap justify-end gap-2 md:col-span-4 md:mt-0 md:flex-nowrap`

### File 2 — `src/components/FloatingChat.tsx`

6. **Line 122** — change `min-h-[600px]` → `min-h-[60vh] sm:min-h-[600px]` in the expanded-panel
   `className`. Leave `max-h-[min(820px,92vh)]`, `w-[380px]`, `max-w-[calc(100vw-3rem)]`,
   `bottom-6 right-6` untouched.

## Assumptions

- The existing `query` state already drives both inline panels and the "No results" empty states, so
  the added mobile input needs no new logic — only a bound input + clear affordance.
- `60vh` is a sensible floor for phones (leaves ~40% of a 375×667 screen visible above the panel);
  tunable at `/check verify` if it still feels tall.
- `PreviousPage.tsx` is the canonical responsive row pattern and is safe to copy from.

## Verification (per P13.x: manual at true mobile width, no new Playwright)

1. `npx tsc --noEmit` — clean.
2. `npm run build` — exit 0.
3. `npx vitest run` — existing suite stays green (no regressions).
4. `/check verify` at **375px** and **768px**:
   - Dashboard inline rows: title + date share the top line; "Open Insights" / "Open" drops to its own
     full-width row, no squish/overflow, no horizontal scroll.
   - Headers: Meeting Title / Date visible; Action header column hidden on mobile.
   - Mobile search bar visible at 375, hidden at ≥640; live-filters both panels; clear (X) works; the
     desktop header search still shows at ≥768.
   - Floating chat expanded: at 375 the panel no longer covers the whole screen (top portion of page
     remains visible); width cap still ~327px.
5. Optional best-effort unit test (parity with P13.1/P13.2): assert the rendered rows carry
   `md:col-span-5` / `col-span-12` / `flex flex-wrap` — only if a clean Clerk-mocked render is feasible;
   **not** a gate. Primary gate is the manual `/check verify`.

## After build

- Flip `docs/scope/scope.md` P13.3 `[ ] Build it` → done.
- Flip `context/progress-tracker.md` P13.3 to ✅ DONE (and note the bundled floating-chat D4 cap).
