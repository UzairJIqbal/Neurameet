"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useClerk, useUser } from "@clerk/nextjs";
import {
  ChevronRight,
  CircleHelp,
  Link2,
  LogOut,
  Menu,
  Search,
  Settings,
  User,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { breadcrumbsFor } from "@/lib/breadcrumbs";
import HelpDialog from "./shell/HelpDialog";
import CommandPalette from "./shell/CommandPalette";
import { OPEN_PALETTE_EVENT } from "@/lib/palette-client";
import NotificationBell from "./shell/NotificationBell";

const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

/** AC-77e: the header on every shell page. */
const Navbar = ({
  onMenu,
  detail,
}: {
  onMenu?: () => void;
  detail?: string | null;
}) => {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useClerk();
  const { user } = useUser();
  const [helpOpen, setHelpOpen] = useState(false);

  const crumbs = breadcrumbsFor(pathname, detail);
  const avatar = user?.imageUrl;
  const initials = initialsOf(user?.fullName ?? "") || "N";

  return (
    <header className="sticky top-0 z-40 flex w-full shrink-0 items-center justify-between gap-3 bg-surface-container-lowest shadow-card px-3 py-2 sm:px-6 lg:px-10">
      <div className="flex min-w-0 items-center gap-2">
        {onMenu && (
          <button
            type="button"
            onClick={onMenu}
            aria-label="Open menu"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-surface transition-colors hover:bg-surface-container-low lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 items-center gap-1 text-body-md"
        >
          {crumbs.map((crumb, i) => (
            <React.Fragment key={crumb.label}>
              {i > 0 && (
                <ChevronRight className="h-4 w-4 shrink-0 text-on-surface-variant" />
              )}
              {crumb.href ? (
                <Link
                  href={crumb.href}
                  className="shrink-0 text-on-surface-variant hover:text-on-surface"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="truncate font-semibold text-on-surface">
                  {crumb.label}
                </span>
              )}
            </React.Fragment>
          ))}
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
          aria-label="Search projects, tasks, meetings"
          className="flex h-10 items-center gap-2 rounded-full px-3 text-body-md text-on-surface-variant transition-colors hover:bg-surface-container-low md:w-72 md:bg-surface-container-low"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="hidden flex-1 truncate text-left md:inline">
            Search projects, tasks, meetings...
          </span>
          <kbd className="hidden shrink-0 rounded-full bg-surface-container-lowest px-2 font-label-mono text-[11px] md:inline">
            Ctrl K
          </kbd>
        </button>
        <NotificationBell />
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          aria-label="Help"
          className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-low"
        >
          <CircleHelp className="h-5 w-5" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Account menu"
              className="flex h-10 w-10 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-container"
            >
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatar}
                  alt=""
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-container text-xs font-bold text-on-primary">
                  {initials}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="min-w-52 rounded-card border-0 bg-surface-container-lowest text-on-surface shadow-float"
          >
            <DropdownMenuItem onSelect={() => router.push("/profile")}>
              <User className="h-4 w-4" />
              My Profile
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => router.push("/settings")}>
              <Settings className="h-4 w-4" />
              Account Settings
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => router.push("/settings?tab=connected")}
            >
              <Link2 className="h-4 w-4" />
              Connected Accounts
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-outline-variant" />
            <DropdownMenuItem
              onSelect={() => void signOut({ redirectUrl: "/sign-in" })}
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
      <CommandPalette />
    </header>
  );
};

export default Navbar;
