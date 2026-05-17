/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prettier/prettier */

/* eslint-disable prettier/prettier */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable prettier/prettier */
"use client";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	DeviceSettings,
	MenuVisualType,
	useCall,
	VideoPreview,
} from "@stream-io/video-react-sdk";
import { useEffect, useState } from "react";
import { FlipWords } from "@/components/ui/flip-words";
import { words } from "../../constants";
import { Button } from "@/components/ui/stateful-button";
import {
	useCallStateHooks,
	useDeviceList,
	SfuModels,
} from "@stream-io/video-react-sdk";
import { audioType } from "../../constants";
import { Mic } from "lucide-react";
import toast from "react-hot-toast";
/* eslint-disable prettier/prettier */

const MeetingSetup = ({
	setisSetupCompleted,
}: {
	setisSetupCompleted: (type: boolean) => void;
}) => {
	const [isMicCamToggleOn, setisMicCamToggleOn] = useState(false);

	const call = useCall();
	if (!call) throw new Error("Go back to meeting setup page");

	const [audioType, setAudioType] = useState<audioType>("voice calls");
	const { useCameraState, useMicrophoneState } = useCallStateHooks();
	const {
		camera,
		selectedDevice: selectedCamera,
		devices: cameraDevices,
		hasBrowserPermission: hasCameraPermission,
	} = useCameraState();
	const {
		microphone,
		selectedDevice: selectedMicrophone,
		devices: MicrophoneDevices,
		hasBrowserPermission: hasMicrophonePermissions,
	} = useMicrophoneState();

	const { deviceList: cameraDeviceList } = useDeviceList(
		cameraDevices,
		selectedCamera,
	);
	const { deviceList: microphoneDeviceList } = useDeviceList(
		MicrophoneDevices,
		selectedMicrophone,
	);

	const [isCameraSelected, setIsCameraSelected] = useState(selectedCamera);
	const [isMicrophoneSelected, setIsMicrophoneSelected] =
		useState(selectedMicrophone);

	//Camera and Microphone Permissions settings
	useEffect(() => {
		if (hasCameraPermission && hasMicrophonePermissions) {
			toast("You has granted camera and microphone permissions!");
		} else {
			toast("Grant permissions to camera and microphone from local browser");
		}
	}, [hasCameraPermission, hasMicrophonePermissions]);

	//Storing camera to local storage settings
	useEffect(() => {
		if (selectedCamera) {
			localStorage.setItem("preferredCameraDevice", selectedCamera);
		}
	}, [selectedCamera]);

	//Storing Microphone to local storage settings
	useEffect(() => {
		if (selectedMicrophone) {
			localStorage.setItem("preferredMicrophoneDevice", selectedMicrophone);
		}
	}, [selectedMicrophone]);

	//Getting Camrea from local storage and preffering it settings
	useEffect(() => {
		if (!cameraDevices || cameraDevices.length === 0) return;
		const saved = localStorage.getItem("preferredCameraDevice");
		if (saved && saved !== selectedCamera) {
			const found = cameraDeviceList.find((d) => d.deviceId === saved);
			if (found) {
				camera
					?.select(saved)
					.catch((error) =>
						console.warn("failed to auto-select saved camera", error),
					);
			}
		}
	}, [cameraDeviceList]);

	//Getting Microphone from local storage and preffering it settings
	useEffect(() => {
		if (!MicrophoneDevices || MicrophoneDevices.length === 0) return;
		const saved = localStorage.getItem("preferredMicrophoneDevice");
		if (saved && saved !== selectedMicrophone) {
			const found = microphoneDeviceList.find((d) => d.deviceId === saved);
			if (found) {
				microphone
					?.select(saved)
					.catch((error) =>
						console.warn("failed to auto-select saved microphone", error),
					);
			}
		}
	}, [microphoneDeviceList]);

	//Microphone switching logic
	useEffect(() => {
		if (!microphone) return;
		const switchingMic = async () => {
			const hifiAudioEnabled = call.state.settings?.audio.hifi_audio_enabled;

			if (!hifiAudioEnabled) {
				if (audioType !== "voice calls") {
					toast("Enhanced audio is not available for this meeting. Using standard voice audio.");
					setAudioType("voice calls");
				}
				return;
			}

			try {
				const profile =
					audioType === "podcasts"
						? SfuModels.AudioBitrateProfile.VOICE_HIGH_QUALITY
						: audioType === "music calls"
							? SfuModels.AudioBitrateProfile.MUSIC_HIGH_QUALITY
							: SfuModels.AudioBitrateProfile.VOICE_STANDARD_UNSPECIFIED;

				await microphone.setAudioBitrateProfile(profile);
			} catch {
				toast("Audio settings could not be changed. Using standard voice audio.");
				setAudioType("voice calls");
			}
		};
		switchingMic();
	}, [call.state.settings?.audio.hifi_audio_enabled, microphone, audioType]);

	//Setting selected microphone and getting it from local storage
	useEffect(() => {
		localStorage.setItem("preferredAudioType", audioType);
	}, [audioType]);

	useEffect(() => {
		const saved = localStorage.getItem("preferredAudioType");
		if (saved) setAudioType(saved as audioType);
	}, []);

	useEffect(() => {
		if (selectedCamera) {
			setIsCameraSelected(selectedCamera ?? "");
		}
	}, [selectedCamera]);

	useEffect(() => {
		if (selectedMicrophone) {
			setIsMicrophoneSelected(selectedMicrophone ?? "");
		}
	}, [selectedMicrophone]);

	useEffect(() => {
		if (isMicCamToggleOn) {
			const camera = call?.camera;
			camera?.enable();
			const microphone = call?.microphone;
			microphone?.enable();
		} else {
			const camera = call?.camera;
			camera?.disable();
			const microphone = call?.microphone;
			microphone?.disable();
		}
	}, [call?.camera, call?.microphone, isMicCamToggleOn]);

	const handleClick = async () => {
		try {
			const res = await fetch(`/api/meetings/${call.id}/members`, {
				method: "POST",
			});

			if (!res.ok) {
				throw new Error("Unable to join this meeting");
			}

			await call.join({ create: false });
			setisSetupCompleted(true);
		} catch (error) {
			console.error("Failed to join meeting:", error);
			toast.error("Unable to join this meeting. Please check the link.");
		}
	};

	return (
		<div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 overflow-x-hidden px-3 py-6 text-white">
			<div className="flex w-full max-w-3xl flex-col items-center justify-center px-1 sm:px-4">
				<span className="mt-2 text-xl font-bold sm:text-2xl">Set your</span>
				<FlipWords words={words} className="text-2xl" /> <br />
				<div className="w-full overflow-hidden rounded-lg">
					<VideoPreview />
				</div>
			</div>
			<div className="flex w-full max-w-3xl flex-col items-center justify-center gap-3 sm:flex-row">
				<label className="flex items-center justify-center gap-2 text-sm font-medium sm:text-base">
					<input
						type="checkbox"
						checked={isMicCamToggleOn}
						onChange={(e) => setisMicCamToggleOn(e.target.checked)}
					/>
					Join with mic and camera off
				</label>
				<DeviceSettings visualType={MenuVisualType.MENU} />
				<div className="flex flex-row">
					<DropdownMenu>
						<DropdownMenuTrigger>
							<Mic height="20px" width="20px" />
						</DropdownMenuTrigger>
						<DropdownMenuContent className="flex flex-col justify-center items-center text-white border-transparent cursor-pointer">
							{["voice calls", "podcasts", "music calls"].map((item, index) => {
								return (
									<DropdownMenuItem
										key={index}
										onClick={() => {
											setAudioType(item as audioType);
										}}
										className="border-none cursor-pointer"
									>
										{item}
									</DropdownMenuItem>
								);
							})}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>
			<div className="flex w-full max-w-3xl items-center justify-center pt-2 sm:pt-6">
				<Button className="w-full sm:w-auto" onClick={handleClick}>Join Meeting</Button>
			</div>
		</div>
	);
};

export default MeetingSetup;
