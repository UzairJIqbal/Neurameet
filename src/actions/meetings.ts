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
import { NEED_ROLES, requireProjectRole } from "@/lib/project-auth";
import {
  callTypeForNewMeeting,
  DEFAULT_CALL_TYPE,
  isStreamCallType,
  type StreamCallType,
} from "@/lib/stream-call-type";

export type UpdateCategoryResult = { ok: true } | { ok: false; error: string };

export type CreateMeetingRowResult =
  // callType is the Stream call type the saved row holds (W3).
  | { ok: true; callType: StreamCallType }
  | { ok: false; error: string };

// Persist a Supabase meetings row at schedule time so the scheduled meeting
// appears in Meeting Intelligence with its real title immediately, rather than
// only after the first attendance join. Scheduled meetings store their title in
// the Stream call's custom.title; this writes it into meetings.title.
// Re-scheduling the same call id updates the caller's own row; a row owned by
// someone else is never touched, so a known call id cannot take over ownership.
// W3: a `projectId` needs Developer or higher in that project; the server picks
// the Stream call type from it. A re schedule never changes project_id or
// stream_call_type (moving a meeting in is the W4 route only).
export async function createScheduledMeetingRow(params: {
  streamCallId: string;
  title: string;
  startsAt: string;
  guestAdmissionMode?: GuestAdmissionMode;
  projectId?: string | null;
}): Promise<CreateMeetingRowResult> {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, error: "Unauthorized" };
  }

  const title = params.title?.trim();
  if (!params.streamCallId || !title) {
    return { ok: false, error: "Missing call id or title" };
  }

  const projectId = params.projectId || null;

  try {
    const supabase = supabaseServer();
    if (projectId) {
      try {
        await requireProjectRole(supabase, userId, projectId, NEED_ROLES.content);
      } catch {
        return { ok: false, error: "Not authorized" };
      }
    }
    const fields = {
      title,
      status: "scheduled",
      started_at: params.startsAt,
      guest_admission_mode: params.guestAdmissionMode ?? "approval",
    };

    const { data: existing, error: findError } = await supabase
      .from("meetings")
      .select("id, user_id, stream_call_type")
      .eq("stream_call_id", params.streamCallId)
      .maybeSingle();

    if (findError) {
      console.error("createScheduledMeetingRow lookup failed:", findError);
      return { ok: false, error: "Failed to save meeting" };
    }
    if (existing && existing.user_id !== userId) {
      return { ok: false, error: "Not authorized" };
    }

    const callType: StreamCallType = existing
      ? isStreamCallType(existing.stream_call_type)
        ? existing.stream_call_type
        : DEFAULT_CALL_TYPE
      : callTypeForNewMeeting(projectId);

    const { error } = existing
      ? await supabase.from("meetings").update(fields).eq("id", existing.id)
      : await supabase.from("meetings").insert({
          ...fields,
          user_id: userId,
          stream_call_id: params.streamCallId,
          project_id: projectId,
          stream_call_type: callType,
        });

    if (error) {
      console.error("createScheduledMeetingRow failed:", error);
      return { ok: false, error: "Failed to save meeting" };
    }

    return { ok: true, callType };
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
