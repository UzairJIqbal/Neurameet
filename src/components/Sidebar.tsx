/* eslint-disable prettier/prettier */

/* eslint-disable prettier/prettier */

/* eslint-disable prettier/prettier */
"use client";
import React, { useState } from "react";
import { Sidebar, SidebarBody, SidebarLink } from "@/components/ui/sidebar";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { sidebarLinks } from "../../constants";
import MeetingTypeLists from "@/components/MeetingTypeLists";
import { LampContainer } from "@/components/ui/lamp";
import PreviousPage from "./PreviousPage";
import RecordingPage from "./RecordingPage";
import UpcomingPage from "./UpcomingPage";
import PersonalRoomPage from "./PersonalRoomPage";
import { useGetCall } from "@/hooks/useGetCall";
import { Call } from "@stream-io/video-react-sdk";

export type SidebarPagesTypes =
	| "Home"
	| "upcomingPage"
	| "previousPage"
	| "recordingsPage"
	| "personalRoom";

export const Sidebar_Com = ({ type }: { type: SidebarPagesTypes }) => {
	const [open, setOpen] = useState(false);
	return (
		<div
			className={cn(
				"mx-auto flex w-full max-w-full flex-1 flex-col overflow-hidden rounded-md border-none bg-dark-2 md:flex-row dark:border-neutral-700 dark:bg-neutral-800",
				"min-h-screen scroll mt-0 left-0",
			)}
		>
			<Sidebar open={open} setOpen={setOpen}>
				<SidebarBody className="justify-between gap-52">
					<div className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto">
						{open ? <Logo /> : <LogoIcon />}
						<div className="mt-8 flex flex-col gap-24">
							{sidebarLinks.map((link, idx) => (
								<SidebarLink key={idx} link={link} />
							))}
						</div>
					</div>
					<div className="mt-8 flex flex-col ">
						<SidebarLink
							link={{
								label: "Uzair Javaid",
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
					</div>
				</SidebarBody>
			</Sidebar>
			{type === "Home" && <HomePage />}
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
			className="relative z-20 flex items-center space-x-2 py-1 text-sm font-normal text-white"
		>
			<div className="h-5 w-6 shrink-0 rounded-tl-lg rounded-tr-sm rounded-br-lg rounded-bl-sm bg-dark-2 dark:bg-white" />
			<motion.span
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				className="font-medium whitespace-pre text-white dark:text-black"
			>
				Neuro_Meet
			</motion.span>
		</a>
	);
};
export const LogoIcon = () => {
	return (
		<a
			href="#"
			className="relative z-20 flex items-center space-x-2 py-1 text-sm font-normal text-white"
		>
			<div className="h-5 w-6 shrink-0 rounded-tl-lg rounded-tr-sm rounded-br-lg rounded-bl-sm bg-white dark:bg-white" />
		</a>
	);
};

const HomePage = () => {
	const getUpcomingPageMeetings = useGetCall();
	const getUpcomingMeetings = getUpcomingPageMeetings.upcomingCalls;
	const now = new Date();
	const time = now.toLocaleTimeString("en-US", {
		hour: "2-digit",
		minute: "2-digit",
	});
	const date = now.toLocaleDateString("en-US", {
		dateStyle: "full",
	});
	return (
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
				>
					<div className="h-[303px] w-full rounded-[20px] bg-cover">
						<div className="flex h-full flex-col justify-between max-md:px-5 max-md:py-8 lg:p-11">
							<h2 className="glassmorphism max-w-[273px] rounded py-2 text-center text-base font-normal sm:text-2xl mb-7 text-white">
								Upcoming Meeting at:{" "}
								{getUpcomingMeetings.map((meeting: Call, index: number) => (
									<span key={index} className="sm:text-sm">
										{meeting.state.startsAt?.toLocaleString() ||
											"Date went missing—try again!"}
									</span>
								))}
							</h2>

							<div className="flex flex-col gap-2">
								<h1 className="text-4xl font-extrabold lg:text-7xl">{time}</h1>
								<p className="text-lg font-medium text-sky-1 lg:text-2xl">
									{date}
								</p>
							</div>
						</div>
					</div>
				</motion.h1>
				<div className="relative flex h-[25rem] w-full items-center justify-center bg-dark-2 dark:bg-white mt-20">
					<div
						className={cn(
							"absolute inset-0",
							"[background-size:40px_40px]",
							"[background-image:linear-gradient(to_right,#e4e4e7_1px,transparent_1px),linear-gradient(to_bottom,#e4e4e7_1px,transparent_1px)]",
							"dark:[background-image:linear-gradient(to_right,#262626_1px,transparent_1px),linear-gradient(to_bottom,#262626_1px,transparent_1px)]",
						)}
					/>
					<div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-dark-2 [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)] dark:bg-black"></div>
					<div className="relative z-0 bg-dark-2 bg-clip-text py-8 text-4xl font-bold text-transparent sm:text-sm sm:mt-2 sm:overflow-y-auto sm:h-full md:overflow-y-auto md:overflow-hidden lg:h-auto lg:mt-[-100px]">
						<MeetingTypeLists />
					</div>
				</div>
			</LampContainer>
		</section>
	);
};

export default Sidebar_Com;
