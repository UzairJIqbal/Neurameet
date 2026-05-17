/* eslint-disable prettier/prettier */
import React from "react";
import { TypewriterEffectSmooth } from "@/components/ui/typewriter-effect";
import { sideTitleTypes } from "../../constants";

const recTitle = [
    {
        text: "See",
    },
    {
        text: "your",
    },
    {
        text: "recordings",
    },
    {
        text: "here",
    },
    {
        text: "Anytime.",
        className: "text-blue-500 dark:text-blue-500",
    },
];


const upcgTitle = [
    {
        text: "See",
    },
    {
        text: "your",
    },
    {
        text: "upcoming",
    },
    {
        text: "meeting",
    },
    {
        text: "Below.",
        className: "text-blue-500 dark:text-blue-500",
    },
];

const presTitle = [
    {
        text: "See",
    },
    {
        text: "your",
    },
    {
        text: "previous",
    },
    {
        text: "meeting",
    },
    {
        text: "Instantly.",
        className: "text-blue-500 dark:text-blue-500",
    },
];


const SideTitles = ({ type }: { type: sideTitleTypes }) => {

    return <div className="flex min-h-[12rem] w-full flex-col items-center justify-center px-2 text-center sm:min-h-[18rem] lg:min-h-[28rem]">
        <TypewriterEffectSmooth words={
            type === 'presSideTitle' ? presTitle
                : type === 'recsSideTitle' ? recTitle
                    : upcgTitle
        } />
    </div>

};

export default SideTitles;
