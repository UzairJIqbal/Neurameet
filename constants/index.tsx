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

type MeetingCard = {
  title: string;
  description: string;
  LogoImg: string;
  type:
    | "isInstantMeeting"
    | "isScheduleMeeting"
    | "isJoinMeeting"
    | "isRecordedMeeting"
    | "isUploadTranscript";
};

export const meetingCardDetails: MeetingCard[] = [
  {
    title: "Instant Meeting",
    description: "Start an Instant Meeting",
    LogoImg: "/icons/instantMeeting.png",
    type: "isInstantMeeting",
  },
  {
    title: "Join Meeting",
    description: "Join Meeting via link",
    LogoImg: "/icons/join.png",
    type: "isJoinMeeting",
  },
  {
    title: "Get your recordings",
    description: "Click here to see your recordings",
    LogoImg: "/icons/rec.png",
    type: "isRecordedMeeting",
  },
  {
    title: "Schedule Meeting",
    description: "Schedule a meeting for the upcoming future",
    LogoImg: "/icons/sch.png",
    type: "isScheduleMeeting",
  },
  {
    title: "Upload Transcript",
    description: "Upload a transcript and get AI-powered insights",
    LogoImg: "/icons/previous_meeting.png",
    type: "isUploadTranscript",
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
