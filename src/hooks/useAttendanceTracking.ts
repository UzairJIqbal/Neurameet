/* eslint-disable prettier/prettier */
"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { CallingState, useCall, useCallStateHooks } from "@stream-io/video-react-sdk";
import { useUser } from "@clerk/nextjs";
import { normalizeSpeakerName } from "@/lib/speaker-name";
import toast from "react-hot-toast";

type AttendanceEventType =
  | "join"
  | "leave"
  | "mic_on"
  | "mic_off"
  | "camera_on";

interface AttendanceIdentity {
  userId: string;
  streamUserId: string | null;
  name: string | null;
  email: string | null;
}

/**
 * Tracks the LOCAL participant's join/leave and mic/camera toggles by
 * forwarding Stream call events to the /api/attendance/event route. Each real
 * participant runs this hook on their own device, so they are recorded exactly
 * once (with their real email). Remote participants are intentionally NOT
 * recorded here — their own client writes their row, and the server enforces
 * one open row per (meeting, user) via a partial unique index. Writes happen
 * server-side only; this hook never touches Supabase.
 */
export function useAttendanceTracking(
  identityOverride?: {
    streamUserId: string | null;
    name: string | null;
    email: string | null;
  },
) {
  const call = useCall();
  const {
    useCallCallingState,
    useMicrophoneState,
    useCameraState,
    useLocalParticipant,
  } = useCallStateHooks();
  const callingState = useCallCallingState();
  const mic = useMicrophoneState();
  const cam = useCameraState();
  const localParticipant = useLocalParticipant();
  const { user } = useUser();

  // Memoize on stable primitives so the object identity does NOT change every
  // render. Previously the identity object was rebuilt inline each render and
  // used directly in effect dependency arrays, which made effects (including the
  // one that subscribes to call events) re-run every render and drove an
  // infinite update loop ("Maximum update depth exceeded").
  const localIdentity: AttendanceIdentity | null = useMemo(() => {
    // For guests (no Clerk user), build identity from the override
    // provided by the guest page (name/email from NameModal +
    // streamUserId from the local participant).
    if (!user && identityOverride) {
      return {
        userId: "",
        streamUserId: identityOverride.streamUserId ?? localParticipant?.userId ?? null,
        name: identityOverride.name,
        email: identityOverride.email,
      };
    }
    if (!user) return null;
    return {
      userId: user.id,
      // The connected Stream user id — the id Stream embeds in the individual
      // recording filename. Captured here so attendance_events can later map a
      // recording back to this participant's real name (Bug 1). It may be null
      // for a brief moment before the local participant resolves; the post
      // helper tolerates a null streamUserId (it just won't be stored).
      streamUserId: localParticipant?.userId ?? null,
      // Normalize here (not just at display) so the stored attendance name is
      // already clean — a Clerk profile like "Uzair Javaid Javaid Iqbal"
      // (overlapping first/last name fields) would otherwise persist the
      // duplicate token into attendance_events and surface everywhere it's read.
      name: normalizeSpeakerName(user.fullName ?? user.username ?? null),
      email: user.primaryEmailAddress?.emailAddress ?? null,
    };
  }, [
    user?.id,
    user?.fullName,
    user?.username,
    user?.primaryEmailAddress?.emailAddress,
    localParticipant?.userId,
  ]);

  // Refs so the post helper and the latest identity/participants stay reachable
  // from effects without forcing those effects to re-run on every render.
  const callRef = useRef(call);
  callRef.current = call;
  const identityRef = useRef(localIdentity);
  identityRef.current = localIdentity;

  const post = useCallback(
    async (eventType: AttendanceEventType, identity: AttendanceIdentity) => {
      const c = callRef.current;
      if (!c) return; // Allow guests without a userId (guest payloads are valid)
      const payload = JSON.stringify({
        stream_call_id: c.id,
        user_id: identity.userId,
        stream_user_id: identity.streamUserId,
        participant_name: identity.name,
        participant_email: identity.email,
        event_type: eventType,
      });
      const opts: RequestInit = {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
      };
      // Retry once on network failure OR HTTP 5xx (the server handles 23505
      // race conditions on meeting-row creation, but a transient 500 from a
      // concurrent insert race may still surface before the server's retry
      // logic catches it — the server-side catch is the real guard).
      const attempt = async () => {
        const res = await fetch("/api/attendance/event", opts);
        return res;
      };
      try {
        const res = await attempt();
        if (!res.ok && res.status >= 500) {
          // Retry once on server errors (join is idempotent server-side).
          await attempt();
        }
      } catch {
        try {
          await attempt();
        } catch {
          // Show a toast error to the user – best effort only.
          toast.error('Failed to record attendance event.');
        }
      }
    },
    [],
  );

  // `localJoinHandled` guarantees the local join is posted exactly once per
  // session. The SDK both replays the current state to this listener AND the
  // seed effect below may also fire, so without this guard the two `join` posts
  // race past the server's idempotency check and both insert — producing
  // duplicate rows (e.g. 4 rows for 2 participants). The server's partial
  // unique index is a second line of defence, but the code must not rely on a
  // migration having been run.
  const localJoinHandled = useRef(false);

  // Subscribe to the LOCAL participant's session join/leave. We only ever post
  // the local user — each client records its own participant (with the real
  // email); remote participants are written by their own clients. Depends on the
  // stable `user?.id` primitive (not the identity object) and `call`, so this
  // runs once per call rather than once per render. Identity is read from the ref.
  useEffect(() => {
    const c = callRef.current;
    if (!c || !identityRef.current) return;

    const onJoined = (event: { participant: { user: { id: string; name?: string | null } } }) => {
      const u = event.participant.user;
      // Match by userId if present, otherwise by streamUserId (guest case).
      const current = identityRef.current;
      if (!current) return;
      if (current.userId) {
        if (u.id !== current.userId) return;
      } else if (current.streamUserId) {
        if (u.id !== current.streamUserId) return;
      } else {
        return;
      }
      if (localJoinHandled.current) return;
      localJoinHandled.current = true;
      post("join", current);
    };

    const onLeft = (event: { participant: { user: { id: string; name?: string | null } } }) => {
      const u = event.participant.user;
      const current = identityRef.current;
      if (!current) return;
      if (current.userId) {
        if (u.id !== current.userId) return;
      } else if (current.streamUserId) {
        if (u.id !== current.streamUserId) return;
      } else {
        return;
      }
      localJoinHandled.current = false; // allow a reconnect to re-open a row
      post("leave", current);
    };

    const offJoined = c.on("call.session_participant_joined", onJoined);
    const offLeft = c.on("call.session_participant_left", onLeft);
    return () => {
      offJoined();
      offLeft();
    };
  }, [post, call, user?.id]);

  // Retry join if the identity lacked a userId initially but later resolves (guest race).
  useEffect(() => {
    if (callingState !== CallingState.JOINED) return;
    if (localJoinHandled.current) return;
    const id = identityRef.current;
    if (!id) return;
    // If we have a streamUserId but no userId, wait for localParticipant.userId to become available.
    if (!id.userId && id.streamUserId && localParticipant?.userId) {
      localJoinHandled.current = true;
      post("join", id);
    }
  }, [callingState, localIdentity, localParticipant?.userId, post]);

  // Seed the LOCAL user on join (catch-up in case the local join event was
  // missed before the subscription attached). Shares `localJoinHandled` with the
  // subscription above, so whichever fires first wins and only one join is posted.
  useEffect(() => {
    if (callingState !== CallingState.JOINED || !localIdentity) return;
    // Ensure we have at least one identifier (userId, streamUserId, or email) before posting.
    if (!localIdentity.userId && !localIdentity.streamUserId && !localIdentity.email) return;
    if (localJoinHandled.current) return;
    localJoinHandled.current = true;

    post("join", localIdentity);
  }, [callingState, localIdentity, post]);

  // Local mic toggle: unmute -> mic_on (start talk timer), mute -> mic_off.
  const prevMicMute = useRef<boolean | null>(null);
  useEffect(() => {
    if (callingState !== CallingState.JOINED || !localIdentity) return;
    const isMute = mic.isMute;
    if (prevMicMute.current === null) {
      prevMicMute.current = isMute;
      if (!isMute) {
        post("mic_on", localIdentity);
      }
      return;
    }
    if (isMute === prevMicMute.current) return;
    prevMicMute.current = isMute;
    post(isMute ? "mic_off" : "mic_on", localIdentity);
  }, [mic.isMute, callingState, localIdentity, post]);

  // Local camera: count each time the camera is enabled (a toggle action).
  const prevCamOn = useRef<boolean | null>(null);
  useEffect(() => {
    if (callingState !== CallingState.JOINED || !localIdentity) return;
    const isOn = cam.isEnabled;
    if (prevCamOn.current === isOn) return;
    const wasOn = prevCamOn.current;
    prevCamOn.current = isOn;
    if (isOn && !wasOn) post("camera_on", localIdentity);
  }, [cam.isEnabled, callingState, localIdentity, post]);

  // Best-effort leave on unmount (covers closing the tab without clicking leave).
  useEffect(() => {
    return () => {
      const c = callRef.current;
      const id = identityRef.current;
      if (!c || !id?.userId) return;
      const payload = JSON.stringify({
        stream_call_id: c.id,
        user_id: id.userId,
        stream_user_id: id.streamUserId,
        participant_name: id.name,
        participant_email: id.email,
        event_type: "leave",
      });
      try {
        fetch("/api/attendance/event", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: payload,
          keepalive: true,
        });
      } catch {
        // best effort only
      }
    };
  }, []);

  // Explicit leave for the normal leave path (OnLeave in MeetingRoom).
  const reportLocalLeave = useCallback(() => {
    const c = callRef.current;
    const id = identityRef.current;
    if (!c || !id?.userId) return;
    const payload = JSON.stringify({
      stream_call_id: c.id,
      user_id: id.userId,
      stream_user_id: id.streamUserId,
      participant_name: id.name,
      participant_email: id.email,
      event_type: "leave",
    });
    try {
      fetch("/api/attendance/event", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
        keepalive: true,
      });
    } catch {
      // best effort only
    }
  }, []);

  return { reportLocalLeave };
}
