/* eslint-disable prettier/prettier */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCall, useCallStateHooks } from "@stream-io/video-react-sdk";
import DeviceSetup from "@/components/DeviceSetup";
import toast from "react-hot-toast";
import { ConsentNotice } from "@/components/ConsentNotice";
import { LoadError } from "@/components/ui/load-error";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { lookupMeetingByCall } from "@/lib/meeting-lookup-client";
import { CONSENT_NOTICE_VERSION, CONSENT_REQUIRED_MESSAGE } from "@/lib/consent";
import type { MeetingDetailResponse } from "@/lib/meeting-types";

type ProjectInfo = { projectId: string | null; projectName: string | null };

const NO_PROJECT: ProjectInfo = { projectId: null, projectName: null };

// W3: is this call a project meeting? A missing row or a 404 from the detail
// route (a personal meeting you have not attended, or a project you are not in)
// means no notice here; /members then decides, and its 404 sends you to the
// guest flow. Any other failure throws so the screen shows LoadError.
async function loadProjectInfo(
  callId: string,
  signal: AbortSignal,
): Promise<ProjectInfo> {
  const row = await lookupMeetingByCall(callId, signal);
  if (!row) return NO_PROJECT;
  const res = await fetch(`/api/meetings/${encodeURIComponent(row.meetingId)}`, {
    signal,
  });
  if (res.status === 404) return NO_PROJECT;
  if (!res.ok) throw new Error(`Meeting detail failed (${res.status})`);
  const data = (await res.json()) as MeetingDetailResponse;
  return {
    projectId: data.projectId ?? null,
    projectName: data.projectName ?? null,
  };
}

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
  const router = useRouter();
  const callId = call.id;

  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [infoFailed, setInfoFailed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  // The tick lives only in this screen, so it resets on every visit (AC-26).
  const [consented, setConsented] = useState(false);
  const infoLoading = project === null && !infoFailed;
  const { timedOut } = useLoadingTimeout(infoLoading, { retryNonce });

  useEffect(() => {
    const controller = new AbortController();
    setProject(null);
    setInfoFailed(false);
    loadProjectInfo(callId, controller.signal)
      .then(setProject)
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        console.error("[MeetingSetup] project lookup failed:", err);
        setInfoFailed(true);
      });
    return () => controller.abort();
  }, [callId, retryNonce]);

  const retryInfo = useCallback(() => setRetryNonce((n) => n + 1), []);
  const isProjectMeeting = Boolean(project?.projectId);

  const { useCameraState, useMicrophoneState } = useCallStateHooks();
  const { hasBrowserPermission: hasCameraPermission } = useCameraState();
  const { hasBrowserPermission: hasMicrophonePermissions } = useMicrophoneState();

  const sendToGuestFlow = () => {
    router.push(`/meeting/${encodeURIComponent(callId)}/guest?from=setup`);
  };

  // Saves the tick right before /members checks it. False means stop here.
  const saveConsent = async (): Promise<boolean> => {
    const res = await fetch(`/api/meetings/${encodeURIComponent(callId)}/consent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noticeVersion: CONSENT_NOTICE_VERSION }),
    });
    if (res.status === 404) {
      sendToGuestFlow();
      return false;
    }
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(data.error ?? "Couldn't save your answer, try again");
      return false;
    }
    return true;
  };

  const handleClick = async () => {
    if (project === null) return;
    if (isProjectMeeting && !consented) return;
    try {
      if (isProjectMeeting && !(await saveConsent())) return;

      const res = await fetch(`/api/meetings/${encodeURIComponent(callId)}/members`, {
        method: "POST",
      });

      if (res.status === 404) {
        sendToGuestFlow();
        return;
      }
      if (res.status === 409) {
        toast.error(CONSENT_REQUIRED_MESSAGE);
        setConsented(false);
        return;
      }
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

  const beforeJoin =
    infoFailed || (infoLoading && timedOut) ? (
      <LoadError message="We couldn't check this meeting." onRetry={retryInfo} />
    ) : infoLoading ? (
      <p className="text-center text-sm text-on-surface-variant">
        Checking this meeting…
      </p>
    ) : isProjectMeeting ? (
      <ConsentNotice
        checked={consented}
        onChange={setConsented}
        projectName={project?.projectName}
      />
    ) : null;

  return (
    <DeviceSetup
      call={call}
      buttonLabel="Join Meeting"
      onJoin={handleClick}
      joinDisabled={project === null || (isProjectMeeting && !consented)}
      beforeJoin={beforeJoin}
    />
  );
};

export default MeetingSetup;
