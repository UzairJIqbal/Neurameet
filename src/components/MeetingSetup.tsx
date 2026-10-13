/* eslint-disable prettier/prettier */
"use client";

import { useCall, useCallStateHooks } from "@stream-io/video-react-sdk";
import DeviceSetup from "@/components/DeviceSetup";
import toast from "react-hot-toast";

/**
 * Thin wrapper around the shared DeviceSetup component.
 *
 * All device preview + probe + toggle logic now lives in DeviceSetup.
 * This component resolves the call from context (useCall) and wires up
 * the signed-in join flow: POST /api/meetings/:id/members → call.join → complete.
 *
 * Re-exports DeviceDropdown + DeviceItem so any external imports from
 * this module still resolve after the extraction.
 */

export { DeviceDropdown } from "@/components/DeviceSetup";
export type { DeviceItem } from "@/components/DeviceSetup";

const MeetingSetup = ({
  setisSetupCompleted,
}: {
  setisSetupCompleted: (type: boolean) => void;
}) => {
  const call = useCall();
  if (!call) throw new Error("Go back to meeting setup page");

  const { useCameraState, useMicrophoneState } = useCallStateHooks();
  const { hasBrowserPermission: hasCameraPermission } = useCameraState();
  const { hasBrowserPermission: hasMicrophonePermissions } = useMicrophoneState();

  const handleClick = async () => {
    try {
      const res = await fetch(`/api/meetings/${call.id}/members`, {
        method: "POST",
      });

      if (!res.ok) {
        throw new Error("Unable to join this meeting");
      }

      //When the browser has denied camera/mic, force the devices to a disabled
      //state before joining. The SDK auto-enables media on join
      //(mic_default_on / resume re-enable) and would otherwise fire a doomed
      //getUserMedia and log "[devices]: Failed to get audio/video stream".
      if (!hasCameraPermission) {
        await call?.camera?.disable().catch(() => {});
      }
      if (!hasMicrophonePermissions) {
        await call?.microphone?.disable().catch(() => {});
      }

      await call.join({ create: false });

      //Re-assert after join — the SDK may re-enable denied devices on resume.
      if (!hasCameraPermission) {
        await call?.camera?.disable().catch(() => {});
      }
      if (!hasMicrophonePermissions) {
        await call?.microphone?.disable().catch(() => {});
      }

      const mediaBlocked = !hasCameraPermission || !hasMicrophonePermissions;
      if (mediaBlocked) {
        toast(
          "Joined without camera or microphone — allow access in your browser to enable them.",
        );
      }

      setisSetupCompleted(true);
    } catch (error) {
      console.error("Failed to join meeting:", error);
      toast.error("Unable to join this meeting. Please check the link.");
    }
  };

  return (
    <DeviceSetup
      call={call}
      buttonLabel="Join Meeting"
      onJoin={handleClick}
    />
  );
};

export default MeetingSetup;
