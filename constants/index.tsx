/* eslint-disable prettier/prettier */

/* eslint-disable prettier/prettier */

/* eslint-disable prettier/prettier */

import Image from "next/image";

export const sidebarLinks = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: (
      <Image
        src="/icons/sidebar/Home.png"
        alt="Dashboard"
        height={20}
        width={20}
        className="invert brightness-0"
      />
    ),
  },
  {
    label: "Previous Meetings",
    href: "/previous",
    icon: (
      <Image
        src="/icons/sidebar/Previous.png"
        alt="Previous Meetings"
        height={20}
        width={20}
        className="invert brightness-0"
      />
    ),
  },
  {
    label: "Upcoming Meetings",
    href: "/upcoming",
    icon: (
      <Image
        src="/icons/sidebar/Upcoming.png"
        alt="Upcoming Meetings"
        height={20}
        width={20}
        className="invert brightness-0"
      />
    ),
  },
  {
    label: "Meeting Intelligence",
    href: "/meeting-intelligence",
    icon: (
      <Image
        src="/icons/sidebar/Upcoming.png"
        alt="Meeting Intelligence"
        height={10}
        width={20}
        className="invert brightness-0"
      />
    ),
  },
  {
    label: "AI Chat",
    href: "/ai-chat",
    icon: (
      <Image
        src="/icons/sidebar/Previous.png"
        alt="AI Chat"
        height={20}
        width={20}
        className="invert brightness-0"
      />
    ),
  },
  {
    label: "Recordings",
    href: "/recording",
    icon: (
      <Image
        src="/icons/sidebar/Recordings.png"
        alt="Recordings"
        height={20}
        width={20}
        className="invert brightness-0"
      />
    ),
  },
  {
    label: "Personal Room",
    href: "/personal-room",
    icon: (
      <Image
        src="/icons/sidebar/Personal.png"
        alt="Personal Room"
        height={20}
        width={20}
        className="invert brightness-0"
      />
    ),
  },
  {
    label: "Follow-ups",
    href: "/follow-ups",
    icon: (
      <Image
        src="/icons/sidebar/Personal.png"
        alt="Follow-ups"
        height={20}
        width={20}
        className="invert brightness-0"
      />
    ),
  },
  {
    label: "Settings",
    href: "/settings",
    icon: (
      <Image
        src="/icons/sidebar/Personal.png"
        alt="Settings"
        height={20}
        width={20}
        className="invert brightness-0"
      />
    ),
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
