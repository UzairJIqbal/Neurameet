/* eslint-disable prettier/prettier */

import { Call, useStreamVideoClient } from "@stream-io/video-react-sdk";
import { useEffect, useState } from "react";

export default function useGetCallbyId(id: string | string[]) {
    const [call, setCall] = useState<Call>()
    const [callLoading, setCallLoading] = useState(false)
    const clinet = useStreamVideoClient();
    useEffect(() => {
        const loadCall = async () => {
            if (!clinet) return null
            const { calls } = await clinet?.queryCalls({
                filter_conditions: {
                    id
                }
            })
            if (calls.length > 0) return setCall(calls[0])
            setCallLoading(false)
        }
        loadCall()
    }, [clinet, id])

    return {
        call,
        callLoading
    }
}

