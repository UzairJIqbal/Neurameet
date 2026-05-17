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
import { onJoin } from "@/lib/utils";

const flipWords = ["Meeting", "Link",];


type MeetingType = "isInstantMeeting" | "isScheduleMeeting" | "isJoinMeeting" | "isRecordedMeeting";
const MeetingModel = ({ type, onClose, }: { type: MeetingType, onClose: () => void, }) => {
    const router = useRouter();
    const [callDetails, setCallDetails] = useState<Call>();

    const handleClick = ({ type }: { type: MeetingType }) => {
        if (type === 'isInstantMeeting') {
            createMeeting();
        } else if (type === 'isScheduleMeeting' && !callDetails) {
            ScheduleMeeting();
        } else if (type === 'isScheduleMeeting' && callDetails) {
            onJoin(callDetails);
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
            await call.getOrCreate()
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
                    custom: {
                        description,
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
        <div className="py-40 flex items-center justify-center">
            <ModalBody>
                <ModalContent>
                    <h4 className="text-lg md:text-2xl text-white dark:text-white font-bold text-center mb-8 ">
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
                        type === "isInstantMeeting" && <div className="flex justify-center items-center">
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
                                    className="rounded-xl -mr-4 mt-4 p-1 bg-white dark:bg-neutral-800 dark:border-neutral-700 border border-neutral-100 shrink-0 overflow-hidden"
                                >
                                    <Image
                                        src={image}
                                        alt="bali images"
                                        width="500"
                                        height="500"
                                        className="rounded-lg h-20 w-20 md:h-40 md:w-40 object-cover shrink-0"
                                    />
                                </motion.div>
                            ))}
                        </div>
                    }
                    {
                        type === "isJoinMeeting" &&
                        <div className="flex flex-col justify-center items-center px-4 mt-16 text-black">
                            <PlaceholdersAndVanishInput
                                placeholders={placeholders}
                                onChange={handleChange}
                                onSubmit={() =>
                                    onJoin(callDetails as Call)
                                }
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
                                    className="border-none bg-dark-3 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-xl text-white text-balance pt-2 py-2"
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
                                    className="w-full rounded-xl bg-dark-3 p-2 focus:outline-none text-white" />;
                            </div>
                        </>

                    }
                    {

                        callDetails && type === 'isScheduleMeeting' &&
                        <>
                            <div className="flex flex-col justify-center items-center px-4 mt-16 text-black">
                                <div className="text-2xl mx-auto font-normal text-neutral-400 dark:text-neutral-600">
                                    Copy
                                    <FlipWords words={flipWords} /> <br />
                                    of your schedule meeting
                                </div>
                            </div>
                        </>
                    }
                </ModalContent>

                <ModalFooter className="gap-4 bg-slate-300">
                    <button
                        className="px-2 py-1 bg-gray-200 text-black dark:bg-black dark:border-black dark:text-white border border-gray-300 rounded-md text-sm w-28"
                        onClick={() => onClose()}>
                        Cancel
                    </button>
                    <button
                        className="bg-black text-white dark:bg-white dark:text-black text-sm px-2 py-1 rounded-md border border-black w-28"
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
