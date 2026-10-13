/* eslint-disable prettier/prettier */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useGetCall } from "@/hooks/useGetCall";
import { Call } from "@stream-io/video-react-sdk";
import { Calendar } from "lucide-react";
import { LoaderOne } from "./ui/loader";

const PreviousPage = () => {
	const router = useRouter();
	const { previousCalls, isLoading } = useGetCall();

	if (isLoading) return <LoaderOne />;

	return (
		<section className="flex w-full flex-col gap-6 px-6 py-8">
			<header className="flex flex-col gap-1">
				<h1 className="text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg">
					Previous Meetings
				</h1>
				<p className="text-body-md text-on-surface-variant">
					{previousCalls.length} past meeting
					{previousCalls.length === 1 ? "" : "s"}
				</p>
			</header>

			{previousCalls.length === 0 ? (
				<div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-surface-variant bg-surface-container-lowest px-6 py-16 text-center">
					<Calendar className="h-10 w-10 text-on-surface-variant" />
					<p className="text-body-lg text-on-surface-variant">
						No previous meetings yet.
					</p>
				</div>
			) : (
				<div className="overflow-hidden rounded-xl border border-surface-variant bg-surface-container-lowest shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
					<div className="grid grid-cols-12 gap-4 border-b border-surface-variant bg-surface-container-low/50 px-6 py-4 text-label-caps uppercase tracking-wider text-on-surface-variant">
						<div className="col-span-6 md:col-span-5">Meeting Title</div>
						<div className="col-span-6 md:col-span-4">Date</div>
						<div className="col-span-12 hidden text-right md:col-span-3 md:block">
							Action
						</div>
					</div>
					<div className="divide-y divide-surface-variant">
						{previousCalls.map((call: Call, index: number) => (
							<div
								key={index}
								className="grid grid-cols-12 items-center gap-4 px-6 py-4 transition-colors hover:bg-surface-container-low"
							>
								<div className="col-span-6 flex items-center gap-3 md:col-span-5">
									<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-container text-primary">
										<Calendar className="h-4 w-4" />
									</div>
									<span className="break-words font-body-md font-medium text-on-surface">
										{call.state.custom?.description?.substring(0, 40) ||
											"Untitled meeting"}
									</span>
								</div>
								<div className="col-span-6 text-body-md text-on-surface-variant md:col-span-4">
									{call.state.startsAt
										? new Date(call.state.startsAt).toLocaleString()
										: "Date unavailable"}
								</div>
								<div className="col-span-12 mt-2 md:col-span-3 md:mt-0 md:text-right">
									<button
										onClick={() => router.push(`/meeting/${call.id}`)}
										className="inline-flex items-center gap-2 rounded-lg border border-surface-variant px-4 py-2 text-sm font-medium text-primary transition-colors hover:border-primary hover:bg-primary/5"
									>
										Open
									</button>
								</div>
							</div>
						))}
					</div>
				</div>
			)}
		</section>
	);
};

export default PreviousPage;
