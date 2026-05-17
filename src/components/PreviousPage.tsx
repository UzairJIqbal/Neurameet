/* eslint-disable prettier/prettier */

/* eslint-disable prettier/prettier */
/* eslint-disable @next/next/no-img-element */
/* eslint-disable prettier/prettier */
/* eslint-disable prettier/prettier */
/* eslint-disable prettier/prettier */
/* eslint-disable prettier/prettier */
/* eslint-disable prettier/prettier */
/* eslint-disable prettier/prettier */
/* eslint-disable prettier/prettier */
/* eslint-disable prettier/prettier */

import React from "react";
import { useGetCall } from "@/hooks/useGetCall";
import { CardBody, CardContainer, CardItem } from "@/components/ui/3d-card";
import { Call } from "@stream-io/video-react-sdk";
import { TypewriterEffectSmooth } from "@/components/ui/typewriter-effect";
import { LampContainer } from "./ui/lamp";
import { motion } from "motion/react";
import SideTitles from "./SideTitles";

const words = [
	{
		text: "No",
	},
	{
		text: "previous",
	},
	{
		text: "meetings",
	},
	{
		text: "are",
	},
	{
		text: "Available.",
		className: "text-blue-500 dark:text-blue-500",
	},
];

const PreviousPage = () => {
	const getPreveiousPageMeetings = useGetCall();
	const getPreviousMeetings = getPreveiousPageMeetings.previousCalls;

	if (getPreviousMeetings.length === 0) {
		return (
			<div className="text-2xl font-bold text-white">
				<TypewriterEffectSmooth words={words} />
			</div>
		);
	}

	return (
		<>
			{getPreviousMeetings && getPreviousMeetings.length > 0 ? (
				<section className="flex size-full flex-col gap-5 text-white">
					<LampContainer>
						<motion.h1
							initial={{ opacity: 0.5, y: 100 }}
							whileInView={{ opacity: 1, y: 0 }}
							transition={{
								delay: 0.3,
								duration: 0.8,
								ease: "easeInOut",
							}}
						></motion.h1>
						<div className="flex flex-col items-center justify-center h-[303px] w-full rounded-[20px]">
							<SideTitles type="presSideTitle" />
						</div>
						<div className="grid grid-cols-1 lg:grid-cols-3 gap-4 max-w-7xl mx-auto w-full">
							{getPreviousMeetings.map(
								(getPreviousMeeting: Call, index: number) => (
									<CardContainer
										className="inter-var overflow-hidden"
										key={index}
									>
										<CardBody className="bg-dark-3 relative group/card  dark:hover:shadow-2xl dark:hover:shadow-emerald-500/[0.1] dark:bg-black dark:border-white border-black w-auto sm:w-[30rem] h-auto rounded-xl p-6 border overflow-hidden">
											<CardItem
												translateZ="50"
												className="text-xl font-bold text-slate-100 dark:text-white"
											>
												{(
													getPreviousMeeting as Call
												).state.custom?.description?.substring(0, 30) ||
													"No title given"}
											</CardItem>
											<CardItem
												as="p"
												translateZ="60"
												className="text-slate-200 text-sm max-w-sm mt-2 dark:text-neutral-300"
											>
												{(
													getPreviousMeeting as Call
												).state.startsAt?.toLocaleString() ||
													"Date went missing—try again!"}
											</CardItem>
											<CardItem translateZ="100" className="w-full mt-4">
												<img
													src="/icons/previous_meeting.png"
													height="800"
													width=""
													className="h-60 w-full object-cover rounded-3xl group-hover/card:shadow-xl"
													alt="thumbnail"
												/>
											</CardItem>
										</CardBody>
									</CardContainer>
								),
							)}
						</div>
					</LampContainer>
				</section>
			) : (
				<div className="text-2xl font-bold text-white">
					<TypewriterEffectSmooth words={words} />
				</div>
			)}
		</>
	);
};
export default PreviousPage;
