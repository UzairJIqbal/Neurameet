/* eslint-disable prettier/prettier */

import { Call, useStreamVideoClient } from "@stream-io/video-react-sdk";
import { useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";

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
    const clinet = useStreamVideoClient();
    const { user } = useUser();
    const callId = Array.isArray(id) ? id[0] : id;

    useEffect(() => {
        let cancelled = false;

        const loadCall = async () => {
            if (!clinet || !user?.id || !callId) return null
            setCallLoading(true)
            setError(null)

            try {
                if (options.allowLinkAccess) {
                    const linkedCall = clinet.call("default", callId);
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
    }, [clinet, callId, options.allowLinkAccess, user?.id])

    return {
        call,
        callLoading,
        error,
    }
}

