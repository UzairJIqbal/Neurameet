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
			<div className="px-2 text-center text-xl font-bold text-white sm:text-2xl">
				<TypewriterEffectSmooth words={words} />
			</div>
		);
	}

	return (
		<>
			{getPreviousMeetings && getPreviousMeetings.length > 0 ? (
				<section className="flex min-h-screen w-full flex-col gap-5 overflow-x-hidden text-white">
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
						<div className="flex min-h-[180px] w-full flex-col items-center justify-center rounded-[20px] sm:min-h-[260px]">
							<SideTitles type="presSideTitle" />
						</div>
						<div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-4 px-1 sm:grid-cols-2 lg:grid-cols-3">
							{getPreviousMeetings.map(
								(getPreviousMeeting: Call, index: number) => (
									<CardContainer
										className="inter-var w-full overflow-hidden"
										key={index}
									>
										<CardBody className="relative h-full w-full overflow-hidden rounded-lg border border-black bg-dark-3 p-4 group/card dark:border-white dark:bg-black dark:hover:shadow-2xl dark:hover:shadow-emerald-500/[0.1] sm:p-6">
											<CardItem
												translateZ="50"
												className="break-words text-lg font-bold text-slate-100 dark:text-white sm:text-xl"
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
													className="h-44 w-full rounded-lg object-cover group-hover/card:shadow-xl sm:h-56"
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
				<div className="px-2 text-center text-xl font-bold text-white sm:text-2xl">
					<TypewriterEffectSmooth words={words} />
				</div>
			)}
		</>
	);
};
export default PreviousPage;
