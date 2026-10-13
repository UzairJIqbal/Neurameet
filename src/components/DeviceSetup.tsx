/* eslint-disable prettier/prettier */
/* eslint-disable react-hooks/exhaustive-deps */

"use client";

import {
  useCallStateHooks,
  useDeviceList,
  VideoPreview,
  SfuModels,
} from "@stream-io/video-react-sdk";
import type { Call } from "@stream-io/video-react-sdk";
import { useEffect, useState } from "react";
import { FlipWords } from "@/components/ui/flip-words";
import { words, type audioType } from "../../constants";
import { Button } from "@/components/ui/stateful-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  ChevronDown,
  Check,
  AlertTriangle,
} from "lucide-react";
import toast from "react-hot-toast";

export type DeviceItem = { deviceId: string; label: string };

/**
 * Re-usable device setup sub-component extracted from MeetingSetup.
 *
 * Renders the camera/mic preview, device dropdowns, and toggle buttons,
 * plus the probeMedia + permission-check useEffect logic that mirrors
 * MeetingSetup's proven pattern exactly.
 *
 * This component is provider-agnostic: it accepts a `call` prop so it
 * works in both the signed-in path (where call comes from useGetCallbyId)
 * and the guest path (where call comes from client.call()). It does NOT
 * call call.join() — that is the parent's responsibility.
 */
