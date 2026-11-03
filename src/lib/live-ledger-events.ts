import "server-only";
import { StreamClient } from "@stream-io/node-sdk";
import { EVENT_MAX_BYTES, type LiveLedgerEvent } from "@/lib/live-ledger-types";
import { supabaseServer } from "@/lib/supabase-server";
import { streamCallTypeFor } from "@/lib/stream-call-type-server";
import type { StreamCallType } from "@/lib/stream-call-type";

export const eventByteSize = (custom: LiveLedgerEvent): number =>
  Buffer.byteLength(JSON.stringify(custom), "utf8");

function streamClient(): StreamClient | null {
  const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
  const secret = process.env.STREAM_SECRET_KEY;
  return apiKey && secret ? new StreamClient(apiKey, secret) : null;
}

/** The stored Stream call type for this call id (W3), or null on a DB error. */
async function callTypeOf(callId: string): Promise<StreamCallType | null> {
  try {
    return await streamCallTypeFor(supabaseServer(), callId);
  } catch (err) {
    console.error("[live-ledger] call type lookup failed", { callId, err });
    return null;
  }
}

/**
 * Send one Live Ledger custom event to everyone in the call, as the owner
 * (spec 0002). Server side auth needs `user_id`, or Stream rejects the send.
 * Refuses anything over EVENT_MAX_BYTES (Stream caps custom events at 5 KB).
 * Never throws: returns false and logs, so the route can answer 502.
 */
export async function sendLiveLedgerEvent(
  callId: string,
  ownerId: string,
  custom: LiveLedgerEvent,
): Promise<boolean> {
  const size = eventByteSize(custom);
  if (size > EVENT_MAX_BYTES) {
    console.error("[live-ledger] event too large, not sent", {
      callId,
      event: custom.event,
      size,
    });
    return false;
  }
  const client = streamClient();
  if (!client) {
    console.error("[live-ledger] Stream keys missing, event not sent");
    return false;
  }
  const type = await callTypeOf(callId);
  if (!type) return false;
  try {
    await client.video.sendCallEvent({
      type,
      id: callId,
      user_id: ownerId,
      custom: custom as unknown as Record<string, unknown>,
    });
    return true;
  } catch (err) {
    console.error("[live-ledger] event send failed", {
      callId,
      event: custom.event,
      err,
    });
    return false;
  }
}

/** Stream's count of people in the call, or null when the query fails. */
export async function countCallParticipants(
  callId: string,
): Promise<number | null> {
  const client = streamClient();
  if (!client) return null;
  const type = await callTypeOf(callId);
  if (!type) return null;
  try {
    const res = await client.video.queryCallParticipants({
      type,
      id: callId,
    });
    return res.total_participants;
  } catch (err) {
    console.error("[live-ledger] participant count failed", { callId, err });
    return null;
  }
}
