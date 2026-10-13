/* eslint-disable prettier/prettier */

/* eslint-disable prettier/prettier */

/* eslint-disable prettier/prettier */

import type { ReactNode } from "react";
import {
  LayoutDashboard,
  History,
  CalendarClock,
  Brain,
  MessageSquare,
  PlayCircle,
  Video,
  ListTodo,
  Settings,
  Search,
  ListChecks,
} from "lucide-react";

export type SidebarLink = {
  label: string;
  href: string;
  icon: ReactNode;
  dividerBefore?: boolean;
};

export const sidebarLinks: SidebarLink[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: <LayoutDashboard className="h-5 w-5" />,
  },
  {
    label: "Meeting Intelligence",
    href: "/meeting-intelligence",
    icon: <Brain className="h-5 w-5" />,
  },
  {
    label: "AI Chat",
    href: "/ai-chat",
    icon: <MessageSquare className="h-5 w-5" />,
  },
  {
    label: "Recordings",
    href: "/recording",
    icon: <PlayCircle className="h-5 w-5" />,
  },
  {
    label: "Follow-ups",
    href: "/follow-ups",
    icon: <ListTodo className="h-5 w-5" />,
  },
  {
    label: "Previous Meetings",
    href: "/previous",
    icon: <History className="h-5 w-5" />,
  },
  {
    label: "Upcoming Meetings",
    href: "/upcoming",
    icon: <CalendarClock className="h-5 w-5" />,
  },
  {
    label: "Personal Room",
    href: "/personal-room",
    icon: <Video className="h-5 w-5" />,
  },
  {
    label: "Search",
    href: "/search",
    icon: <Search className="h-5 w-5" />,
  },
  {
    label: "Prep",
    href: "/prep",
    icon: <ListChecks className="h-5 w-5" />,
  },
  {
    label: "Settings",
    href: "/settings",
    icon: <Settings className="h-5 w-5" />,
    dividerBefore: true,
  },
];

export const instantMeetingModelImages = [
  "/icons/images/IM-1.png",
  "/icons/images/IM-2.png",
  "/icons/images/IM-3.png",
  "/icons/images/IM-4.png",
];

export const placeholders = [
  "Paste",
  "The",
  "Meeting",
  "Link",
  "Here",
  "And join the meeting",
];

export const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  console.log(e.target.value);
};

export const words = ["Microphone", "and", "Camera"];

export type audioType = "voice calls" | "podcasts" | "music calls";

export type sideTitleTypes =
  | "recsSideTitle"
  | "presSideTitle"
  | "upcgSideTitle";
