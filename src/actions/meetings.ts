/* eslint-disable prettier/prettier */
"use server";

import "server-only";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase-server";
import {
  MEETING_CATEGORIES,
  MEETING_DESCRIPTION_MAX,
  PROJECT_MEETING_TYPES,
  type MeetingCategory,
  type GuestAdmissionMode,
  type ProjectMeetingType,
} from "@/lib/meeting-types";
import { notifyMeetingScheduled } from "@/lib/notification-events";
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

type ScheduleDetails = {
  description?: string;
  scheduledEndAt?: string;
  meetingType?: ProjectMeetingType;
  invitedUserIds?: string[];
};

// AC-70u: the wording here is shown to the person scheduling.
function scheduleDetailsError(
  startsAt: string,
  details: ScheduleDetails,
): string | null {
  const { description, scheduledEndAt, meetingType } = details;
  if (description && description.length > MEETING_DESCRIPTION_MAX) {
    return `Keep the description under ${MEETING_DESCRIPTION_MAX} characters`;
  }
  if (
    scheduledEndAt &&
    !(new Date(scheduledEndAt).getTime() > new Date(startsAt).getTime())
  ) {
    return "The end time must be after the start";
  }
  if (meetingType && !PROJECT_MEETING_TYPES.includes(meetingType)) {
    return "Pick a meeting type from the list";
  }
  return null;
}

async function allActiveMembers(
  supabase: SupabaseClient,
  projectId: string,
  userIds: string[],
): Promise<boolean> {
  if (userIds.length === 0) return true;
  const { data, error } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId)
    .in("user_id", userIds)
    .is("removed_at", null);
  if (error) throw error;
  return (data ?? []).length === userIds.length;
}

// Persist a Supabase meetings row at schedule time so the scheduled meeting
// appears in Meeting Intelligence with its real title immediately, rather than
// only after the first attendance join. Scheduled meetings store their title in
// the Stream call's custom.title; this writes it into meetings.title.
// Re-scheduling the same call id updates the caller's own row; a row owned by
// someone else is never touched, so a known call id cannot take over ownership.
// W3: a `projectId` needs Developer or higher in that project; the server picks
// the Stream call type from it. A re schedule never changes project_id or
// stream_call_type (moving a meeting in is the W4 route only).
// W8: the invited list drives display and the notice only, never who may join,
// and a project meeting sends a notice when it is new or its start time moved.
export async function createScheduledMeetingRow(params: {
  streamCallId: string;
  title: string;
  startsAt: string;
  guestAdmissionMode?: GuestAdmissionMode;
  projectId?: string | null;
} & ScheduleDetails): Promise<CreateMeetingRowResult> {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, error: "Unauthorized" };
  }

  const title = params.title?.trim();
  if (!params.streamCallId || !title) {
    return { ok: false, error: "Missing call id or title" };
  }

  const projectId = params.projectId || null;
  const description = params.description?.trim() || undefined;
  const invalid = scheduleDetailsError(params.startsAt, {
    ...params,
    description,
  });
  if (invalid) return { ok: false, error: invalid };

  try {
    const supabase = supabaseServer();
    if (projectId) {
      try {
        await requireProjectRole(supabase, userId, projectId, NEED_ROLES.content);
      } catch {
        return { ok: false, error: "Not authorized" };
      }
    }

    const { data: existing, error: findError } = await supabase
      .from("meetings")
      .select("id, user_id, stream_call_type, project_id, started_at, invited_user_ids")
      .eq("stream_call_id", params.streamCallId)
      .maybeSingle();

    if (findError) {
      console.error("createScheduledMeetingRow lookup failed:", findError);
      return { ok: false, error: "Failed to save meeting" };
    }
    if (existing && existing.user_id !== userId) {
      return { ok: false, error: "Not authorized" };
    }

    const meetingProjectId: string | null = existing
      ? (existing.project_id ?? null)
      : projectId;
    if (meetingProjectId && meetingProjectId !== projectId) {
      try {
        await requireProjectRole(supabase, userId, meetingProjectId, NEED_ROLES.content);
      } catch {
        return { ok: false, error: "Not authorized" };
      }
    }

    const invitedUserIds =
      meetingProjectId && params.invitedUserIds
        ? [...new Set(params.invitedUserIds)]
        : undefined;
    if (
      meetingProjectId &&
      invitedUserIds &&
      !(await allActiveMembers(supabase, meetingProjectId, invitedUserIds))
    ) {
      return { ok: false, error: "Someone on the list is no longer a project member" };
    }

    const fields = {
      title,
      status: "scheduled",
      started_at: params.startsAt,
      guest_admission_mode: params.guestAdmissionMode ?? "approval",
      ...(description !== undefined ? { description } : {}),
      ...(params.scheduledEndAt ? { scheduled_end_at: params.scheduledEndAt } : {}),
      ...(params.meetingType ? { meeting_type: params.meetingType } : {}),
      ...(invitedUserIds ? { invited_user_ids: invitedUserIds } : {}),
    };

    const callType: StreamCallType = existing
      ? isStreamCallType(existing.stream_call_type)
        ? existing.stream_call_type
        : DEFAULT_CALL_TYPE
      : callTypeForNewMeeting(projectId);

    const { data: saved, error } = existing
      ? await supabase
          .from("meetings")
          .update(fields)
          .eq("id", existing.id)
          .select("id")
          .maybeSingle()
      : await supabase
          .from("meetings")
          .insert({
            ...fields,
            user_id: userId,
            stream_call_id: params.streamCallId,
            project_id: projectId,
            stream_call_type: callType,
          })
          .select("id")
          .maybeSingle();

    if (error) {
      console.error("createScheduledMeetingRow failed:", error);
      return { ok: false, error: "Failed to save meeting" };
    }

    // The stored timestamp comes back in another format, so compare instants.
    const startMoved =
      !existing ||
      new Date(existing.started_at).getTime() !==
        new Date(params.startsAt).getTime();
    const meetingId = (saved as { id: string } | null)?.id ?? existing?.id;
    if (meetingProjectId && startMoved && meetingId) {
      const invited: string[] =
        invitedUserIds ?? existing?.invited_user_ids ?? [];
      after(() =>
        notifyMeetingScheduled(supabase, {
          meetingId,
          projectId: meetingProjectId,
          title,
          startsAt: params.startsAt,
          invitedUserIds: invited,
          schedulerId: userId,
        }),
      );
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
