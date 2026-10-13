/* eslint-disable prettier/prettier */
"use client";

import useGetCallbyId from "@/hooks/useGetCallbyId";
import { useUser } from "@clerk/nextjs";
import { useStreamVideoClient } from "@stream-io/video-react-sdk";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import toast from "react-hot-toast";
import type { GuestAdmissionMode } from "@/lib/meeting-types";
import { createScheduledMeetingRow } from "@/actions/meetings";

const Table = ({
	title,
	description,
}: {
	title: string;
	description: string;
}) => {
	return (
		<div className="rounded-xl border border-surface-variant bg-surface-container-lowest p-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
			<h2 className="text-label-caps uppercase text-on-surface-variant">{title}</h2>
			<p className="mt-2 break-all text-body-lg text-on-surface">{description}</p>
		</div>
	);
};

const PersonalRoomPage = () => {
	const { user } = useUser();
	const client = useStreamVideoClient();
	const router = useRouter();
	const topicName = user?.username;
	const meetingId = user?.id;
	const inviteLink = `${process.env.NEXT_PUBLIC_BASE_URL}/meeting/${meetingId}`;
	const [guestAdmissionMode, setGuestAdmissionMode] =
		useState<GuestAdmissionMode>("approval");

	const { call } = useGetCallbyId(meetingId as string);

	const createMeeting = async () => {
		// The personal room reuses a stable call id (user.id). getOrCreate only
		// applies settings_override at creation time, so an existing call keeps
		// whatever settings it was first created with. If that predates the
		// frame_recording setting, startFrameRecording fails with a console
		// error (the exact bug seen on calls created before the setting existed).
		// Re-apply the recording settings on every entry (best-effort) so a
		// reused stable id can never stay stale.
		const targetCall = call ?? client?.call("default", meetingId as string);
		if (!targetCall) return;
		// Disable devices before creation: getOrCreate runs the SDK device
		// setup which auto-enables the camera (call settings default
		// `camera_default_on`) and logs a red "[devices]: Failed to get
		// video stream" when no camera is available.
		await targetCall.camera.disable().catch(() => {});
		await targetCall.microphone.disable().catch(() => {});
		await targetCall.getOrCreate({
			data: {
				starts_at: new Date().toISOString(),
				members: [{ user_id: user?.id as string, role: "admin" }],
				custom: {
					description: `${topicName}'s Meeting Room`,
					owner_id: user?.id as string,
				},
				settings_override: {
					frame_recording: { mode: "available", quality: "720p", capture_interval_in_seconds: 2 },
					individual_recording: { mode: "available" },
				},
			},
		});
		await targetCall
			.update({
				settings_override: {
					frame_recording: { mode: "available", quality: "720p", capture_interval_in_seconds: 2 },
					individual_recording: { mode: "available" },
				},
			})
			.catch((err) => console.warn("PersonalRoom: could not apply recording settings:", err));
		// Persist the meetings row with the owner's chosen admission mode
		// so the meeting shows in Meeting Intelligence immediately.
		try {
			await createScheduledMeetingRow({
				streamCallId: meetingId as string,
				title: `${topicName}'s Meeting Room`,
				startsAt: new Date().toISOString(),
				guestAdmissionMode,
			});
		} catch (dbErr) {
			console.error("PersonalRoom: meeting row not persisted:", dbErr);
		}
		router.push(`/meeting/${meetingId}`);
	};

	return (
		<section className="flex w-full flex-col gap-6 px-6 py-8">
			<header className="flex flex-col gap-1">
				<h1 className="text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg">
					Personal Meeting Room
				</h1>
				<p className="text-body-md text-on-surface-variant">
					Your always-on room link
				</p>
			</header>

			<div className="flex w-full flex-col gap-4 xl:max-w-[900px]">
				<Table title="Topic" description={`${topicName}'s Meeting Room`} />
				<Table title="Meeting ID" description={(meetingId as string) ?? ""} />
				<Table title="Invite Link" description={inviteLink} />
			</div>

			<div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
				<button
					type="button"
					className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary-container px-4 py-2 font-medium text-on-primary transition duration-200 hover:bg-primary sm:w-auto"
					onClick={createMeeting}
				>
					Start Meeting
				</button>
				<button
					type="button"
					className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-surface-variant bg-surface-container-lowest px-4 py-2 font-medium text-on-surface transition duration-200 hover:bg-surface-container-low sm:w-auto"
					onClick={() => {
						navigator.clipboard.writeText(inviteLink);
						toast("Link Copied");
					}}
				>
					Copy Invitation
				</button>
			</div>
		</section>
	);
};

export default PersonalRoomPage;
