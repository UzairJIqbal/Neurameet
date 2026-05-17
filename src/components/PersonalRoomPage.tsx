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
    return <div className="rounded-lg bg-dark-3 p-4">
        <h1 className="text-sm font-semibold text-slate-300 sm:text-base">{title}</h1>
        <p className="mt-2 break-all text-sm text-white sm:text-base">{description}</p>
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
                    starts_at: new Date().toISOString(),
                    members: [{ user_id: user?.id as string }],
                    custom: {
                        description: `${topicName}'s Meeting Room`,
                        owner_id: user?.id as string,
                    },
                }
            })
        }
        router.push(`/meeting/${meetingId}`)
    }
    return <div className='flex min-h-screen w-full flex-col gap-6 overflow-x-hidden text-white sm:gap-10'>
        <h1 className='text-2xl font-bold sm:text-3xl'>
            Personal Meeting Room
        </h1>
        <div className="flex w-full flex-col gap-8 xl:max-w-[900px]">
            <Table title="Topic" description={`${topicName}'s Meeting Room`} />
            <Table title="Meeting ID" description={meetingId as string} />
            <Table title="Invite Link" description={inviteLink} />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-5">
            <Button className="w-full bg-blue-1 sm:w-auto" onClick={createMeeting}>
                Start Meeting
            </Button>
            <Button
                className="w-full bg-dark-3 sm:w-auto"
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
