# Step P4 — Sidebar Cleanup

## Context
`/architect` Step P4 of the Product Final Polishing pass. Three sub-problems were confirmed with the user:
- (a) Several sidebar items share one icon (Personal Room / Follow-ups / Settings all reuse `Personal.png`), and two mappings are wrong (Meeting Intelligence → `Upcoming.png`, AI Chat → `Previous.png`). Decision: **switch every item to a distinct `lucide-react` icon**, dropping the PNG `/icons/sidebar/*` images.
- (b) Reorder items by actual usage frequency (Dashboard first already correct; bump frequently-used items up; pin Settings at the bottom behind a separator).
- (c) The bottom account button shows name/email and fires `signOut()` directly on click, but its chevron misleads (no menu). Decision: **real Radix dropdown menu** (reuse `src/components/ui/dropdown-menu.tsx`) with **Manage account** (Clerk `openUserProfile()`) + **Sign out** (`signOut()`).

Scope is presentation-layer only. **No Stream Video SDK code is touched**, so the permanent Stream SDK verification rule is satisfied by non-applicability (stated explicitly). No new AI/DB features. No hardcoded hex / no raw Tailwind color classes — only existing tokens (`bg-inverse-surface`, `text-on-primary`, `text-outline`, `border-outline/30`, popover/accent/muted via the reused dropdown component).

## Files to modify
1. `constants/index.tsx` — rewrite `sidebarLinks` to lucide icons + new order + `dividerBefore` flag; add an exported `SidebarLink` type; drop the now-unused `next/image` import.
2. `src/components/Sidebar.tsx` — render a separator before the `dividerBefore` item; replace the single `<button onClick={signOut()}>` account control with a `DropdownMenu` trigger + content.

## Implementation steps

### 1. `constants/index.tsx`
- Remove `import Image from "next/image"`.
- Import the lucide icons: `LayoutDashboard, History, CalendarClock, Brain, MessageSquare, PlayCircle, Video, ListTodo, Settings, Search, ListChecks` from `lucide-react`.
- Add and export a type:
  ```ts
  export type SidebarLink = {
    label: string;
    href: string;
    icon: React.ReactNode;
    dividerBefore?: boolean;
  };
  ```
- Rewrite `sidebarLinks: SidebarLink[]` in this order (usage-ranked), each with a distinct icon and `className="h-5 w-5"` on the icon:
  1. Dashboard → `/dashboard` → `LayoutDashboard`
  2. Meeting Intelligence → `/meeting-intelligence` → `Brain`
  3. AI Chat → `/ai-chat` → `MessageSquare`
  4. Recordings → `/recording` → `PlayCircle`
  5. Follow-ups → `/follow-ups` → `ListTodo`
  6. Previous Meetings → `/previous` → `History`
  7. Upcoming Meetings → `/upcoming` → `CalendarClock`
  8. Personal Room → `/personal-room` → `Video`
  9. Search → `/search` → `Search`
  10. Prep → `/prep` → `ListChecks`
  11. Settings → `/settings` → `Settings` (add `dividerBefore: true`)
- Keep all other existing exports (`instantMeetingModelImages`, `placeholders`, `handleChange`, `words`, `audioType`, `sideTitleTypes`) untouched.

### 2. `src/components/Sidebar.tsx`
- Keep existing `usePathname`, `useClerk` (destructure `signOut` and `openUserProfile`), `useUser` imports.
- Import from the reused dropdown: `DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator` from `@/components/ui/dropdown-menu`. Import `User, LogOut` from `lucide-react`.
- In the `<nav>` map, wrap each item in `React.Fragment` and render a separator before `link.dividerBefore`:
  ```tsx
  {link.dividerBefore && (
    <div className="mx-3 my-2 border-t border-outline/30" />
  )}
  ```
  (The per-item render logic — `<a href>`, active class, icon `<span>` — is unchanged; `link.icon` is now a lucide element instead of a Next `Image`.)
- Replace the bottom account `<button onClick={() => signOut()}>…</button>` block with:
  ```tsx
  <div className="mt-auto px-3">
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-outline transition-colors hover:bg-on-secondary-fixed-variant/50 hover:text-on-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-container"
        >
          <img src={avatar} alt={fullName} className="h-8 w-8 shrink-0 rounded-full object-cover" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-on-primary">{fullName}</p>
            <p className="truncate text-[10px] text-outline">{email}</p>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-outline" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[232px]">
        <DropdownMenuItem onSelect={() => openUserProfile()}>
          <User className="h-4 w-4" />
          Manage account
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => signOut()}>
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
  ```
  - `ChevronDown` is already imported in `Sidebar.tsx`.
  - `openUserProfile()` and `signOut()` come from the destructured `useClerk()`.
  - The menu opens upward (`side="top"`) above the bottom-anchored button; width matches the trigger via the Radix CSS var so it lines up with the button.

## Verification
- `npx tsc --noEmit` → clean (no `any`, no missing types; `SidebarLink` typed).
- `npm run lint` → clean.
- `npm run build` → exit 0.
- Manual: open any authenticated page → sidebar shows 11 items, each with a **distinct** icon, in the usage-ranked order with a separator above Settings. Click each item → navigates to the correct route (routes unchanged). Bottom account button: click → menu opens **upward** showing **Manage account** and **Sign out**. "Manage account" opens the Clerk profile modal; "Sign out" signs out and redirects to Clerk.

## Out-of-scope (noted, not changed)
- The nav items use plain `<a href>` (full reload) rather than `next/link` client nav. Left as-is to keep P4 strictly to the three sub-problems; flag for a later polish step if desired.
- Active-state matching uses strict `pathname === link.href`, so sub-routes (e.g. `/meeting-intelligence/[id]`) won't mark the parent active. Not part of P4.

## Post-feature
- Update `context/ui-registry.md` Sidebar row (icons now lucide; account control is a dropdown menu, not a direct sign-out button).
- Update `context/progress-tracker.md` P4 row → ✅.
