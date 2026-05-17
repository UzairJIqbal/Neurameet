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
		<section>
			<div className="relative flex size-full items-center justify-center mt-2">
				<div className="flex size-full max-w-[1000px] items-center">
					<CallLayout />
				</div>
				<div
					className={cn("h-[calc(100vh-86px)] hidden ml-2", {
						"show-block": showParticipants,
					})}
				>
					<CallParticipantsList onClose={() => setShowParticipants(false)} />
				</div>
			</div>

			<div className="fixed bottom-0 flex w-full items-center justify-center gap-5 flex-wrap">
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
					className="cursor-pointer rounded-2xl bg-[#19232d] px-4 py-2 hover:bg-[#4c535b]"
				>
					<Users size={20} className="text-white" />
				</Button>
				{!isPersonalRoom && <EndCallButton />}
			</div>
		</section>
	);
};

export default MeetingRoom;
