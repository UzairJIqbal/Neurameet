import { Call } from "@stream-io/video-react-sdk";
import { clsx, type ClassValue } from "clsx";
import toast from "react-hot-toast";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function onJoin(callDetails: Call) {
  if (!callDetails?.id) return;
  const MeetingLink = `${process.env.NEXT_PUBLIC_BASE_URL}/meeting/${callDetails?.id}`;
  navigator.clipboard.writeText(MeetingLink);
  toast("Link has been copied");
}

export function getMeetingIdFromLink(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) return "";

  try {
    const url = new URL(trimmedValue);
    const meetingIndex = url.pathname
      .split("/")
      .filter(Boolean)
      .indexOf("meeting");
    if (meetingIndex === -1) return "";

    return url.pathname.split("/").filter(Boolean)[meetingIndex + 1] ?? "";
  } catch {
    const parts = trimmedValue.split("/").filter(Boolean);
    const meetingIndex = parts.indexOf("meeting");
    if (meetingIndex !== -1) return parts[meetingIndex + 1] ?? "";

    return trimmedValue;
  }
}
