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
				// Debug: log full payload so we can see what the client actually received
				console.log("DEBUG /api/recordings response:", data);
				console.log(
					"✅ Recordings loaded:",
					Array.isArray(data.recordings) ? data.recordings.length : 0,
				);

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
			<section className="flex size-full flex-col gap-5 text-white">
				<LampContainer>
					<motion.h1 />

					<div className="flex flex-col items-center justify-center h-[303px] w-full rounded-[20px]">
						<SideTitles type="recsSideTitle" />
					</div>

					<div className="flex flex-col items-center justify-center w-full h-96">
						<TypewriterEffectSmooth words={words} />
					</div>
				</LampContainer>
			</section>
		);
	}

	// MAIN UI
	return (
		<section className="flex size-full flex-col gap-5 text-white">
			<LampContainer>
				<motion.h1 />

				<div className="flex flex-col items-center justify-center h-[303px] w-full rounded-[20px]">
					<SideTitles type="recsSideTitle" />
				</div>

				{/* GRID (same as UpcomingPage style) */}
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-4 max-w-7xl mx-auto w-full">
					{recordings.map((recording: any) => (
						<CardContainer
							key={recording?.id || recording?.url}
							className="inter-var overflow-hidden"
						>
							<CardBody className="bg-dark-3 relative group/card dark:bg-black dark:border-white border-black w-auto sm:w-[30rem] h-auto rounded-xl p-6 border overflow-hidden">
								<CardItem className="text-xl font-bold text-slate-100 dark:text-white">
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
										className="h-60 w-full object-cover rounded-3xl"
										alt="thumbnail"
									/>
								</CardItem>

								{/* ACTIONS */}
								<div className="flex justify-end items-center mt-20 gap-2">
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
