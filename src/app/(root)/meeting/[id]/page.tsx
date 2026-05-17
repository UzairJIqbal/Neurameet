/* eslint-disable prettier/prettier */
'use client'
import MeetingRoom from "@/components/MeetingRoom";
import MeetingSetup from "@/components/MeetingSetup";
import { LoaderOne } from "@/components/ui/loader";
import useGetCallbyId from "@/hooks/useGetCallbyId";
import { useUser } from "@clerk/nextjs";
import { StreamCall, StreamTheme } from "@stream-io/video-react-sdk";
import { useParams } from "next/navigation";
import React, { useState } from "react";

export default function Meeting() {
    const { id } = useParams() as { id: string }
    const [isSetupCompleted, setisSetupCompleted] = useState(false)
    const { isLoaded } = useUser()
    const { call, callLoading } = useGetCallbyId(id)

    if (!isLoaded || callLoading || !call) return <LoaderOne />
    return <StreamCall call={call}>
        <StreamTheme>
            {
                !isSetupCompleted ? <MeetingSetup setisSetupCompleted={setisSetupCompleted} /> : <MeetingRoom />
            }
        </StreamTheme>
    </StreamCall>;
};
