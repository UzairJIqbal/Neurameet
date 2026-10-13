/* eslint-disable prettier/prettier */
import React from "react";
import { useCallStateHooks, useCall } from "@stream-io/video-react-sdk";
import { useRouter } from "next/navigation";
import { PhoneOff } from "lucide-react";

const EndCallButton = () => {
  const { useLocalParticipant } = useCallStateHooks();
  const currentUser = useLocalParticipant();
  const router = useRouter();
  const call = useCall();
  const MeetingOwner = call?.state.createdBy;
  if (!call) return;

  const verifyMeetingOwner =
    currentUser && MeetingOwner && currentUser.userId === MeetingOwner.id;
  if (!verifyMeetingOwner) return null;

  const handleEndCall = async () => {
    // D3.4 /debug: endCall() is just POST /mark_ended — it does NOT stop a
    // running composite frame recording. If the owner ends the call while
    // recording is active, the file is never finalized and never surfaces in
    // queryRecordings / the recordings list. Stop it first so it gets
    // processed. Best-effort: never block ending the call on a stop failure.
    if (call?.state.recording) {
      try {
        await call.stopFrameRecording();
        // Stopping a composite frame recording starts asynchronous processing.
        // POST /mark_ended (endCall) finalizes the call immediately, which can
        // discard the in-progress file before Stream commits it. Give the
        // recording a short grace window to finalize before ending the call.
        await new Promise((r) => setTimeout(r, 2500));
      } catch (err) {
        console.error("EndCallButton: failed to stop recording before ending call:", err);
      }
    }
    call?.endCall();
    // Best-effort: stamp the meeting as "ended" + set ended_at so the recap
    // page shows the correct status and total time even when no transcript
    // is uploaded. The call.ended listener in MeetingRoom also fires this,
    // but firing here guarantees it lands on the owner's end action — the
    // primary "meeting ended" path — which is the case the recap is usually
    // opened from. Idempotent and server-validated (never blocks the call).
    if (call?.id) {
      fetch("/api/attendance/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stream_call_id: call.id,
          event_type: "call_ended",
        }),
      }).catch(() => {});
    }
    // Route the owner to the post call recap page like every other
    // participant, instead of dropping them back on the dashboard. Use
    // replace (not push) so the recap is a single history entry and one
    // browser-back press returns them to where they came from.
    if (call?.id) {
      router.replace(`/after-meeting/${call.id}`);
    } else {
      console.error("EndCallButton: missing call id for recap redirect");
    }
  };

  // Plain <button> (not the stateful loader Button): "End call" navigates away
  // immediately, so a spinner/check/success animation is both pointless and,
  // because of the shared layoutId="button" + layout, it morphed this button
  // and shoved its control-bar neighbours on click. Matching the other
  // control-bar buttons (rounded-xl, py-2) keeps the row visually uniform.
  return (
    <button
      onClick={handleEndCall}
      className="flex min-w-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl bg-error px-3 py-2 text-on-primary hover:bg-error/90 sm:min-w-[120px] sm:px-4"
    >
      <PhoneOff size={20} aria-hidden />
      <span className="hidden sm:inline">End call for everyone</span>
    </button>
  );
};

export default EndCallButton;
