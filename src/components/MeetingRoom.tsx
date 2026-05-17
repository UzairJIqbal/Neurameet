/* eslint-disable prettier/prettier */

/* eslint-disable prettier/prettier */

import { cn } from "@/lib/utils";
import {
	PaginatedGridLayout,
	SpeakerLayout,
	useCallStateHooks,
	CallingState,
	CallParticipantsList,
	CallControls,
	CallStatsButton,
} from "@stream-io/video-react-sdk";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import EndCallButton from "@/components/EndCallButton";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { LoaderOne } from "./ui/loader";
import { LayoutList, Users } from "lucide-react";
import { Button } from "./ui/stateful-button";
import { useRouter } from "next/navigation";

type callTypesLayout = "grid" | "speaker-left" | "speaker-right";
const MeetingRoom = () => {
	const [layout, setLayout] = useState<callTypesLayout>("speaker-right");
	const [showParticipants, setShowParticipants] = useState(false);
	const { useCallCallingState } = useCallStateHooks();
	const searchParams = useSearchParams();
	const isPersonalRoom = !!searchParams.get("personal");
	const callingState = useCallCallingState();
	const router = useRouter();
	const OnLeave = () => {
		router.push("/");
	};

	if (callingState !== CallingState.JOINED) return <LoaderOne />;

	const CallLayout = () => {
		switch (layout) {
			case "grid":
				return <PaginatedGridLayout />;

			case "speaker-left":
				return <SpeakerLayout participantsBarPosition="left" />;

			default:
				return <SpeakerLayout participantsBarPosition="right" />;
		}
	};

	return (
		<section className="min-h-screen w-full overflow-hidden pb-28 text-white sm:pb-24">
			<div className="relative mt-2 flex min-h-[calc(100vh-170px)] w-full items-center justify-center px-2 sm:px-4">
				<div className="flex h-[calc(100vh-190px)] w-full max-w-[1000px] items-center sm:h-[calc(100vh-170px)]">
					<CallLayout />
				</div>
				<div
					className={cn("fixed inset-y-20 right-2 z-40 hidden w-[calc(100vw-1rem)] max-w-[350px] sm:static sm:ml-2 sm:h-[calc(100vh-86px)]", {
						"show-block": showParticipants,
					})}
				>
					<CallParticipantsList onClose={() => setShowParticipants(false)} />
				</div>
			</div>

			<div className="fixed inset-x-0 bottom-0 z-50 flex w-full flex-wrap items-center justify-center gap-2 bg-dark-1/95 px-2 py-3 backdrop-blur sm:gap-4">
				<CallControls onLeave={OnLeave} />
				<DropdownMenu>
					<DropdownMenuTrigger className="cursor-pointer rounded-2xl bg-[#19232d] px-4 py-2 hover:bg-[#4c535b]  ">
						<LayoutList size={20} className="text-white" />
					</DropdownMenuTrigger>
					<DropdownMenuContent className="border-dark-1 bg-dark-1 text-white">
						{["grid", "speaker-left", "speaker-right"].map((item, index) => {
							return (
								<div key={index}>
									<DropdownMenuItem
										onClick={() => setLayout(item as callTypesLayout)}
									>
										{item}
									</DropdownMenuItem>
								</div>
							);
						})}
					</DropdownMenuContent>
				</DropdownMenu>
				<CallStatsButton />
				<Button
					onClick={() => setShowParticipants((prev) => !prev)}
					className="cursor-pointer rounded-2xl bg-[#19232d] px-3 py-2 hover:bg-[#4c535b] sm:px-4"
				>
					<Users size={20} className="text-white" />
				</Button>
				{!isPersonalRoom && <EndCallButton />}
			</div>
		</section>
	);
};

export default MeetingRoom;