export const DeviceDropdown = ({
  label,
  icon,
  deviceList,
  selectedId,
  onSelect,
}: {
  label: string;
  icon: React.ReactNode;
  deviceList: DeviceItem[];
  selectedId: string | undefined;
  onSelect: (deviceId: string) => void;
}) => {
  const current = deviceList.find((d) => d.deviceId === selectedId) ?? deviceList[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-xl bg-surface-container px-3 py-2 text-sm font-medium text-on-surface hover:bg-surface-container-high sm:w-auto">
        {icon}
        <span className="max-w-[160px] truncate">{current?.label ?? label}</span>
        <ChevronDown size={16} className="shrink-0 text-on-surface-variant" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="flex max-h-64 flex-col gap-1 overflow-y-auto border-outline-variant bg-surface-container-lowest p-1 text-on-surface">
        {deviceList.map((d) => (
          <DropdownMenuItem
            key={d.deviceId}
            onClick={() => onSelect(d.deviceId)}
            className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface-container"
          >
            <span className="truncate">{d.label}</span>
            {d.deviceId === selectedId && (
              <Check size={16} className="shrink-0 text-primary-container" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const ToggleButton = ({
  active,
  onClick,
  onIcon,
  offIcon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  onIcon: React.ReactNode;
  offIcon: React.ReactNode;
  label: string;
}) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={cn(
      "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
      active
        ? "bg-primary-container text-on-primary"
        : "bg-surface-container text-on-surface hover:bg-surface-container-high",
    )}
  >
    {active ? onIcon : offIcon}
    <span className="hidden sm:inline">{label}</span>
  </button>
);

const AudioDropdown = ({
  audioType,
  setAudioType,
}: {
  audioType: audioType;
  setAudioType: (value: audioType) => void;
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger className="flex items-center gap-2 rounded-xl bg-surface-container px-3 py-2 text-sm font-medium text-on-surface hover:bg-surface-container-high">
      <Mic size={20} />
      <span className="hidden capitalize sm:inline">{audioType}</span>
      <ChevronDown size={16} className="text-on-surface-variant" />
    </DropdownMenuTrigger>
    <DropdownMenuContent className="flex flex-col gap-1 border-outline-variant bg-surface-container-lowest p-1 text-on-surface">
      {(["voice calls", "podcasts", "music calls"] as audioType[]).map((item) => (
        <DropdownMenuItem
          key={item}
          onClick={() => setAudioType(item)}
          className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm capitalize hover:bg-surface-container"
        >
          {item}
          {item === audioType && (
            <Check size={16} className="text-primary-container" />
          )}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);

export default function DeviceSetup({
  call,
  onJoin,
  buttonLabel = "Join Meeting",
  guestAdmissionMode: externalGuestAdmissionMode,
}: {
  call: Call;
  onJoin: () => void;
  buttonLabel?: string;
  guestAdmissionMode?: "open" | "approval";
}) {
  // Intended device state for the pre-join lobby (drives the toggle buttons).
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [audioType, setAudioType] = useState<audioType>("voice calls");
  const [guestAdmissionMode, setGuestAdmissionMode] =
    useState<"open" | "approval">(externalGuestAdmissionMode ?? "approval");

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

  //Camera and Microphone permissions notice
  useEffect(() => {
    if (hasCameraPermission && hasMicrophonePermissions) {
      toast("You have granted camera and microphone permissions!", {
        id: "perms-granted",
      });
    } else {
      toast("Grant permissions to camera and microphone from local browser", {
        id: "perms-prompt",
      });
    }
  }, [hasCameraPermission, hasMicrophonePermissions]);

  //Persist selected camera to local storage
  useEffect(() => {
    if (selectedCamera) {
      localStorage.setItem("preferredCameraDevice", selectedCamera);
    }
  }, [selectedCamera]);

  //Persist selected microphone to local storage
  useEffect(() => {
    if (selectedMicrophone) {
      localStorage.setItem("preferredMicrophoneDevice", selectedMicrophone);
    }
  }, [selectedMicrophone]);

  //Restore a previously selected camera from local storage
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

  //Restore a previously selected microphone from local storage
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

  //Audio quality profile switching (hifi_audio gated)
  useEffect(() => {
    if (!microphone) return;
    const switchingMic = async () => {
      const hifiAudioEnabled = call.state.settings?.audio.hifi_audio_enabled;

      if (!hifiAudioEnabled) {
        if (audioType !== "voice calls") {
          toast(
            "Enhanced audio is not available for this meeting. Using standard voice audio.",
          );
          setAudioType("voice calls");
        }
        return;
      }

      try {
        let profile: SfuModels.AudioBitrateProfile;
        if (audioType === "podcasts") {
          profile = SfuModels.AudioBitrateProfile.VOICE_HIGH_QUALITY;
        } else if (audioType === "music calls") {
          profile = SfuModels.AudioBitrateProfile.MUSIC_HIGH_QUALITY;
        } else {
          profile = SfuModels.AudioBitrateProfile.VOICE_STANDARD_UNSPECIFIED;
        }

        await microphone.setAudioBitrateProfile(profile);
      } catch {
        toast(
          "Audio settings could not be changed. Using standard voice audio.",
        );
        setAudioType("voice calls");
      }
    };
    switchingMic();
  }, [call.state.settings?.audio.hifi_audio_enabled, microphone, audioType]);

  useEffect(() => {
    localStorage.setItem("preferredAudioType", audioType);
  }, [audioType]);

  useEffect(() => {
    const saved = localStorage.getItem("preferredAudioType");
    if (saved) setAudioType(saved as audioType);
  }, []);

  //Confirm a media stream can actually be obtained for the given kind.
  //We stop any tracks immediately — we only want to know if the device works,
  //so the SDK's enable() never fires "[devices]: Failed to get video/audio stream"
  //for a device that is "granted" in the browser but unavailable (busy, missing,
  //or revoked at the OS level).
  const probeMedia = async (kind: "video" | "audio"): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        kind === "video" ? { video: true } : { audio: true },
      );
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch {
      return false;
    }
  };

  //Apply the intended device state per-device. Only enable a device after a
  //successful probe so the join-time SDK setup never calls getUserMedia on a
  //failing device. Replaces the old single "join with mic and camera off" switch.
  useEffect(() => {
    let cancelled = false;
    const cam = call?.camera;
    const mic = call?.microphone;
    if (!cam || !mic) return;

    const apply = async () => {
      if (!camOn) {
        cam.disable().catch(() => {});
      } else if (hasCameraPermission) {
        const ok = await probeMedia("video").catch(() => false);
        if (cancelled) return;
        if (ok) cam.enable().catch(() => {});
        else {
          cam.disable().catch(() => {});
          toast("Camera unavailable — you'll join without it.");
        }
      } else {
        cam.disable().catch(() => {});
      }

      if (!micOn) {
        mic.disable().catch(() => {});
      } else if (hasMicrophonePermissions) {
        const ok = await probeMedia("audio").catch(() => false);
        if (cancelled) return;
        if (ok) mic.enable().catch(() => {});
        else {
          mic.disable().catch(() => {});
          toast("Microphone unavailable — you'll join without it.");
        }
      } else {
        mic.disable().catch(() => {});
      }
    };

    apply();
    return () => {
      cancelled = true;
    };
  }, [
    call?.camera,
    call?.microphone,
    camOn,
    micOn,
    hasCameraPermission,
    hasMicrophonePermissions,
  ]);

  const cameraBlocked = hasCameraPermission === false;

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center gap-6 overflow-x-hidden bg-inverse-surface px-4 py-8 text-inverse-on-surface">
      <div className="flex w-full max-w-3xl flex-col items-center gap-6">
        <div className="text-center">
          <span className="text-xl font-semibold sm:text-2xl">Set your</span>{" "}
          <FlipWords words={words} className="text-2xl" />
        </div>

        <div className="w-full overflow-hidden rounded-lg border border-inverse-surface bg-surface-container">
          {hasCameraPermission ? (
            <VideoPreview className="!w-full !max-w-full aspect-video" />
          ) : (
            <div
              className={cn(
                "flex aspect-video w-full flex-col items-center justify-center gap-3 px-4 text-center text-body-md text-on-surface-variant",
                cameraBlocked
                  ? "border-2 border-error"
                  : "border-2 border-outline-variant",
              )}
            >
              {cameraBlocked ? (
                <>
                  <AlertTriangle size={28} className="text-error" />
                  <span>
                    Camera access is blocked. Allow camera &amp; microphone
                    access in your browser to preview your video.
                  </span>
                </>
              ) : (
                <span>
                  Camera preview is off — allow camera &amp; microphone access
                  in your browser to preview your video.
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row">
            <DeviceDropdown
              label="Camera"
              icon={<Video size={20} className="text-on-surface-variant" />}
              deviceList={cameraDeviceList}
              selectedId={selectedCamera}
              onSelect={(id) => camera?.select(id)}
            />
            <DeviceDropdown
              label="Microphone"
              icon={<Mic size={20} className="text-on-surface-variant" />}
              deviceList={microphoneDeviceList}
              selectedId={selectedMicrophone}
              onSelect={(id) => microphone?.select(id)}
            />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <ToggleButton
              active={camOn}
              onClick={() => setCamOn((v) => !v)}
              onIcon={<Video size={20} />}
              offIcon={<VideoOff size={20} />}
              label="Camera"
            />
            <ToggleButton
              active={micOn}
              onClick={() => setMicOn((v) => !v)}
              onIcon={<Mic size={20} />}
              offIcon={<MicOff size={20} />}
              label="Mic"
            />
            <AudioDropdown audioType={audioType} setAudioType={setAudioType} />
          </div>
        </div>

        {/* Guest admission mode — owner decides before joining */}
        <div className="flex w-full flex-col gap-2">
          <label className="text-base font-normal leading-[22.4px] text-white text-center">
            Guest Admission
          </label>
          <div className="flex gap-2 justify-center">
            <button
              type="button"
              onClick={() => setGuestAdmissionMode("open")}
              disabled={guestAdmissionMode === "open"}
              className={`rounded-lg px-4 py-2 text-body-md font-medium transition-colors ${
                guestAdmissionMode === "open"
                  ? "bg-primary-container text-on-primary"
                  : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
              } disabled:opacity-60`}
            >
              Anyone can join
            </button>
            <button
              type="button"
              onClick={() => setGuestAdmissionMode("approval")}
              disabled={guestAdmissionMode === "approval"}
              className={`rounded-lg px-4 py-2 text-body-md font-medium transition-colors ${
                guestAdmissionMode === "approval"
                  ? "bg-primary-container text-on-primary"
                  : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
              } disabled:opacity-60`}
            >
              Approval required
            </button>
          </div>
        </div>

        <div className="flex w-full items-center justify-center pt-2 sm:pt-4">
          <Button className="w-full sm:w-auto" onClick={onJoin}>
            {buttonLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
