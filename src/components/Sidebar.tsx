"use client";
import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { sidebarLinks } from "../../constants";
import { usePathname } from "next/navigation";
import { useClerk, useUser } from "@clerk/nextjs";
import { ChevronDown, User, LogOut, X, Menu } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import DashboardContent from "@/components/DashboardContent";
import PreviousPage from "./PreviousPage";
import RecordingPage from "./RecordingPage";
import UpcomingPage from "./UpcomingPage";
import PersonalRoomPage from "./PersonalRoomPage";
import JoinMeetingPage from "./JoinMeetingPage";
import MeetingList from "./meeting-intelligence/MeetingList";
import FollowUpList from "./follow-ups/FollowUpList";
import SettingsPage from "./SettingsPage";
import GeneralChat from "./meeting-intelligence/GeneralChat";
import SearchPage from "./SearchPage";
import PrepPage from "./PrepPage";
import Navbar from "./Navbar";
import FloatingChat from "./FloatingChat";

export type SidebarPagesTypes =
  | "Home"
  | "upcomingPage"
  | "previousPage"
  | "recordingsPage"
  | "personalRoom"
  | "joinMeeting"
  | "meetingIntelligence"
  | "followUps"
  | "aiChat"
  | "settings"
  | "search"
  | "prep";

const Sidebar = ({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => {
  const pathname = usePathname();
  const { signOut, openUserProfile } = useClerk();
  const { user } = useUser();

  const fullName = user?.fullName ?? "Guest";
  const email = user?.primaryEmailAddress?.emailAddress ?? "guest@neurameet.app";
  const avatar = user?.imageUrl ?? "";

  return (
    <aside
      className={cn(
        "absolute inset-y-0 left-0 z-50 flex w-[260px] shrink-0 flex-col bg-inverse-surface py-6 transition-transform duration-300 ease-in-out lg:fixed lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full",
      )}
    >
      {/* Brand */}
      <div className="mb-8 flex items-center justify-between gap-3 px-6">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-container text-[18px] font-bold text-on-primary">
          N
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-headline-md font-bold leading-tight text-on-primary">
            NeuraMeet
          </h1>
          <p className="text-[11px] font-bold uppercase tracking-wider text-inverse-on-surface/60">
            AI Intelligence
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close menu"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-on-primary transition-colors hover:bg-on-secondary-fixed-variant/50 lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-2 px-3">
        {sidebarLinks.map((link, idx) => {
          const isActive = pathname === link.href;
          return (
            <React.Fragment key={idx}>
              {link.dividerBefore && (
                <div className="mx-1 my-2 border-t border-outline/30" />
              )}
              <a
                href={link.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-4 py-3 transition-colors",
                  isActive
                    ? "border-l-4 border-primary-container bg-on-secondary-fixed-variant text-on-primary"
                    : "text-outline hover:bg-on-secondary-fixed-variant/50 hover:text-on-primary",
                )}
              >
                <span className="flex h-5 w-5 items-center justify-center">
                  {link.icon}
                </span>
                <span className="text-label-caps">{link.label}</span>
              </a>
            </React.Fragment>
          );
        })}
      </nav>

      {/* User profile + account menu */}
      <div className="mt-auto px-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="group flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-outline transition-colors hover:bg-on-secondary-fixed-variant/50 hover:text-on-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-container"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={avatar}
                alt={fullName}
                className="h-8 w-8 shrink-0 rounded-full object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-on-primary">
                  {fullName}
                </p>
                <p className="truncate text-[10px] text-outline">{email}</p>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-outline transition-transform group-data-[state=open]:rotate-180" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[232px] border border-outline/30 bg-inverse-surface text-on-primary"
          >
            <DropdownMenuItem
              className="text-body-md hover:bg-on-secondary-fixed-variant/50 hover:text-on-primary focus:bg-on-secondary-fixed-variant focus:text-on-primary"
              onSelect={() => openUserProfile()}
            >
              <User className="h-4 w-4" />
              Manage account
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-outline/30" />
            <DropdownMenuItem
              className="text-body-md hover:bg-on-secondary-fixed-variant/50 hover:text-on-primary focus:bg-on-secondary-fixed-variant focus:text-on-primary"
              onSelect={() => signOut()}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
};

export const Sidebar_Com = ({
  type,
  children,
}: {
  type: SidebarPagesTypes;
  children?: React.ReactNode;
}) => {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Escape to close + lock background scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="relative flex min-h-0 flex-1 overflow-x-clip">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex flex-1 min-h-0 flex-col overflow-y-auto bg-surface lg:ml-[260px]">
        {type !== "Home" && <Navbar onMenu={() => setOpen(true)} />}
        <FloatingChat />
        {type === "Home" && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={open}
            className="fixed left-3 top-3 z-50 flex h-11 w-11 items-center justify-center rounded-lg bg-inverse-surface text-on-primary shadow-lg lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        {children ?? (
          <>
            {type === "Home" && <DashboardContent />}
            {type === "previousPage" && <PreviousPage />}
            {type === "recordingsPage" && <RecordingPage />}
            {type === "upcomingPage" && <UpcomingPage />}
            {type === "personalRoom" && <PersonalRoomPage />}
            {type === "joinMeeting" && <JoinMeetingPage />}
            {type === "meetingIntelligence" && <MeetingList />}
            {type === "followUps" && <FollowUpList />}
            {type === "aiChat" && <GeneralChat />}
            {type === "settings" && <SettingsPage />}
            {type === "search" && <SearchPage />}
            {type === "prep" && <PrepPage />}
          </>
        )}
      </div>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}
    </div>
  );
};

export default Sidebar_Com;
