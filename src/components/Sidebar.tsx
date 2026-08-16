"use client";
import React from "react";
import { cn } from "@/lib/utils";
import { sidebarLinks } from "../../constants";
import { usePathname } from "next/navigation";
import { useClerk, useUser } from "@clerk/nextjs";
import { ChevronDown } from "lucide-react";
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
import Navbar from "./Navbar";

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
  | "settings";

const Sidebar = () => {
  const pathname = usePathname();
  const { signOut } = useClerk();
  const { user } = useUser();

  const fullName = user?.fullName ?? "Uzair Iqbal";
  const email = user?.primaryEmailAddress?.emailAddress ?? "uzair@example.com";
  const avatar = user?.imageUrl ?? "/icons/images/Uzair Javaid.png";

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-full w-[260px] flex-col bg-inverse-surface py-6">
      {/* Brand */}
      <div className="mb-8 flex items-center gap-3 px-6">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-container text-[18px] font-bold text-on-primary">
          N
        </span>
        <div>
          <h1 className="text-headline-md font-bold leading-tight text-on-primary">
            NeuraMeet
          </h1>
          <p className="text-[11px] font-bold uppercase tracking-wider text-inverse-on-surface/60">
            AI Intelligence
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-2 px-3">
        {sidebarLinks.map((link, idx) => {
          const isActive = pathname === link.href;
          return (
            <a
              key={idx}
              href={link.href}
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
          );
        })}
      </nav>

      {/* User profile + sign out */}
      <div className="mt-auto px-3">
        <button
          type="button"
          onClick={() => signOut()}
          className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-outline transition-colors hover:bg-on-secondary-fixed-variant/50 hover:text-on-primary"
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
          <ChevronDown className="h-4 w-4 shrink-0 text-outline" />
        </button>
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
  return (
    <>
      <Sidebar />
      <div className="ml-0 flex min-h-full flex-col bg-surface lg:ml-[260px]">
        {type !== "Home" && <Navbar />}
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
          </>
        )}
      </div>
    </>
  );
};

export default Sidebar_Com;
