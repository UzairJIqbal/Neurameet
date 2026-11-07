/* eslint-disable prettier/prettier */

import type { ReactNode } from "react";
import {
  Bell,
  Bot,
  CheckSquare,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  Settings,
  Video,
  Brain,
} from "lucide-react";

/** Which `GET /api/my-counts` value a link shows, if any. */
export type SidebarCountKey = "openTasks" | "upcomingMeetings" | "unread";

export type SidebarLink = {
  label: string;
  href: string;
  icon: ReactNode;
  countKey?: SidebarCountKey;
  /** A filled pill, for the count that asks for attention. */
  countFilled?: boolean;
};

export const sidebarLinks: SidebarLink[] = [
  {
    label: "My Dashboard",
    href: "/dashboard",
    icon: <LayoutDashboard className="h-5 w-5" />,
  },
  {
    label: "My Tasks",
    href: "/my-tasks",
    icon: <CheckSquare className="h-5 w-5" />,
    countKey: "openTasks",
  },
  {
    label: "My Meetings",
    href: "/meeting-intelligence",
    icon: <Brain className="h-5 w-5" />,
    countKey: "upcomingMeetings",
  },
  {
    label: "My Projects",
    href: "/projects",
    icon: <FolderKanban className="h-5 w-5" />,
  },
  {
    label: "Notifications",
    href: "/notifications",
    icon: <Bell className="h-5 w-5" />,
    countKey: "unread",
    countFilled: true,
  },
  {
    label: "AI Assistant",
    href: "/ai-chat",
    icon: <Bot className="h-5 w-5" />,
  },
];

export const sidebarMoreLinks: SidebarLink[] = [
  {
    label: "Follow-ups",
    href: "/follow-ups",
    icon: <ListTodo className="h-5 w-5" />,
  },
  {
    label: "Personal Room",
    href: "/personal-room",
    icon: <Video className="h-5 w-5" />,
  },
];

export const sidebarSettingsLink: SidebarLink = {
  label: "Settings",
  href: "/settings",
  icon: <Settings className="h-5 w-5" />,
};

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
