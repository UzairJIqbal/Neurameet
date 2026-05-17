/* eslint-disable prettier/prettier */
"use client";

import React, { useState, useEffect, useId } from "react";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export interface ContainerTextFlipProps {
	/** Array of words to cycle through in the animation */
	words?: string[];
	/** Time in milliseconds between word transitions */
	interval?: number;
	/** Additional CSS classes to apply to the container */
	className?: string;
	/** Additional CSS classes to apply to the text */
	textClassName?: string;
	/** Duration of the transition animation in milliseconds */
	animationDuration?: number;
}

export function ContainerTextFlip({
	words = ["Welcome", "to", "Neuromeet"],
	interval = 3000,
	className,
	textClassName,
	animationDuration = 700,
}: ContainerTextFlipProps) {
	const id = useId();
	const [currentWordIndex, setCurrentWordIndex] = useState(0);
	const [width, setWidth] = useState(100);
	const textRef = React.useRef(null);

	const updateWidthForWord = () => {
		if (textRef.current) {
			// Add some padding to the text width (30px on each side)
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-ignore
			const textWidth = textRef.current.scrollWidth + 30;
			setWidth(textWidth);
		}
	};

	useEffect(() => {
		// Update width whenever the word changes
		updateWidthForWord();
	}, [currentWordIndex]);

	useEffect(() => {
		const intervalId = setInterval(() => {
			setCurrentWordIndex((prevIndex) => (prevIndex + 1) % words.length);
			// Width will be updated in the effect that depends on currentWordIndex
		}, interval);

		return () => clearInterval(intervalId);
	}, [words, interval]);

	return (
		<motion.div
			layout
			layoutId={`words-here-${id}`}
			animate={{ width }}
			transition={{ duration: animationDuration / 2000 }}
			className={cn(
				"relative inline-block rounded-lg pt-2 pb-3 text-center text-4xl font-bold text-slate-400 md:text-7xl dark:text-white",
				"[background:linear-gradient(to_bottom,bg-slate-200,bg-slate-700)]",
				"shadow-[inset_0_-1px_#4b5563,inset_0_0_0_1px_#374151,_0_4px_8px_#1f2937]",
				"dark:[background:linear-gradient(to_bottom,#374151,#1f2937)]",
				"dark:shadow-[inset_0_-1px_#10171e,inset_0_0_0_1px_hsla(205,89%,46%,.24),_0_4px_8px_#00000052]",
				className,
			)}
			key={words[currentWordIndex]}
		>
			<motion.div
				transition={{
					duration: animationDuration / 1000,
					ease: "easeInOut",
				}}
				className={cn("inline-block", textClassName)}
				ref={textRef}
				layoutId={`word-div-${words[currentWordIndex]}-${id}`}
			>
				<motion.div className="inline-block">
					{words[currentWordIndex].split("").map((letter, index) => (
						<motion.span
							key={index}
							initial={{
								opacity: 0,
								filter: "blur(10px)",
							}}
							animate={{
								opacity: 1,
								filter: "blur(0px)",
							}}
							transition={{
								delay: index * 0.02,
							}}
						>
							{letter}
						</motion.span>
					))}
				</motion.div>
			</motion.div>
		</motion.div>
	);
}
