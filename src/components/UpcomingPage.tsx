/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useGetCall } from "@/hooks/useGetCall";
import { Call } from "@stream-io/video-react-sdk";
import { Calendar, Copy, PlayCircle } from "lucide-react";
import { LoaderOne } from "./ui/loader";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { LoadError } from "@/components/ui/load-error";
import { ConfirmDelete } from "@/components/ui/confirm-delete";
import { onJoin } from "@/lib/utils";
import toast from "react-hot-toast";

const formatCountdown = (ms: number): string => {
	const totalMin = Math.max(0, Math.floor(ms / 60000));
	const h = Math.floor(totalMin / 60);
	const m = totalMin % 60;
	if (h > 0) return `Starts in ${h}h ${m}m`;
	if (m > 0) return `Starts in ${m}m`;
	return "Starting soon";
};

const UpcomingPage = () => {
	const router = useRouter();
	const { user } = useUser();
	const [retryNonce, setRetryNonce] = useState(0);
	const [now, setNow] = useState(() => Date.now());
	const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
	const { upcomingCalls, isLoading, error } = useGetCall(retryNonce);
	const { timedOut } = useLoadingTimeout(isLoading, {
		timeoutMs: 12000,
		retryNonce,
	});

	// Re-evaluate "has this meeting started?" every 30s so the Start button
	// enables itself at the scheduled time without a manual refresh.
	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), 30000);
		return () => clearInterval(id);
	}, []);

	useEffect(() => {
		if (error) toast.error(error);
	}, [error]);

	const handleDeleteCall = async (callId: string) => {
		try {
			const res = await fetch(`/api/meetings/by-call/${callId}`, {
				method: "DELETE",
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.error ?? `Delete failed: ${res.status}`);
			}
			setDeletedIds((prev) => new Set(prev).add(callId));
			toast.success("Meeting cancelled");
		} catch (err) {
			const msg =
				err instanceof Error ? err.message : "Failed to cancel meeting";
			toast.error(msg);
		}
	};

	if (timedOut) {
		return (
			<LoadError
				message="We couldn't load your meetings."
				onRetry={() => setRetryNonce((k) => k + 1)}
			/>
		);
	}

	if (isLoading) return <LoaderOne />;

	const calls = upcomingCalls.filter((c) => !deletedIds.has(c.id));

	return (
		<section className="flex min-h-0 w-full flex-1 flex-col gap-6 overflow-y-auto px-6 py-8">
			<header className="flex flex-col gap-1">
				<h1 className="text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg">
					Upcoming Meetings
				</h1>
				<p className="text-body-md text-on-surface-variant">
					{calls.length} scheduled meeting{calls.length === 1 ? "" : "s"}
				</p>
			</header>

			{calls.length === 0 ? (
				<div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-surface-variant bg-surface-container-lowest px-6 py-16 text-center">
					<Calendar className="h-10 w-10 text-on-surface-variant" />
					<p className="text-body-lg text-on-surface-variant">
						No upcoming meetings.
					</p>
				</div>
			) : (
				<div className="shrink-0 overflow-hidden rounded-xl border border-surface-variant bg-surface-container-lowest shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
					<div className="grid grid-cols-12 gap-4 border-b border-surface-variant bg-surface-container-low/50 px-6 py-4 text-label-caps uppercase tracking-wider text-on-surface-variant">
						<div className="col-span-6 md:col-span-5">Meeting Title</div>
						<div className="col-span-6 md:col-span-3">Date</div>
						<div className="col-span-12 hidden text-right md:col-span-4 md:block">
							Action
						</div>
					</div>
					<div className="divide-y divide-surface-variant">
						{calls.map((call: Call) => {
							const startsAt = call.state.startsAt
								? new Date(call.state.startsAt).getTime()
								: null;
							const isStarted = startsAt !== null && startsAt <= now;
							const rawCreatedBy = call.state.createdBy as unknown as
								| string
								| { id?: string }
								| undefined;
							const createdById =
								typeof rawCreatedBy === "string"
									? rawCreatedBy
									: rawCreatedBy?.id;
							const isOwner = !!createdById && createdById === user?.id;
							return (
								<div
									key={call.id}
									className="grid grid-cols-12 items-center gap-4 px-6 py-4 transition-colors hover:bg-surface-container-low"
								>
									<div className="col-span-6 flex items-center gap-3 md:col-span-5">
										<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-container text-primary">
											<Calendar className="h-4 w-4" />
										</div>
										<span className="break-words font-body-md font-medium text-on-surface">
											{call.state.custom?.title?.substring(0, 40) ||
												call.state.custom?.description?.substring(0, 40) ||
												"Untitled meeting"}
										</span>
									</div>
									<div className="col-span-6 text-body-md text-on-surface-variant md:col-span-3">
										{call.state.startsAt
											? new Date(call.state.startsAt).toLocaleString()
											: "Date unavailable"}
									</div>
									<div className="col-span-12 mt-2 flex flex-wrap justify-end gap-2 md:col-span-4 md:mt-0 md:flex-nowrap">
										<button
											onClick={() => router.push(`/meeting/${call.id}`)}
											disabled={!isStarted}
											title={
												isStarted
													? "Start the meeting"
													: "Available at the scheduled start time"
											}
											className={
												isStarted
													? "inline-flex items-center gap-2 rounded-lg bg-primary-container px-4 py-2 text-body-md font-body-md font-semibold text-on-primary transition-colors hover:bg-primary"
													: "inline-flex cursor-not-allowed items-center gap-2 rounded-lg bg-surface-container px-4 py-2 text-body-md font-body-md font-semibold text-on-surface-variant opacity-60"
											}
										>
											<PlayCircle className="h-4 w-4" />
											{isStarted ? "Start" : formatCountdown(startsAt! - now)}
										</button>
										<button
											onClick={() => onJoin(call)}
											className="inline-flex items-center gap-2 rounded-lg border border-surface-variant px-4 py-2 text-sm font-medium text-primary transition-colors hover:border-primary hover:bg-primary/5"
										>
											<Copy className="h-4 w-4" />
											Copy Link
										</button>
																				<ConfirmDelete
											label={
												isOwner
													? "Cancel meeting"
													: "Only the host can cancel this meeting"
											}
											confirmLabel="Cancel"
											disabled={!isOwner}
											onConfirm={() => handleDeleteCall(call.id)}
										/>
									</div>
								</div>
							);
						})}
					</div>
				</div>
			)}
		</section>
	);
};

export default UpcomingPage;
