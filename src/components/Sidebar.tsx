"use client";
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  sidebarLinks,
  sidebarMoreLinks,
  sidebarSettingsLink,
  type SidebarLink,
} from "../../constants";
import { usePathname, useRouter } from "next/navigation";
import { useClerk, useUser } from "@clerk/nextjs";
import {
  ChevronDown,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  User,
  X,
} from "lucide-react";
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
import CreateProjectDialog from "./projects/CreateProjectDialog";
import { ShellDetailProvider } from "./shell/ShellContext";
import { useVisibleRefetch } from "@/hooks/useVisibleRefetch";
import {
  BELL_REFETCH_MS,
  fetchMyCounts,
  formatCount,
  NOTIFICATIONS_CHANGED_EVENT,
  type MyCounts,
} from "@/lib/notification-client";
import { listProjects } from "@/lib/project-client";
import type { ProjectSummary } from "@/lib/project-types";
import {
  readSidebarCollapsed,
  SIDEBAR_COLLAPSED_EVENT,
  writeSidebarCollapsed,
} from "@/lib/user-prefs";

const PROJECT_SHORTCUTS = 5;

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
  | "prep"
  | "projects"
  | "notifications"
  | "myTasks"
  | "profile";

const isActivePath = (pathname: string, href: string): boolean =>
  pathname === href || pathname.startsWith(`${href}/`);

const NavLink = ({
  link,
  pathname,
  collapsed,
  count,
  onClick,
}: {
  link: SidebarLink;
  pathname: string;
  collapsed: boolean;
  count?: number;
  onClick: () => void;
}) => (
  <Link
    href={link.href}
    onClick={onClick}
    aria-label={collapsed ? link.label : undefined}
    title={collapsed ? link.label : undefined}
    className={cn(
      "flex items-center gap-3 rounded-lg px-4 py-2.5 transition-colors",
      collapsed && "lg:justify-center lg:px-0",
      isActivePath(pathname, link.href)
        ? "border-l-4 border-primary-container bg-on-secondary-fixed-variant text-on-primary"
        : "text-outline hover:bg-on-secondary-fixed-variant/50 hover:text-on-primary",
    )}
  >
    <span className="flex h-5 w-5 shrink-0 items-center justify-center">
      {link.icon}
    </span>
    <span
      className={cn(
        "min-w-0 flex-1 truncate text-label-caps",
        collapsed && "lg:hidden",
      )}
    >
      {link.label}
    </span>
    {count !== undefined && count > 0 && (
      <span
        className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
          collapsed && "lg:hidden",
          link.countFilled
            ? "bg-primary-container text-on-primary"
            : "bg-on-secondary-fixed-variant text-on-primary",
        )}
      >
        {formatCount(count)}
      </span>
    )}
  </Link>
);

