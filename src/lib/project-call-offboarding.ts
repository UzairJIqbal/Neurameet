import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { StreamClient } from "@stream-io/node-sdk";
import { PROJECT_CALL_TYPE } from "@/lib/stream-call-type";

export const LIVE_CALL_SCAN_LIMIT = 50;

// W3 (AC-30): when someone leaves or is removed from a project, take them out
// of the project's calls that have not ended yet. Removing the call member
// stops a rejoin; the kick drops a live session. Best effort: the removal is
// already saved in our tables, so every failure is logged and nothing throws.
// Verified against @stream-io/node-sdk 0.7.3 CallApi.updateCallMembers and kickUser.
export async function removeFromLiveProjectCalls(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<void> {
  try {
    const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
    const secret = process.env.STREAM_SECRET_KEY;
    if (!apiKey || !secret) {
      console.error("[project-call-offboarding] missing Stream configuration");
      return;
    }

    const { data, error } = await supabase
      .from("meetings")
      .select("stream_call_id")
      .eq("project_id", projectId)
      .eq("stream_call_type", PROJECT_CALL_TYPE)
      .neq("status", "ended")
      .order("started_at", { ascending: false })
      .limit(LIVE_CALL_SCAN_LIMIT);
    if (error) {
      console.error("[project-call-offboarding] meeting lookup failed:", error);
      return;
    }

    const callIds = ((data ?? []) as { stream_call_id: string | null }[])
      .map((row) => row.stream_call_id)
      .filter((id): id is string => Boolean(id));
    if (callIds.length >= LIVE_CALL_SCAN_LIMIT) {
      console.warn(
        `[project-call-offboarding] ${LIVE_CALL_SCAN_LIMIT} live calls found for project ${projectId}; older ones were skipped`,
      );
    }
    if (callIds.length === 0) return;

    const client = new StreamClient(apiKey, secret);
    const results = await Promise.allSettled(
      callIds.flatMap((callId) => {
        const call = client.video.call(PROJECT_CALL_TYPE, callId);
        return [
          call.updateCallMembers({ remove_members: [userId] }),
          call.kickUser({ user_id: userId }),
        ];
      }),
    );
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        const callId = callIds[Math.floor(index / 2)];
        const step = index % 2 === 0 ? "remove member" : "kick";
        console.error(
          `[project-call-offboarding] ${step} failed for call ${callId}:`,
          result.reason,
        );
      }
    });
  } catch (err) {
    console.error("[project-call-offboarding] failed:", err);
  }
}
