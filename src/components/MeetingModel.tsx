/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable prettier/prettier */
/* eslint-disable prettier/prettier */
"use client";
import React, { useState, useEffect } from "react";
import { PlaceholdersAndVanishInput } from "@/components/ui/placeholders-and-vanish-input";
import DatePicker from "react-datepicker";
import { v4 as uuidv4 } from "uuid";
import {
  ModalBody,
  ModalContent,
  ModalFooter,
  useModal,
} from "@/components/ui/animated-modal";
import {
  instantMeetingModelImages,
  placeholders,
  handleChange,
} from "../../constants";
import { motion } from "motion/react";
import Image from "next/image";
import { Call, useStreamVideoClient } from "@stream-io/video-react-sdk";
import { useUser } from "@clerk/nextjs";
import { toast } from "react-hot-toast";
import { useRouter } from "next/navigation";
import { getMeetingIdFromLink } from "@/lib/utils";

type MeetingType =
  | "isInstantMeeting"
  | "isScheduleMeeting"
  | "isJoinMeeting"
  | "isRecordedMeeting";
const MeetingModel = ({
  type,
  onClose,
}: {
  type: MeetingType;
  onClose: () => void;
}) => {
  const router = useRouter();
  const { setOpen } = useModal();
  const [callDetails, setCallDetails] = useState<Call>();

  // Open the modal on mount — `ModalBody` only renders while
  // `ModalContext.open` is true, and nothing else flips it on in this flow.
  useEffect(() => {
    setOpen(true);
  }, [setOpen]);
  const [meetingLink, setMeetingLink] = useState("");

  const handleClick = ({ type }: { type: MeetingType }) => {
    if (type === "isInstantMeeting") {
      createMeeting();
    } else if (type === "isScheduleMeeting" && !callDetails) {
      ScheduleMeeting();
    } else if (type === "isScheduleMeeting" && callDetails) {
      copyMeetingLink(callDetails);
    } else if (type === "isJoinMeeting") {
      const meetingId = getMeetingIdFromLink(meetingLink);

      if (!meetingId) {
        toast.error("Please enter a valid meeting link");
        return;
      }

      router.push(`/meeting/${meetingId}`);
    } else {
      null;
    }
  };

  const copyMeetingLink = async (call: Call) => {
    const link = `${window.location.origin}/meeting/${call.id}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Meeting link copied to clipboard");
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  const [values, setValues] = useState({
    dateTime: new Date(),
    description: "",
  });
  const client = useStreamVideoClient();
  const { user } = useUser();

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
      });
      router.push(`/meeting/${call?.id}`);
      setCallDetails(call);
      toast("Meeting created Successfully");
    } catch (error) {
      console.error("Error occured in creating meeting", error);
    }
  };

  const ScheduleMeeting = async () => {
    try {
      if (!user || !client) return;
      if (!values.dateTime) {
        toast("Please Select Date and Time");
        return;
      }
      const startsAt = values.dateTime.toISOString();
      const description = values.description || "Scheduled Meeting";
      const id = uuidv4();
      const call = client.call("default", id);
      await call.getOrCreate({
        data: {
          starts_at: startsAt,
          members: [{ user_id: user.id }],
          custom: {
            description,
            owner_id: user.id,
          },
        },
      });
      setCallDetails(call);
    } catch (error) {
      console.error("Error occur in scheduling meeting", error);
    }
  };

  return (
    <div className="flex w-full items-center justify-center">
      <ModalBody onClose={onClose}>
        <ModalContent>
          <h4 className="mb-6 text-center text-lg font-bold text-on-surface md:text-2xl">
            {type === "isInstantMeeting"
              ? "Start an instant meeting"
              : type === "isJoinMeeting"
                ? "Join meeting via"
                : ""}
            {!callDetails &&
              type === "isScheduleMeeting" &&
              "Schedule your meeting for"}
            {callDetails && type === "isScheduleMeeting" && "Meeting"}
            <span className="px-1 py-0.5 rounded-md border border-primary-container bg-primary-container text-on-primary">
              {type === "isInstantMeeting"
                ? "NOW"
                : type === "isJoinMeeting"
                  ? "LINK"
                  : ""}
              {!callDetails && type === "isScheduleMeeting" && "NOW"}
              {callDetails && type === "isScheduleMeeting" && "Created"}
            </span>
          </h4>
          {type === "isInstantMeeting" && (
            <div className="flex flex-wrap items-center justify-center gap-2 sm:flex-nowrap sm:gap-0">
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
                  className="mt-2 shrink-0 overflow-hidden rounded-lg border border-outline-variant bg-surface-container-low p-1 sm:-mr-4 sm:mt-4 sm:rounded-xl"
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
          )}
          {type === "isJoinMeeting" && (
            <div className="mt-8 flex w-full flex-col items-center justify-center text-on-surface sm:mt-12">
              <PlaceholdersAndVanishInput
                placeholders={placeholders}
                onChange={(e) => {
                  handleChange(e);
                  setMeetingLink(e.target.value);
                }}
                onSubmit={() => handleClick({ type })}
              />
            </div>
          )}
          {!callDetails && type === "isScheduleMeeting" && (
            <>
              <div className="flex flex-col gap-2.5">
                <label className="text-base font-normal leading-[22.4px] text-on-surface-variant">
                  Add a description
                </label>
                <textarea
                  className="min-h-24 resize-y rounded-xl border border-outline-variant bg-surface-container-lowest p-3 text-on-surface text-balance focus-visible:ring-0 focus-visible:ring-offset-0"
                  onChange={(e) =>
                    setValues({ ...values, description: e.target.value })
                  }
                />
              </div>
              <div className="flex w-full flex-col gap-2.5">
                <label
                  htmlFor="DateandTime"
                  className="text-base font-normal leading-[22.4px] text-on-surface-variant mt-8"
                >
                  Select Date and Time
                </label>
                <DatePicker
                  selected={values.dateTime}
                  onChange={(date) => setValues({ ...values, dateTime: date! })}
                  showTimeSelect
                  timeFormat="HH:mm"
                  timeIntervals={1}
                  timeCaption="time"
                  dateFormat="MMMM d, yyyy h:mm aa"
                  className="w-full rounded-xl border border-outline-variant bg-surface-container-lowest p-3 text-on-surface focus:outline-none"
                />
              </div>
            </>
          )}
          {callDetails && type === "isScheduleMeeting" && (
            <div className="mt-6 flex w-full flex-col items-center gap-3 px-2 text-center sm:mt-10">
              <p className="text-base font-medium text-on-surface">
                Your meeting is scheduled
              </p>
              <div className="flex w-full max-w-sm items-center rounded-xl border border-outline-variant bg-surface-container-lowest p-2">
                <input
                  readOnly
                  value={`${window.location.origin}/meeting/${callDetails.id}`}
                  className="w-full bg-transparent px-2 text-sm text-on-surface outline-none"
                />
              </div>
              <p className="text-xs text-on-surface-variant">
                Copy and share this link with attendees.
              </p>
            </div>
          )}
        </ModalContent>

        <ModalFooter>
          <button
            className="w-full rounded-md border border-outline-variant bg-surface-container-lowest px-2 py-2 text-sm text-on-surface hover:bg-surface-container-low sm:w-28"
            onClick={() => onClose()}
          >
            Cancel
          </button>
          {callDetails && type === "isScheduleMeeting" && (
            <button
              className="w-full rounded-md border border-outline-variant bg-surface-container-lowest px-2 py-2 text-sm text-on-surface hover:bg-surface-container-low sm:w-28"
              onClick={() => router.push(`/meeting/${callDetails.id}`)}
            >
              Join
            </button>
          )}
          <button
            className="w-full rounded-md border border-primary-container bg-primary-container px-2 py-2 text-sm text-on-primary hover:bg-primary sm:w-28"
            onClick={() => handleClick({ type })}
          >
            {type === "isInstantMeeting"
              ? "Create Now"
              : type === "isJoinMeeting"
                ? "Join"
                : ""}
            {!callDetails && type === "isScheduleMeeting" && "Schedule"}
            {callDetails && type === "isScheduleMeeting" && "Copy link"}
          </button>
        </ModalFooter>
      </ModalBody>
    </div>
  );
};

export default MeetingModel;
