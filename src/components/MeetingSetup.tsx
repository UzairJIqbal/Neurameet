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
			switch (audioType) {
				case "podcasts":
					try {
						await microphone.setAudioBitrateProfile(
							SfuModels.AudioBitrateProfile.VOICE_HIGH_QUALITY,
						);
					} catch (error) {
						toast(
							"Podcasts microphone settings is not available yet, switching to standard settings",
						);
						microphone.setAudioBitrateProfile(
							SfuModels.AudioBitrateProfile.VOICE_STANDARD_UNSPECIFIED,
						);
						console.error("The podcasts microphone :", error);
					}
					break;
				case "music calls":
					try {
						await microphone.setAudioBitrateProfile(
							SfuModels.AudioBitrateProfile.MUSIC_HIGH_QUALITY,
						);
					} catch (error) {
						toast(
							"Musics microphone settings is not available yet, switching to standard settings",
						);
						microphone.setAudioBitrateProfile(
							SfuModels.AudioBitrateProfile.VOICE_STANDARD_UNSPECIFIED,
						);
						console.error("The music microphone :", error);
					}
				default:
					microphone.setAudioBitrateProfile(
						SfuModels.AudioBitrateProfile.VOICE_STANDARD_UNSPECIFIED,
					);
					break;
			}
		};
		switchingMic();
	}, [microphone, audioType]);

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

	const handleClick = () => {
		call?.join();
		setisSetupCompleted(true);
	};

	return (
		<div className="flex h-screen w-full flex-col items-center justify-center gap-3 text-white overflow-hidden">
			<div className="h-[40rem] flex flex-col justify-center items-center px-4">
				<span className="mt-2 text-2xl font-bold">Set your</span>
				<FlipWords words={words} className="text-2xl" /> <br />
				<VideoPreview />
			</div>
			<div className="flex h-16 items-center justify-center gap-3">
				<label className="flex items-center justify-center gap-2 font-medium">
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
			<div className="flex h-40 w-full items-center justify-center">
				<Button onClick={handleClick}>Join Meeting</Button>
			</div>
		</div>
	);
};

export default MeetingSetup;
