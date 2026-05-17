/* eslint-disable prettier/prettier */

/* eslint-disable prettier/prettier */
import useGetCallbyId from "@/hooks/useGetCallbyId";
import { useUser } from "@clerk/nextjs";
import { useStreamVideoClient } from "@stream-io/video-react-sdk";
import { useRouter } from "next/navigation";
import React from "react";
import { Button } from "./ui/stateful-button";
import toast from "react-hot-toast";

const Table = ({ title, description }: { title: string, description: string }) => {
    return <div>
        <h1>{title}</h1>
        <p>{description}</p>
    </div >
}

const PersonalRoomPage = () => {
    const { user } = useUser();
    const client = useStreamVideoClient();
    const router = useRouter()
    const topicName = user?.username;
    const meetingId = user?.id;
    const inviteLink = `${process.env.NEXT_PUBLIC_BASE_URL}/meeting/${meetingId}`

    const { call } = useGetCallbyId(meetingId as string);

    const createMeeting = async () => {
        if (!call) {
            const call = client?.call('default', meetingId as string)
            await call?.getOrCreate({
                data: {
                    starts_at: new Date().toISOString()
                }
            })
        }
        router.push(`/meeting/${meetingId}`)
    }
    return <div className='flex size-full flex-col gap-10 text-white'>
        <h1 className='text-3xl font-bold'>
            Personal Meeting Room
        </h1>
        <div className="flex w-full flex-col gap-8 xl:max-w-[900px]">
            <Table title="Topic" description={`${topicName}'s Meeting Room`} />
            <Table title="Meeting ID" description={meetingId as string} />
            <Table title="Invite Link" description={inviteLink} />
        </div>
        <div className="flex gap-5">
            <Button className="bg-blue-1" onClick={createMeeting}>
                Start Meeting
            </Button>
            <Button
                className="bg-dark-3"
                onClick={() => {
                    navigator.clipboard.writeText(inviteLink);
                    toast(
                        "Link Copied",
                    );
                }}
            >
                Copy Invitation
            </Button>
        </div>

    </div>
};

export default PersonalRoomPage;
