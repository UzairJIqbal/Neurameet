/* eslint-disable prettier/prettier */

/* eslint-disable prettier/prettier */

/* eslint-disable prettier/prettier */

import Image from "next/image";



export const sidebarLinks = [
    {
        label: "Home",
        href: "/",
        icon: (
            <Image
                src="/icons/sidebar/Home.png"
                alt="Home"
                height={20}
                width={20}
                className="invert brightness-0"
            />

        ),
    },
    {
        label: "Upcoming",
        href: "/upcoming",
        icon: (
            <Image
                src='/icons/sidebar/Upcoming.png'
                alt="SidebarImg"
                height={10}
                width={20}
                className="invert brightness-0"
            />
        ),
    },
    {
        label: "recordings",
        href: "/recording",
        icon: (
            <Image
                src='/icons/sidebar/Recordings.png'
                alt="SidebarImg"
                height={20}
                width={20}
                className="invert brightness-0"
            />
        ),

    },
    {
        label: "Previous",
        href: "/previous",
        icon: (
            <Image
                src='/icons/sidebar/Previous.png'
                alt="SidebarImg"
                height={20}
                width={20}
                className="invert brightness-0"
            />
        ),

    },
    {
        label: "Personal-Room",
        href: "/personal-room",
        icon: (
            <Image
                src='/icons/sidebar/Personal.png'
                alt="SidebarImg"
                height={20}
                width={20}
                className="invert brightness-0"
            />),

    },
];

type MeetingCard = {
    title: string;
    description: string;
    LogoImg: string;
    type: 'isInstantMeeting' | 'isScheduleMeeting' | 'isJoinMeeting' | 'isRecordedMeeting'
};

export const meetingCardDetails: MeetingCard[] = [
    {
        title: "Instant Meeting",
        description: "Start an Instant Meeting",
        LogoImg: "/icons/instantMeeting.png",
        type: "isInstantMeeting"
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
];

export const instantMeetingModelImages = [
    '/icons/images/IM-1.png',
    '/icons/images/IM-2.png',
    '/icons/images/IM-3.png',
    '/icons/images/IM-4.png'
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

export type audioType = 'voice calls' | 'podcasts' | 'music calls';

export type sideTitleTypes = 'recsSideTitle' | 'presSideTitle' | 'upcgSideTitle'