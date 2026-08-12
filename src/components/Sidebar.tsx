/* eslint-disable prettier/prettier */

/* eslint-disable prettier/prettier */

/* eslint-disable prettier/prettier */
"use client";
import React, { useState } from "react";
import { Sidebar, SidebarBody, SidebarLink } from "@/components/ui/sidebar";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { sidebarLinks } from "../../constants";
import DashboardContent from "@/components/DashboardContent";
import PreviousPage from "./PreviousPage";
import RecordingPage from "./RecordingPage";
import UpcomingPage from "./UpcomingPage";
import PersonalRoomPage from "./PersonalRoomPage";
import { useClerk } from "@clerk/nextjs";

export type SidebarPagesTypes =
  | "Home"
  | "upcomingPage"
  | "previousPage"
  | "recordingsPage"
  | "personalRoom";

export const Sidebar_Com = ({ type }: { type: SidebarPagesTypes }) => {
  const [open, setOpen] = useState(false);
  const { signOut } = useClerk();
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-full flex-1 flex-col rounded-md border-none bg-inverse-surface md:flex-row",
        "h-full mt-0 left-0 overflow-x-hidden",
      )}
    >
      <Sidebar open={open} setOpen={setOpen}>
        <SidebarBody className="justify-between">
          <div className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto">
            {open ? <Logo /> : <LogoIcon />}
            <div className="mt-8 flex flex-col gap-24">
              {sidebarLinks.map((link, idx) => (
                <SidebarLink key={idx} link={link} />
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-4 mt-8 border-t border-inverse-on-surface/10 pt-4">
            <SidebarLink
              link={{
                label: "Uzair Iqbal",
                href: "/",
                icon: (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src="/icons/images/Uzair Javaid.png"
                    className="h-7 w-7 shrink-0 rounded-full"
                    width={50}
                    height={50}
                    alt="Avatar"
                  />
                ),
              }}
            />
            <button
              onClick={() => signOut()}
              className={cn(
                "flex w-full items-center justify-start gap-2 group/sidebar py-2 rounded-lg px-3",
                "text-inverse-on-surface/70 hover:text-inverse-on-surface hover:bg-inverse-on-surface/5 transition-colors",
              )}
            >
              <svg
                width={20}
                height={20}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              {open && (
                <span className="text-sm whitespace-pre">
                  Sign Out
                </span>
              )}
            </button>
          </div>
        </SidebarBody>
      </Sidebar>
      {type === "Home" && <DashboardContent />}
      {type === "previousPage" && <PreviousPage />}
      {type === "recordingsPage" && <RecordingPage />}
      {type === "upcomingPage" && <UpcomingPage />}
      {type === "personalRoom" && <PersonalRoomPage />}
    </div>
  );
};

export const Logo = () => {
  return (
    <a
      href="#"
      className="relative z-20 flex items-center space-x-2 py-1 text-sm font-normal text-inverse-on-surface"
    >
      <div className="h-5 w-6 shrink-0 rounded-tl-lg rounded-tr-sm rounded-br-lg rounded-bl-sm bg-primary-container" />
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="font-medium whitespace-pre text-inverse-on-surface"
      >
        NeuraMeet
      </motion.span>
    </a>
  );
};
export const LogoIcon = () => {
  return (
    <a
      href="#"
      className="relative z-20 flex items-center space-x-2 py-1 text-sm font-normal text-inverse-on-surface"
    >
      <div className="h-5 w-6 shrink-0 rounded-tl-lg rounded-tr-sm rounded-br-lg rounded-bl-sm bg-primary-container" />
    </a>
  );
};

export default Sidebar_Com;
