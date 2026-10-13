/* eslint-disable prettier/prettier */
"use server";

import "server-only";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import {
  MEETING_CATEGORIES,
  type MeetingCategory,
  type GuestAdmissionMode,
} from "@/lib/meeting-types";

export type UpdateCategoryResult = { ok: true } | { ok: false; error: string };

export type CreateMeetingRowResult =
  | { ok: true }
  | { ok: false; error: string };

// Persist a Supabase meetings row at schedule time so the scheduled meeting
// appears in Meeting Intelligence with its real title immediately, rather than
// only after the first attendance join. Scheduled meetings store their title in
// the Stream call's custom.title; this writes it into meetings.title.
// Re-scheduling the same call id updates the caller's own row; a row owned by
// someone else is never touched, so a known call id cannot take over ownership.
export async function createScheduledMeetingRow(params: {
  streamCallId: string;
  title: string;
  startsAt: string;
  guestAdmissionMode?: GuestAdmissionMode;
}): Promise<CreateMeetingRowResult> {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, error: "Unauthorized" };
  }

  const title = params.title?.trim();
  if (!params.streamCallId || !title) {
    return { ok: false, error: "Missing call id or title" };
  }

  try {
    const supabase = supabaseServer();
    const fields = {
      title,
      status: "scheduled",
      started_at: params.startsAt,
      guest_admission_mode: params.guestAdmissionMode ?? "approval",
    };

    const { data: existing, error: findError } = await supabase
      .from("meetings")
      .select("id, user_id")
      .eq("stream_call_id", params.streamCallId)
      .maybeSingle();

    if (findError) {
      console.error("createScheduledMeetingRow lookup failed:", findError);
      return { ok: false, error: "Failed to save meeting" };
    }
    if (existing && existing.user_id !== userId) {
      return { ok: false, error: "Not authorized" };
    }

    const { error } = existing
      ? await supabase.from("meetings").update(fields).eq("id", existing.id)
      : await supabase.from("meetings").insert({
          ...fields,
          user_id: userId,
          stream_call_id: params.streamCallId,
        });

    if (error) {
      console.error("createScheduledMeetingRow failed:", error);
      return { ok: false, error: "Failed to save meeting" };
    }

    return { ok: true };
  } catch (err) {
    console.error("createScheduledMeetingRow error:", err);
    return { ok: false, error: "Failed to save meeting" };
  }
}

export async function updateMeetingCategory(
  meetingId: string,
  category: MeetingCategory,
): Promise<UpdateCategoryResult> {
  if (!MEETING_CATEGORIES.includes(category)) {
    return { ok: false, error: "Invalid category" };
  }

  const { userId } = await auth();
  if (!userId) {
    return { ok: false, error: "Unauthorized" };
  }

  try {
    const supabase = supabaseServer();

    // Ownership check — the meeting must belong to one of the user's meetings
    const { data: meetings, error: meetingsError } = await supabase
      .from("meetings")
      .select("id")
      .eq("user_id", userId);

    if (meetingsError) {
      console.error("Failed to load meetings:", meetingsError);
      return { ok: false, error: "Update failed" };
    }

    const meetingIds = (meetings ?? []).map((m) => m.id);
    if (!meetingIds.includes(meetingId)) {
      return { ok: false, error: "Not found" };
    }

    const { error } = await supabase
      .from("meeting_insights")
      .update({ category })
      .eq("meeting_id", meetingId);

    if (error) {
      console.error("Failed to update category:", error);
      return { ok: false, error: "Update failed" };
    }

    revalidatePath(`/meeting-intelligence/${meetingId}`);
    revalidatePath("/meeting-intelligence");
    return { ok: true };
  } catch (err) {
    console.error("updateMeetingCategory error:", err);
    return { ok: false, error: "Update failed" };
  }
}

export async function updateMeetingGuestAdmissionMode(
  meetingId: string,
  mode: GuestAdmissionMode,
): Promise<{ ok: boolean; error?: string }> {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, error: "Unauthorized" };
  }

  if (mode !== "open" && mode !== "approval") {
    return { ok: false, error: "Invalid admission mode" };
  }

  try {
    const supabase = supabaseServer();

    // Ownership check: the meeting must belong to the calling user.
    const { data: meeting, error: findError } = await supabase
      .from("meetings")
      .select("user_id")
      .eq("id", meetingId)
      .single();

    if (findError || !meeting) {
      return { ok: false, error: "Meeting not found" };
    }

    if (meeting.user_id !== userId) {
      return { ok: false, error: "Not authorized" };
    }

    const { error } = await supabase
      .from("meetings")
      .update({ guest_admission_mode: mode })
      .eq("id", meetingId);

    if (error) {
      console.error("Failed to update admission mode:", error);
      return { ok: false, error: "Update failed" };
    }

    revalidatePath(`/meeting-intelligence/${meetingId}`);
    revalidatePath(`/after-meeting/${meetingId}`);
    return { ok: true };
  } catch (err) {
    console.error("updateMeetingGuestAdmissionMode error:", err);
    return { ok: false, error: "Update failed" };
  }
}
