/* eslint-disable prettier/prettier */

import { Call, useStreamVideoClient } from "@stream-io/video-react-sdk";
import { useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { lookupMeetingByCall } from "@/lib/meeting-lookup-client";
import { DEFAULT_CALL_TYPE } from "@/lib/stream-call-type";

type UseGetCallByIdOptions = {
    allowLinkAccess?: boolean;
};

export default function useGetCallbyId(
    id: string | string[],
    options: UseGetCallByIdOptions = {},
) {
    const [call, setCall] = useState<Call>()
    const [callLoading, setCallLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    // W3: the call type lookup failed (not a 404). The page shows LoadError
    // with retry instead of guessing `default`.
    const [lookupFailed, setLookupFailed] = useState(false)
    const [retryNonce, setRetryNonce] = useState(0)
    const clinet = useStreamVideoClient();
    const { user } = useUser();
    const callId = Array.isArray(id) ? id[0] : id;

    useEffect(() => {
        let cancelled = false;

        const loadCall = async () => {
            if (!clinet || !user?.id || !callId) return null
            setCallLoading(true)
            setError(null)
            setLookupFailed(false)

            try {
                if (options.allowLinkAccess) {
                    let callType: string = DEFAULT_CALL_TYPE;
                    try {
                        const row = await lookupMeetingByCall(callId);
                        if (row) callType = row.callType;
                    } catch (lookupErr) {
                        console.error("[useGetCallbyId] call type lookup failed:", lookupErr);
                        if (!cancelled) {
                            setCall(undefined)
                            setLookupFailed(true)
                        }
                        return
                    }
                    if (cancelled) return
                    const linkedCall = clinet.call(callType, callId);
                    // Disable devices before get(): call.get() runs the SDK device
                    // setup which auto-enables the camera (call settings default
                    // `camera_default_on`) and logs a red "[devices]: Failed to get
                    // video stream" when no camera is available. MeetingSetup
                    // re-enables devices after a permission check, so starting
                    // disabled here does not affect the meeting.
                    await linkedCall.camera.disable().catch(() => {});
                    await linkedCall.microphone.disable().catch(() => {});
                    await linkedCall.get();

                    if (!cancelled) setCall(linkedCall);
                    return
                }

                const { calls } = await clinet?.queryCalls({
                    filter_conditions: {
                        id: callId,
                        $or: [
                            { created_by_user_id: user.id },
                            { members: { $in: [user.id] } },
                        ],
                    }
                })
                if (cancelled) return
                if (calls.length > 0) {
                    setCall(calls[0])
                    return
                }
                setCall(undefined)
                setError("Meeting not found")
            } catch (err) {
                if (cancelled) return
                setCall(undefined)
                setError(err instanceof Error ? err.message : "Meeting not found")
            } finally {
                if (!cancelled) setCallLoading(false)
            }
        }
        loadCall()

        return () => {
            cancelled = true;
        }
    }, [clinet, callId, options.allowLinkAccess, user?.id, retryNonce])

    return {
        call,
        callLoading,
        error,
        lookupFailed,
        retry: () => setRetryNonce((n) => n + 1),
    }
}

