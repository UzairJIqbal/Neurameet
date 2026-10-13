# Step P3 — Dashboard Loading Skeleton (fixed size, no layout shift)

## What we are building
Replace the Dashboard's height-growing loading state (a full-screen-height
`<LoaderOne />` spinner) with a **fixed-size skeleton** that occupies the exact
same vertical space as the fully-loaded card (3 capped rows). Goal: **zero CLS**
between loading and loaded, in every data case.

## Context
- Per `context/build-plan.md` Step P3 and `context/progress-tracker.md`: the
  Meeting Intelligence + Meeting Follow-ups dashboard panels grow in height
  during loading (janky/unprofessional) before settling to final size.
- Verified in `src/components/DashboardContent.tsx`:
  - Loading is **already** guarded by `useLoadingTimeout` + `LoadError`
    (lines 83–86, `timedOut ? <LoadError/> : isLoading ? <LoaderOne/> : …`).
    So the code-standard timeout/error rule is already met — P3 does NOT add it.
  - The defect is solely the `isLoading ? <LoaderOne /> : …` branch
    (lines 297–300 and 389–392). `LoaderOne` renders a `h-screen` element, so
    the card balloons during load then collapses → CLS.
  - Panel cap is **3** rows (`meetings.slice(0, 3)` / `followUps.slice(0, 3)`).
  - Header row (always rendered) is identical in loading & loaded states, so it
    never shifts — only the body rows do.
- This is **pure presentation UI**. No Stream Video SDK code (event handlers,
  hooks, call lifecycle, device state) is touched, so the permanent Stream SDK
  verification rule does NOT apply.

## Language we agreed on
- **Fixed-size skeleton** — placeholder rows at the exact height/padding of real
  rows, so the card holds the same space while loading as when loaded.
- **No layout shift (CLS)** — nothing below the panels moves when data resolves.
- **Matching final card dimensions** — skeleton panel == height of the fully
  loaded card (header + 3 capped rows).

## Decisions made
- **Scope:** `src/components/DashboardContent.tsx` only. No new files, no new
  `ui-registry` entry, no API changes, no Stream SDK code.
- **Timeout/LoadError stays as-is** — already present; P3 only swaps the
  `isLoading` branch content.
- **Zero-CLS guarantee:** render exactly **3 skeleton rows** (matching the cap)
  AND lock the card body to a **3-row minimum height** (`min-h-[12rem]`) so even
  a sparse (1-row or 0-row) real result cannot collapse the card below skeleton
  height → CLS = 0 in all cases. (3 × real row height ≈ 192px = 12rem.)
- **Tokens only:** shimmer blocks use `bg-surface-container` + `animate-pulse`
  on the `bg-surface-container-lowest` card — no hex, no raw Tailwind color
  classes, per `context/ui-rules.md` / `context/ui-tokens.md`.
- **Remove** the now-unused `import { LoaderOne } from "./ui/loader";` so `tsc`
  / lint stays clean (LoaderOne is used nowhere else in this file).

## How to build it

### 1. Add inline skeleton row components (top of file, near `QuickActionCard`)
Keep them local to this file (scope-tight, no new exports):
```tsx
const SkeletonBlock = ({ className = "" }: { className?: string }) => (
  <div className={`animate-pulse rounded bg-surface-container ${className}`} />
);

// Matches a Meeting Intelligence row (icon chip + title / date / Open Insights)
const MeetingRowSkeleton = () => (
  <div className="grid grid-cols-12 items-center px-6 py-4">
    <div className="col-span-6 flex items-center gap-3">
      <SkeletonBlock className="h-8 w-8" />
      <SkeletonBlock className="h-4 w-40" />
    </div>
    <div className="col-span-3">
      <SkeletonBlock className="h-4 w-20" />
    </div>
    <div className="col-span-3 flex justify-end">
      <SkeletonBlock className="h-8 w-24 rounded-lg" />
    </div>
  </div>
);

// Matches a Follow-up row (icon chip + two-line label / due / Open)
const FollowUpRowSkeleton = () => (
  <div className="grid grid-cols-12 items-center px-6 py-4">
    <div className="col-span-6 flex items-center gap-3">
      <SkeletonBlock className="h-8 w-8 shrink-0" />
      <div className="flex min-w-0 flex-col gap-1.5">
        <SkeletonBlock className="h-4 w-40" />
        <SkeletonBlock className="h-3 w-28" />
      </div>
    </div>
    <div className="col-span-3">
      <SkeletonBlock className="h-4 w-20" />
    </div>
    <div className="col-span-3 flex justify-end">
      <SkeletonBlock className="h-8 w-16 rounded-lg" />
    </div>
  </div>
);
```

### 2. Lock card body height (both panels)
Change the body wrapper from:
```tsx
<div className="divide-y divide-surface-variant">
```
to:
```tsx
<div className="divide-y divide-surface-variant min-h-[12rem]">
```
(in both the Meeting Intelligence panel ~line 291 and the Follow-ups panel
~line 383).

### 3. Swap the loader branch (both panels)
Replace:
```tsx
) : isLoading ? (
  <div className="flex justify-center py-10">
    <LoaderOne />
  </div>
) : (
```
with:
```tsx
) : isLoading ? (
  <>
    {Array.from({ length: 3 }).map((_, i) => (
      <MeetingRowSkeleton key={i} />
    ))}
  </>
) : (
```
and for the Follow-ups panel the same with `<FollowUpRowSkeleton />`.

### 4. Remove unused import
Delete `import { LoaderOne } from "./ui/loader";` (line 24).

## Files touched
- `src/components/DashboardContent.tsx` — only file changed.

## Verification
- `npx tsc --noEmit` → clean (only the pre-existing unrelated
  `AfterMeetingRecap.test.tsx` error may remain; nothing new).
- `npm run build` → exits 0.
- **Visual CLS check** (manual, in browser):
  1. Hard-reload the dashboard on a throttled "Slow 3G" network (or with the
     devtools Network throttle) and watch the Meeting Intelligence + Follow-ups
     cards. The skeleton must appear at the same height as the loaded 3-row
     card — no upward collapse, no downward jump.
  2. Confirm with a sparse account (1 meeting + 1 follow-up, or 0/0) that the
     card does NOT shrink below skeleton height after load (the `min-h` lock).
  3. Confirm `LoadError` still appears if the fetch is forced to hang past 12s
     (timeout path unchanged).
  4. Confirm real rows still render, search still filters, and "View All" /
     "Open Insights" / "Open" navigate correctly.

## Out of scope (do NOT build)
- No new shared `ui/skeleton.tsx` component/file.
- No `ui-registry.md` change (inline-only, not a reusable exported component).
- No Stream SDK, API, or auth changes.
- No other dashboard polish (that is P4–P11).
