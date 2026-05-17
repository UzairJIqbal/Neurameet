/* eslint-disable prettier/prettier */
import React from "react";
import { useCallStateHooks, useCall } from "@stream-io/video-react-sdk";
import { Button } from "./ui/stateful-button";
import { useRouter } from "next/navigation";

const EndCallButton = () => {
    const { useLocalParticipant } = useCallStateHooks();
    const currentUser = useLocalParticipant();
    const router = useRouter()
    const call = useCall();
    const MeetingOwner = call?.state.createdBy
    if (!call) return;

    const verifyMeetingOwner = currentUser && MeetingOwner && currentUser.userId === MeetingOwner.id;
    if (!verifyMeetingOwner) return null;

    return (
        <Button onClick={() => {
            call?.endCall();
            router.push('/')
        }}
            className="bg-red-500"
        >End call for everyone</Button>
    )
};

export default EndCallButton;
