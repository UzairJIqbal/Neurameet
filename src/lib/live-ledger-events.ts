import "server-only";
import { StreamClient } from "@stream-io/node-sdk";
import { EVENT_MAX_BYTES, type LiveLedgerEvent } from "@/lib/live-ledger-types";

export const eventByteSize = (custom: LiveLedgerEvent): number =>
  Buffer.byteLength(JSON.stringify(custom), "utf8");

function streamClient(): StreamClient | null {
  const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
  const secret = process.env.STREAM_SECRET_KEY;
  return apiKey && secret ? new StreamClient(apiKey, secret) : null;
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
  try {
    await client.video.sendCallEvent({
      type: "default",
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
  try {
    const res = await client.video.queryCallParticipants({
      type: "default",
      id: callId,
    });
    return res.total_participants;
  } catch (err) {
    console.error("[live-ledger] participant count failed", { callId, err });
    return null;
  }
}
