/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable prettier/prettier */
/* eslint-disable prettier/prettier */
'use client'
import React, { useState } from "react";
import { PlaceholdersAndVanishInput } from "@/components/ui/placeholders-and-vanish-input";
import DatePicker from "react-datepicker";
import { FlipWords } from "@/components/ui/flip-words";
import { v4 as uuidv4 } from 'uuid';
import {
    ModalBody,
    ModalContent,
    ModalFooter,
} from "@/components/ui/animated-modal";
import { instantMeetingModelImages, placeholders, handleChange } from "../../constants";
import { motion } from "motion/react";
import Image from "next/image";
import { Call, useStreamVideoClient } from "@stream-io/video-react-sdk";
import { useUser } from "@clerk/nextjs";
import { toast } from "react-hot-toast";
import { useRouter } from "next/navigation";
import { getMeetingIdFromLink, onJoin } from "@/lib/utils";

const flipWords = ["Meeting", "Link",];


type MeetingType = "isInstantMeeting" | "isScheduleMeeting" | "isJoinMeeting" | "isRecordedMeeting";
const MeetingModel = ({ type, onClose, }: { type: MeetingType, onClose: () => void, }) => {
    const router = useRouter();
    const [callDetails, setCallDetails] = useState<Call>();
    const [meetingLink, setMeetingLink] = useState("");

    const handleClick = ({ type }: { type: MeetingType }) => {
        if (type === 'isInstantMeeting') {
            createMeeting();
        } else if (type === 'isScheduleMeeting' && !callDetails) {
            ScheduleMeeting();
        } else if (type === 'isScheduleMeeting' && callDetails) {
            onJoin(callDetails);
        } else if (type === 'isJoinMeeting') {
            const meetingId = getMeetingIdFromLink(meetingLink);

            if (!meetingId) {
                toast.error("Please enter a valid meeting link");
                return;
            }

            router.push(`/meeting/${meetingId}`);
        } else {
            null
        }
    }

    const [values, setValues] = useState({
        dateTime: new Date(),
        description: ''
    })
    const client = useStreamVideoClient()
    const { user } = useUser()

    const createMeeting = async () => {
        try {
            if (!user || !client) return;
            const id = uuidv4();
            const call = client.call("default", id);
            await call.getOrCreate({
                data: {
                    starts_at: new Date().toISOString(),
                    members: [{ user_id: user.id }],
                    custom: {
                        description: "Instant Meeting",
                        owner_id: user.id,
                    },
                },
            })
            router.push(`/meeting/${call?.id}`)
            setCallDetails(call)
            toast("Meeting created Successfully")
        } catch (error) {
            console.error("Error occured in creating meeting", error);
        }
    }

    const ScheduleMeeting = async () => {
        try {
            if (!user || !client) return
            const startsAt = values.dateTime.toISOString() || new Date(Date.now()).toISOString();
            const description = values.description || "Instant Meeting";
            if (!values.dateTime) {
                toast("Please Select Date and Time");
                return
            }
            const id = uuidv4();
            const call = client.call("default", id);
            await call.getOrCreate({
                data: {
                    starts_at: startsAt,
                    members: [{ user_id: user.id }],
                    custom: {
                        description,
                        owner_id: user.id,
                    }
                }
            })
            if (!values.description) {
                router.replace(`/meeting/${call.id}`);
                return
            }
            setCallDetails(call)
        } catch (error) {
            console.error("Error occur in scheduling meeting", error)
        }

    }

    return (
        <div className="flex w-full items-center justify-center">
            <ModalBody>
                <ModalContent>
                    <h4 className="mb-6 text-center text-lg font-bold text-white dark:text-white md:text-2xl">
                        {type === 'isInstantMeeting' ? "Start an instant meeting"
                            : type === 'isJoinMeeting' ? "Join meeting via"
                                : ''
                        }
                        {
                            !callDetails && type === 'isScheduleMeeting' && "Schedule your meeting for"
                        }
                        {
                            callDetails && type === 'isScheduleMeeting' && "Meeting"
                        }
                        <span className="px-1 py-0.5 rounded-md bg-gray-500 dark:bg-neutral-800 dark:border-neutral-700 border border-gray-100">
                            {type === 'isInstantMeeting' ? "NOW"
                                : type === 'isJoinMeeting' ? "LINK"
                                    : ''}
                            {
                                !callDetails && type === 'isScheduleMeeting' && 'NOW'
                            }
                            {
                                callDetails && type === 'isScheduleMeeting' && "Created"
                            }
                        </span>
                    </h4>
                    {
                        type === "isInstantMeeting" && <div className="flex flex-wrap items-center justify-center gap-2 sm:flex-nowrap sm:gap-0">
                            {instantMeetingModelImages.map((image, idx) => (
                                <motion.div
                                    key={"images" + idx}
                                    style={{
                                        rotate: Math.random() * 20 - 10,
                                    }}
                                    whileHover={{
                                        scale: 1.1,
                                        rotate: 0,
                                        zIndex: 100,
                                    }}
                                    whileTap={{
                                        scale: 1.1,
                                        rotate: 0,
                                        zIndex: 100,
                                    }}
                                    className="mt-2 shrink-0 overflow-hidden rounded-lg border border-neutral-100 bg-white p-1 dark:border-neutral-700 dark:bg-neutral-800 sm:-mr-4 sm:mt-4 sm:rounded-xl"
                                >
                                    <Image
                                        src={image}
                                        alt="bali images"
                                        width="500"
                                        height="500"
                                        className="h-20 w-20 shrink-0 rounded-lg object-cover sm:h-28 sm:w-28 md:h-36 md:w-36"
                                    />
                                </motion.div>
                            ))}
                        </div>
                    }
                    {
                        type === "isJoinMeeting" &&
                        <div className="mt-8 flex w-full flex-col items-center justify-center text-black sm:mt-12">
                            <PlaceholdersAndVanishInput
                                placeholders={placeholders}
                                onChange={(e) => {
                                    handleChange(e);
                                    setMeetingLink(e.target.value);
                                }}
                                onSubmit={() => handleClick({ type })}
                            />
                        </div>
                    }
                    {
                        !callDetails && type === 'isScheduleMeeting' && <>
                            <div className="flex flex-col gap-2.5">
                                <label className="text-base font-normal leading-[22.4px] text-sky-2">
                                    Add a description
                                </label>
                                <textarea
                                    className="min-h-24 resize-y rounded-xl border-none bg-dark-3 p-3 text-white text-balance focus-visible:ring-0 focus-visible:ring-offset-0"
                                    onChange={(e) => setValues({ ...values, description: e.target.value })} />
                            </div>
                            <div className="flex w-full flex-col gap-2.5">
                                <label htmlFor="DateandTime" className="text-base font-normal leading-[22.4px] text-sky-2 mt-8">Select Date and Time</label>
                                <DatePicker
                                    selected={values.dateTime}
                                    onChange={(date) => setValues({ ...values, dateTime: date! })}
                                    showTimeSelect
                                    timeFormat="HH:mm"
                                    timeIntervals={15}
                                    timeCaption="time"
                                    dateFormat="MMMM d, yyyy h:mm aa"
                                    className="w-full rounded-xl bg-dark-3 p-3 text-white focus:outline-none" />;
                            </div>
                        </>

                    }
                    {

                        callDetails && type === 'isScheduleMeeting' &&
                        <>
                            <div className="mt-8 flex flex-col items-center justify-center px-2 text-center text-black sm:mt-12">
                                <div className="mx-auto text-lg font-normal text-neutral-400 dark:text-neutral-600 sm:text-2xl">
                                    Copy
                                    <FlipWords words={flipWords} /> <br />
                                    of your schedule meeting
                                </div>
                            </div>
                        </>
                    }
                </ModalContent>

                <ModalFooter className="bg-slate-300">
                    <button
                        className="w-full rounded-md border border-gray-300 bg-gray-200 px-2 py-2 text-sm text-black dark:border-black dark:bg-black dark:text-white sm:w-28"
                        onClick={() => onClose()}>
                        Cancel
                    </button>
                    <button
                        className="w-full rounded-md border border-black bg-black px-2 py-2 text-sm text-white dark:bg-white dark:text-black sm:w-28"
                        onClick={() => handleClick({ type })}
                    >
                        {
                            type === 'isInstantMeeting' ? "Create Now" : type === 'isJoinMeeting' ? "Join" : ''
                        }
                        {
                            !callDetails && type === 'isScheduleMeeting' && "Schedule"
                        }
                        {
                            callDetails && type === 'isScheduleMeeting' && "Copy link"
                        }
                    </button>
                </ModalFooter>
            </ModalBody>
        </div >
    );

};

export default MeetingModel;
