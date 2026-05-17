/* eslint-disable prettier/prettier */
/* eslint-disable @next/next/no-img-element */
/* eslint-disable prettier/prettier */
/* eslint-disable prettier/prettier */
import { useGetCall } from "@/hooks/useGetCall";
import React from "react";
import { CardBody, CardContainer, CardItem } from "@/components/ui/3d-card";
import { Call } from "@stream-io/video-react-sdk";
import { TypewriterEffectSmooth } from "@/components/ui/typewriter-effect";
import { onJoin } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { LoaderOne } from "./ui/loader";
import { LampContainer } from "./ui/lamp";
import { motion } from "motion/react";
import SideTitles from "./SideTitles";
const words = [
	{
		text: "No",
	},
	{
		text: "upcoming",
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

const UpcomingPage = () => {
	const router = useRouter();
	const getUpcomingPageMeetings = useGetCall();
	const getUpcomingMeetings = getUpcomingPageMeetings.upcomingCalls;
	const isLoading = getUpcomingPageMeetings.isLoading;

	// Show loader while data is loading
	if (isLoading || !getUpcomingMeetings) {
		return <LoaderOne />;
	}

	// Show "No meetings" message only when data is loaded and there are truly no upcoming meetings
	if (getUpcomingMeetings.length === 0) {
		return (
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
						<SideTitles type="upcgSideTitle" />
					</div>
					<div className="flex min-h-[16rem] w-full flex-col items-center justify-center px-2 text-center">
						<TypewriterEffectSmooth words={words} />
					</div>
				</LampContainer>
			</section>
		);
	}

	// Show upcoming meetings
	return (
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
					<SideTitles type="upcgSideTitle" />
				</div>
				<div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-4 px-1 sm:grid-cols-2 lg:grid-cols-3">
					{getUpcomingMeetings.map(
						(getUpcomingMeeting: Call, index: number) => (
							<CardContainer className="inter-var w-full overflow-hidden" key={index}>
								<CardBody className="relative h-full w-full overflow-hidden rounded-lg border border-black bg-dark-3 p-4 group/card dark:border-white dark:bg-black dark:hover:shadow-2xl dark:hover:shadow-emerald-500/[0.1] sm:p-6">
									<CardItem
										translateZ="50"
										className="break-words text-lg font-bold text-slate-100 dark:text-white sm:text-xl"
									>
										{(
											getUpcomingMeeting as Call
										).state.custom?.description?.substring(0, 30) ||
											"No title given"}
									</CardItem>
									<CardItem
										as="p"
										translateZ="60"
										className="text-slate-200 text-sm max-w-sm mt-2 dark:text-neutral-300"
									>
										{(
											getUpcomingMeeting as Call
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
									<div className="mt-6 flex flex-wrap items-center justify-end gap-2 sm:mt-10">
										<CardItem
											onClick={() =>
												router.push(
													`/meeting/${(getUpcomingMeeting as Call)?.id}`,
												)
											}
											translateZ={20}
											as="button"
											className="px-4 py-2 rounded-xl bg-black dark:bg-white dark:text-black text-white text-xs font-bold"
										>
											Start
										</CardItem>
										<CardItem
											onClick={() => onJoin(getUpcomingMeeting as Call)}
											translateZ={20}
											as="button"
											className="px-4 py-2 rounded-xl bg-black dark:bg-white dark:text-black text-white text-xs font-bold"
										>
											Copy Link
										</CardItem>
									</div>
								</CardBody>
							</CardContainer>
						),
					)}
				</div>
			</LampContainer>
		</section>
	);
};

export default UpcomingPage;
