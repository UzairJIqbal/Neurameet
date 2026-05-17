/* eslint-disable prettier/prettier */
/* eslint-disable @next/next/no-img-element */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useState } from "react";
import { CardBody, CardContainer, CardItem } from "@/components/ui/3d-card";
import { TypewriterEffectSmooth } from "@/components/ui/typewriter-effect";
import { LoaderOne } from "@/components/ui/loader";
import { LampContainer } from "@/components/ui/lamp";
import { motion } from "motion/react";
import SideTitles from "./SideTitles";
import toast from "react-hot-toast";

const RecordingPage = () => {
	const [recordings, setRecordings] = useState<any[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	const words = [
		{ text: "No" },
		{ text: "recordings" },
		{ text: "are" },
		{ text: "Available.", className: "text-blue-500 dark:text-blue-500" },
	];

	// ✅ Fetch recordings from server-side API (uses Node SDK with secret key)
	useEffect(() => {
		const fetchRecordings = async () => {
			try {
				setIsLoading(true);
				const res = await fetch("/api/recordings");

				if (!res.ok) {
					throw new Error(`API error: ${res.status}`);
				}

				const data = await res.json();

				setRecordings(data.recordings ?? []);
			} catch (err) {
				console.error("❌ Failed to load recordings:", err);
				toast.error("Failed to load recordings");
				setRecordings([]);
			} finally {
				setIsLoading(false);
			}
		};

		fetchRecordings();
	}, []);

	// PLAY
	const handlePlay = (recording: any) => {
		const url = recording?.url || recording?.file_url || recording?.video_url;

		if (!url) {
			toast.error("No playback URL found");
			return;
		}

		window.open(url, "_blank");
	};

	// LOADING
	if (isLoading) return <LoaderOne />;

	// EMPTY STATE
	if (!isLoading && recordings.length === 0) {
		return (
			<section className="flex min-h-screen w-full flex-col gap-5 overflow-x-hidden text-white">
				<LampContainer>
					<motion.h1 />

					<div className="flex min-h-[180px] w-full flex-col items-center justify-center rounded-[20px] sm:min-h-[260px]">
						<SideTitles type="recsSideTitle" />
					</div>

					<div className="flex min-h-[16rem] w-full flex-col items-center justify-center px-2 text-center">
						<TypewriterEffectSmooth words={words} />
					</div>
				</LampContainer>
			</section>
		);
	}

	// MAIN UI
	return (
		<section className="flex min-h-screen w-full flex-col gap-5 overflow-x-hidden text-white">
			<LampContainer>
				<motion.h1 />

				<div className="flex min-h-[180px] w-full flex-col items-center justify-center rounded-[20px] sm:min-h-[260px]">
					<SideTitles type="recsSideTitle" />
				</div>

				{/* GRID (same as UpcomingPage style) */}
				<div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-4 px-1 sm:grid-cols-2 lg:grid-cols-3">
					{recordings.map((recording: any) => (
						<CardContainer
							key={recording?.id || recording?.url}
							className="inter-var w-full overflow-hidden"
						>
							<CardBody className="relative h-full w-full overflow-hidden rounded-lg border border-black bg-dark-3 p-4 group/card dark:border-white dark:bg-black sm:p-6">
								<CardItem className="break-words text-lg font-bold text-slate-100 dark:text-white sm:text-xl">
									{recording?.filename?.substring(0, 30) || "No title"}
								</CardItem>

								<CardItem className="text-slate-200 text-sm mt-2 dark:text-neutral-300">
									{recording?.start_time
										? new Date(recording.start_time).toLocaleString()
										: "No date available"}
								</CardItem>

								<CardItem translateZ="100" className="w-full mt-4">
									<img
										src="/icons/recording.png"
									className="h-44 w-full rounded-lg object-cover sm:h-56"
										alt="thumbnail"
									/>
								</CardItem>

								{/* ACTIONS */}
								<div className="mt-6 flex items-center justify-end gap-2 sm:mt-10">
									<CardItem
										onClick={() => handlePlay(recording)}
										className="px-4 py-2 rounded-xl bg-black dark:bg-white dark:text-black text-white text-xs font-bold"
									>
										Play
									</CardItem>
								</div>
							</CardBody>
						</CardContainer>
					))}
				</div>
			</LampContainer>
		</section>
	);
};

export default RecordingPage;