const Sidebar = ({
  open,
  collapsed,
  onClose,
  onToggleCollapsed,
}: {
  open: boolean;
  collapsed: boolean;
  onClose: () => void;
  onToggleCollapsed: () => void;
}) => {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useClerk();
  const { user } = useUser();
  const [counts, setCounts] = useState<MyCounts | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [creating, setCreating] = useState(false);

  // AC-77a: same timing as the bell. A failed read keeps the last numbers.
  const refetchCounts = useCallback(() => {
    fetchMyCounts()
      .then(setCounts)
      .catch(() => {});
  }, []);
  useVisibleRefetch(refetchCounts, BELL_REFETCH_MS, [
    NOTIFICATIONS_CHANGED_EVENT,
  ]);

  // Only shortcuts: with no projects loaded the section still offers New Project.
  useEffect(() => {
    const controller = new AbortController();
    listProjects(controller.signal)
      .then((data) => setProjects(data.projects))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const fullName = user?.fullName ?? "Guest";
  const email =
    user?.primaryEmailAddress?.emailAddress ?? "guest@neurameet.app";
  const avatar = user?.imageUrl ?? "";

  return (
    <>
      <aside
        className={cn(
          "absolute inset-y-0 left-0 z-50 flex w-[260px] shrink-0 flex-col bg-inverse-surface py-5 transition-[transform,width] duration-300 ease-in-out lg:fixed lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
          collapsed && "lg:w-[76px]",
        )}
      >
        {/* Brand */}
        <div
          className={cn(
            "mb-5 flex items-center justify-between gap-3 px-6",
            collapsed && "lg:flex-col lg:px-3",
          )}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-container text-[18px] font-bold text-on-primary">
            N
          </span>
          <div className={cn("min-w-0 flex-1", collapsed && "lg:hidden")}>
            <h1 className="text-headline-md font-bold leading-tight text-on-primary">
              NeuraMeet
            </h1>
            <p className="text-[11px] font-bold uppercase tracking-wider text-inverse-on-surface/60">
              AI Intelligence
            </p>
          </div>
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-pressed={collapsed}
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-outline transition-colors hover:bg-on-secondary-fixed-variant/50 hover:text-on-primary lg:flex"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-5 w-5" />
            ) : (
              <PanelLeftClose className="h-5 w-5" />
            )}
          </button>
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
        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3">
          {sidebarLinks.map((link) => (
            <NavLink
              key={link.href}
              link={link}
              pathname={pathname}
              collapsed={collapsed}
              count={link.countKey ? counts?.[link.countKey] : undefined}
              onClick={onClose}
            />
          ))}

          {/* Project shortcuts */}
          <div
            className={cn(
              "mt-4 flex items-center justify-between px-4",
              collapsed && "lg:justify-center lg:px-0",
            )}
          >
            <p
              className={cn(
                "text-label-caps text-outline",
                collapsed && "lg:hidden",
              )}
            >
              Projects
            </p>
            <button
              type="button"
              onClick={() => setCreating(true)}
              aria-label="New Project"
              className="flex h-6 w-6 items-center justify-center rounded text-outline transition-colors hover:bg-on-secondary-fixed-variant/50 hover:text-on-primary"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          {projects.slice(0, PROJECT_SHORTCUTS).map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              onClick={onClose}
              aria-label={collapsed ? project.name : undefined}
              title={collapsed ? project.name : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-4 py-2 transition-colors",
                collapsed && "lg:justify-center lg:px-0",
                isActivePath(pathname, `/projects/${project.id}`)
                  ? "bg-on-secondary-fixed-variant text-on-primary"
                  : "text-outline hover:bg-on-secondary-fixed-variant/50 hover:text-on-primary",
              )}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-on-secondary-fixed-variant text-[11px] font-bold text-on-primary">
                {project.name.charAt(0).toUpperCase()}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-body-md",
                  collapsed && "lg:hidden",
                )}
              >
                {project.name}
              </span>
            </Link>
          ))}
          <Link
            href="/projects"
            onClick={onClose}
            className={cn(
              "rounded-lg px-4 py-2 text-body-md text-outline transition-colors hover:bg-on-secondary-fixed-variant/50 hover:text-on-primary",
              collapsed && "lg:hidden",
            )}
          >
            All projects
          </Link>

          {/* More */}
          <p
            className={cn(
              "mt-4 px-4 text-label-caps text-outline",
              collapsed && "lg:hidden",
            )}
          >
            More
          </p>
          <div
            className={cn(
              "mx-1 my-3 hidden border-t border-outline/30",
              collapsed && "lg:block",
            )}
          />
          {sidebarMoreLinks.map((link) => (
            <NavLink
              key={link.href}
              link={link}
              pathname={pathname}
              collapsed={collapsed}
              onClick={onClose}
            />
          ))}
        </nav>

        {/* Settings + user profile + account menu */}
        <div className="mt-3 flex flex-col gap-1 border-t border-outline/30 px-3 pt-3">
          <NavLink
            link={sidebarSettingsLink}
            pathname={pathname}
            collapsed={collapsed}
            onClick={onClose}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "group flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-left text-outline transition-colors hover:bg-on-secondary-fixed-variant/50 hover:text-on-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-container",
                  collapsed && "lg:justify-center lg:px-0",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={avatar}
                  alt={fullName}
                  className="h-8 w-8 shrink-0 rounded-full object-cover"
                />
                <div className={cn("min-w-0 flex-1", collapsed && "lg:hidden")}>
                  <p className="truncate text-[13px] font-bold text-on-primary">
                    {fullName}
                  </p>
                  <p className="truncate text-[10px] text-outline">{email}</p>
                </div>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-outline transition-transform group-data-[state=open]:rotate-180",
                    collapsed && "lg:hidden",
                  )}
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              align="start"
              className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[232px] border border-outline/30 bg-inverse-surface text-on-primary"
            >
              <DropdownMenuItem
                className="text-body-md hover:bg-on-secondary-fixed-variant/50 hover:text-on-primary focus:bg-on-secondary-fixed-variant focus:text-on-primary"
                onSelect={() => router.push("/profile")}
              >
                <User className="h-4 w-4" />
                My Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-outline/30" />
              <DropdownMenuItem
                className="text-body-md hover:bg-on-secondary-fixed-variant/50 hover:text-on-primary focus:bg-on-secondary-fixed-variant focus:text-on-primary"
                onSelect={() => void signOut({ redirectUrl: "/sign-in" })}
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
      {creating && (
        <CreateProjectDialog
          onClose={() => setCreating(false)}
          onCreated={(project) => setProjects((prev) => [project, ...prev])}
        />
      )}
    </>
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
  const [collapsed, setCollapsed] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);

  // Read after mount, so the server and the first client render agree.
  useEffect(() => {
    setCollapsed(readSidebarCollapsed());
    const onChange = () => setCollapsed(readSidebarCollapsed());
    window.addEventListener(SIDEBAR_COLLAPSED_EVENT, onChange);
    return () => window.removeEventListener(SIDEBAR_COLLAPSED_EVENT, onChange);
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    writeSidebarCollapsed(next);
  };

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

    // The drawer is mobile-only; once the viewport reaches lg the sidebar is
    // static, so close it to release the scroll lock.
    const lg =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(min-width: 1024px)")
        : null;
    const onViewport = () => {
      if (lg?.matches) setOpen(false);
    };
    onViewport();
    lg?.addEventListener("change", onViewport);

    return () => {
      document.removeEventListener("keydown", onKey);
      lg?.removeEventListener("change", onViewport);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="relative flex min-h-0 flex-1 overflow-x-clip">
      <Sidebar
        open={open}
        collapsed={collapsed}
        onClose={() => setOpen(false)}
        onToggleCollapsed={toggleCollapsed}
      />
      <div
        className={cn(
          "flex flex-1 min-h-0 min-w-0 flex-col overflow-y-auto bg-surface transition-[margin] duration-300 ease-in-out",
          collapsed ? "lg:ml-[76px]" : "lg:ml-[260px]",
        )}
      >
        <Navbar onMenu={() => setOpen(true)} detail={detail} />
        <FloatingChat />
        <ShellDetailProvider value={setDetail}>
          <div className="flex min-h-0 flex-1 flex-col px-3 pb-6 pt-4 sm:px-6 lg:px-10">
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
        </ShellDetailProvider>
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
