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
