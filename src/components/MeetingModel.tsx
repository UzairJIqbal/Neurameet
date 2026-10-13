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
import { createScheduledMeetingRow } from "@/actions/meetings";
import { withStreamConnectionRetry } from "@/lib/streamRetry";

type MeetingType =
  | "isInstantMeeting"
  | "isScheduleMeeting"
  | "isJoinMeeting"
  | "isRecordedMeeting";

// Creating/scheduling a call runs the SDK's device setup, which auto-enables the
// camera and mic (call settings default `camera_default_on`). When no camera is
// available that logs a red "[devices]: Failed to get video stream". Disabling both
// devices first keeps their status out of the "undefined/pristine" state, so the SDK
// never tries to acquire a stream during call creation. This call object is local to
// this modal; the later join (MeetingRoom) creates its own call instance.
const prepareCallDevices = async (call: Call) => {
  await call.camera.disable().catch(() => {});
  await call.microphone.disable().catch(() => {});
};

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
  const [creating, setCreating] = useState(false);
  const isCreated =
    !!callDetails &&
    (type === "isInstantMeeting" || type === "isScheduleMeeting");

  const handleClick = ({ type }: { type: MeetingType }) => {
    if (isCreated && callDetails) {
      copyMeetingLink(callDetails);
    } else if (type === "isInstantMeeting") {
      createMeeting();
    } else if (type === "isScheduleMeeting" && !callDetails) {
      ScheduleMeeting();
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

  const copyMeetingLink = async (call: Call, message?: string) => {
    const link = `${window.location.origin}/meeting/${call.id}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success(message ?? "Meeting link copied to clipboard");
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  const [values, setValues] = useState({
    dateTime: new Date(),
    title: "",
    description: "",
  });
  const [guestAdmissionMode, setGuestAdmissionMode] =
    useState<"open" | "approval">("approval");
  const client = useStreamVideoClient();
  const { user } = useUser();

  const createMeeting = async () => {
    try {
      if (!user || !client) return;
      setCreating(true);
      const id = uuidv4();
      const call = client.call("default", id);
      await prepareCallDevices(call);
      await withStreamConnectionRetry(client, () =>
        call.getOrCreate({
          data: {
            starts_at: new Date().toISOString(),
            members: [{ user_id: user.id, role: "admin" }],
            custom: {
              description: "Instant Meeting",
              owner_id: user.id,
            },
            settings_override: {
              frame_recording: { mode: "available", quality: "720p", capture_interval_in_seconds: 2 },
              individual_recording: { mode: "available" },
            },
          },
        }),
      );
      if (!call?.id) {
        console.error("createMeeting: call created without an id");
        toast.error("Couldn't start the meeting. Please try again.");
        setCreating(false);
        return;
      }
      setCallDetails(call);
      // Persist a Supabase meetings row so the meeting shows in Meeting
      // Intelligence immediately. Best-effort: the Stream call is already
      // created, so a DB failure must not block the user.
      try {
        const result = await createScheduledMeetingRow({
          streamCallId: call.id,
          title: "Instant Meeting",
          startsAt: new Date().toISOString(),
          guestAdmissionMode,
        });
        if (!result.ok) {
          console.error("Instant meeting row not persisted:", result.error);
        }
      } catch (dbErr) {
        console.error("Instant meeting row not persisted:", dbErr);
      }
      await copyMeetingLink(call, "Meeting ready. Link copied to clipboard");
      setCreating(false);
    } catch (error) {
      console.error("Error occured in creating meeting", error);
      toast.error("Couldn't start the meeting. Check your connection and try again.");
      setCreating(false);
    }
  };

  const ScheduleMeeting = async () => {
    try {
      if (!user || !client) return;
      if (!values.title?.trim()) {
        toast("Please add a meeting title");
        return;
      }
      if (!values.dateTime) {
        toast("Please Select Date and Time");
        return;
      }
      const startsAt = values.dateTime.toISOString();
      const title = values.title.trim();
      const description = values.description || "";
      const id = uuidv4();
      const call = client.call("default", id);
      await prepareCallDevices(call);
      await withStreamConnectionRetry(client, () =>
        call.getOrCreate({
          data: {
            starts_at: startsAt,
            members: [{ user_id: user.id, role: "admin" }],
            custom: {
              title,
              description,
              owner_id: user.id,
            },
            settings_override: {
              frame_recording: { mode: "available", quality: "720p", capture_interval_in_seconds: 2 },
              individual_recording: { mode: "available" },
            },
          },
        }),
      );
      setCallDetails(call);

      // Persist a Supabase meetings row at schedule time so the meeting shows in
      // Meeting Intelligence with its real title immediately. Best-effort: the
      // Stream call is already created, so a DB failure must not block the user.
      try {
        const result = await createScheduledMeetingRow({
          streamCallId: call.id,
          title,
          startsAt,
          guestAdmissionMode,
        });
        if (!result.ok) {
          console.error("Scheduled meeting row not persisted:", result.error);
        }
      } catch (dbErr) {
        console.error("Scheduled meeting row not persisted:", dbErr);
      }
    } catch (error) {
      console.error("Error occur in scheduling meeting", error);
      toast.error("Couldn't schedule the meeting. Check your connection and try again.");
    }
  };

  return (
    <div className="flex w-full items-center justify-center">
      <ModalBody onClose={onClose}>
        <ModalContent>
          <h4 className="mb-6 text-center text-lg font-bold text-on-surface md:text-2xl">
            {isCreated
              ? type === "isInstantMeeting"
                ? "Your meeting is ready"
                : "Meeting"
              : type === "isInstantMeeting"
                ? "Start an instant meeting"
                : type === "isJoinMeeting"
                  ? "Join meeting via"
                  : "Schedule your meeting for"}
            <span className="px-1 py-0.5 rounded-md border border-primary-container bg-primary-container text-on-primary">
              {isCreated
                ? type === "isInstantMeeting"
                  ? "Ready"
                  : "Created"
                : type === "isInstantMeeting"
                  ? "NOW"
                  : type === "isJoinMeeting"
                    ? "LINK"
                    : "NOW"}
            </span>
          </h4>
          {type === "isInstantMeeting" && !callDetails && (
            <div className="flex flex-col gap-4">
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
              {/* Guest admission mode — owner chooses before creating */}
              <div className="flex flex-col gap-2">
                <label className="text-base font-normal leading-[22.4px] text-on-surface-variant text-center">
                  Guest Admission
                </label>
                <div className="flex gap-2 justify-center">
                  <button
                    type="button"
                    onClick={() => setGuestAdmissionMode("open")}
                    disabled={guestAdmissionMode === "open"}
                    className={`rounded-lg px-4 py-2 text-body-md font-medium transition-colors ${
                      guestAdmissionMode === "open"
                        ? "bg-primary-container text-on-primary"
                        : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                    } disabled:opacity-60`}
                  >
                    Anyone can join
                  </button>
                  <button
                    type="button"
                    onClick={() => setGuestAdmissionMode("approval")}
                    disabled={guestAdmissionMode === "approval"}
                    className={`rounded-lg px-4 py-2 text-body-md font-medium transition-colors ${
                      guestAdmissionMode === "approval"
                        ? "bg-primary-container text-on-primary"
                        : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                    } disabled:opacity-60`}
                  >
                    Approval required
                  </button>
                </div>
              </div>
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
                  Meeting title
                </label>
                <input
                  type="text"
                  value={values.title}
                  onChange={(e) =>
                    setValues({ ...values, title: e.target.value })
                  }
                  placeholder="e.g. Weekly product sync"
                  className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3 text-on-surface placeholder:text-on-surface-variant focus:outline-none"
                />
              </div>
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
              {/* Guest admission mode — owner chooses before scheduling */}
              <div className="flex flex-col gap-2 mt-4">
                <label className="text-base font-normal leading-[22.4px] text-on-surface-variant">
                  Guest Admission
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setGuestAdmissionMode("open")}
                    disabled={guestAdmissionMode === "open"}
                    className={`rounded-lg px-4 py-2 text-body-md font-medium transition-colors ${
                      guestAdmissionMode === "open"
                        ? "bg-primary-container text-on-primary"
                        : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                    } disabled:opacity-60`}
                  >
                    Anyone can join
                  </button>
                  <button
                    type="button"
                    onClick={() => setGuestAdmissionMode("approval")}
                    disabled={guestAdmissionMode === "approval"}
                    className={`rounded-lg px-4 py-2 text-body-md font-medium transition-colors ${
                      guestAdmissionMode === "approval"
                        ? "bg-primary-container text-on-primary"
                        : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                    } disabled:opacity-60`}
                  >
                    Approval required
                  </button>
                </div>
              </div>
            </>
          )}
          {isCreated && (
            <div className="mt-6 flex w-full flex-col items-center gap-3 px-2 text-center sm:mt-10">
              <p className="text-base font-medium text-on-surface">
                {type === "isInstantMeeting"
                  ? "Your meeting is ready"
                  : "Your meeting is scheduled"}
              </p>
              {type === "isScheduleMeeting" && values.title?.trim() && (
                <p className="text-sm text-on-surface-variant">
                  {values.title.trim()}
                </p>
              )}
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
          {isCreated && (
            <button
              className="w-full rounded-md border border-outline-variant bg-surface-container-lowest px-2 py-2 text-sm text-on-surface hover:bg-surface-container-low sm:w-28"
              onClick={() => {
                if (callDetails?.id)
                  router.push(`/meeting/${callDetails.id}`);
              }}
            >
              Join
            </button>
          )}
          <button
            className="w-full rounded-md border border-primary-container bg-primary-container px-2 py-2 text-sm text-on-primary hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60 sm:w-28"
            onClick={() => handleClick({ type })}
            disabled={creating}
            aria-busy={creating}
          >
            {isCreated
              ? "Copy link"
              : type === "isInstantMeeting"
                ? "Create Now"
                : type === "isJoinMeeting"
                  ? "Join"
                  : "Schedule"}
          </button>
        </ModalFooter>
      </ModalBody>
    </div>
  );
};

export default MeetingModel;
