/* eslint-disable prettier/prettier */
"use server";

import "server-only";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import {
  MEETING_CATEGORIES,
  type MeetingCategory,
} from "@/lib/meeting-types";

export type UpdateCategoryResult = { ok: true } | { ok: false; error: string };

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
