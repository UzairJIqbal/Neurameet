import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_CALL_TYPE,
  isStreamCallType,
  type StreamCallType,
} from "@/lib/stream-call-type";

// The Stream call type stored on a meeting row, looked up by Stream call id.
// No row (a call that was never saved) means `default`. A lookup error throws:
// callers return 500 rather than guess `default` for a members only call.
export async function streamCallTypeFor(
  supabase: SupabaseClient,
  streamCallId: string,
): Promise<StreamCallType> {
  const { data, error } = await supabase
    .from("meetings")
    .select("stream_call_type")
    .eq("stream_call_id", streamCallId)
    .maybeSingle();
  if (error) {
    console.error("[stream-call-type] lookup failed:", error);
    throw new Error("Failed to load meeting call type");
  }
  const value = (data as { stream_call_type?: unknown } | null)
    ?.stream_call_type;
  return isStreamCallType(value) ? value : DEFAULT_CALL_TYPE;
}

// Same rule for a row the route already loaded.
export function callTypeOfRow(
  row: { stream_call_type?: unknown } | null | undefined,
): StreamCallType {
  const value = row?.stream_call_type;
  return isStreamCallType(value) ? value : DEFAULT_CALL_TYPE;
}
