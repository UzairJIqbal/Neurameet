/* eslint-disable prettier/prettier */
"use client";

import useGetCallbyId from "@/hooks/useGetCallbyId";
import { useUser } from "@clerk/nextjs";
import { useStreamVideoClient } from "@stream-io/video-react-sdk";
import { useRouter } from "next/navigation";
import React from "react";
import { Button } from "./ui/stateful-button";
import toast from "react-hot-toast";

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

	const { call } = useGetCallbyId(meetingId as string);

	const createMeeting = async () => {
		if (!call) {
			const newCall = client?.call("default", meetingId as string);
			await newCall?.getOrCreate({
				data: {
					starts_at: new Date().toISOString(),
					members: [{ user_id: user?.id as string }],
					custom: {
						description: `${topicName}'s Meeting Room`,
						owner_id: user?.id as string,
					},
				},
			});
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
				<Button
					className="w-full rounded-lg sm:w-auto"
					onClick={createMeeting}
				>
					Start Meeting
				</Button>
				<Button
					className="w-full rounded-lg border border-surface-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-low sm:w-auto"
					onClick={() => {
						navigator.clipboard.writeText(inviteLink);
						toast("Link Copied");
					}}
				>
					Copy Invitation
				</Button>
			</div>
		</section>
	);
};

export default PersonalRoomPage;
