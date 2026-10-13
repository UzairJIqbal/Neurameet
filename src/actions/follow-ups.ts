/* eslint-disable prettier/prettier */
"use server";

import "server-only";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import type { FollowUpStatus } from "@/lib/meeting-types";

const VALID_STATUS = new Set<FollowUpStatus>([
  "pending",
  "needs_attention",
  "completed",
]);

export type UpdateFollowUpResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateFollowUpStatus(
  id: string,
  status: FollowUpStatus,
): Promise<UpdateFollowUpResult> {
  if (!VALID_STATUS.has(status)) {
    return { ok: false, error: "Invalid status" };
  }

  const { userId } = await auth();
  if (!userId) {
    return { ok: false, error: "Unauthorized" };
  }

  try {
    const supabase = supabaseServer();

    // Ownership check — the follow-up must belong to one of the user's meetings
    const { data: meetings, error: meetingsError } = await supabase
      .from("meetings")
      .select("id")
      .eq("user_id", userId);

    if (meetingsError) {
      console.error("Failed to load meetings:", meetingsError);
      return { ok: false, error: "Update failed" };
    }

    const meetingIds = (meetings ?? []).map((m) => m.id);
    const { data: fu, error: fuError } = await supabase
      .from("follow_ups")
      .select("id")
      .eq("id", id)
      .in("meeting_id", meetingIds)
      .maybeSingle();

    if (fuError || !fu) {
      return { ok: false, error: "Not found" };
    }

    const { error } = await supabase
      .from("follow_ups")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      console.error("Failed to update follow-up:", error);
      return { ok: false, error: "Update failed" };
    }

    revalidatePath("/follow-ups");
    revalidatePath(`/follow-ups/${id}`);
    return { ok: true };
  } catch (err) {
    console.error("updateFollowUpStatus error:", err);
    return { ok: false, error: "Update failed" };
  }
}
