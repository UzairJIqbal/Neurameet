/* eslint-disable prettier/prettier */
import "server-only";
import { StreamClient } from "@stream-io/node-sdk";

// Minimal shape for the Stream queryCalls response items (the SDK's full type
// is awkward to map here). Kept explicit so we avoid `any`.
type StreamCallItem = {
  id?: string;
  type?: string;
  call?: { id: string; type: string };
};

export type RecordingItem = Record<string, unknown> & {
  call_id: string;
  call_type: string;
};

// Recordings change rarely within a session, and each fetch fans out to the
// Stream Video API (one call per meeting). Cache per user for a short window so
// repeat questions in the same conversation don't re-hit that API (which both
// adds latency and can flake under load).
const RECORDINGS_CACHE_TTL_MS = 60_000;
const recordingsCache = new Map<
  string,
  { expiry: number; value: RecordingItem[] }
>();

export type RecordingsResult = { ok: boolean; recordings: RecordingItem[] };

// Returns every recording across the calls this user created (owner-only, per
// D3.4 recording access control). Calls the Stream Video API: queryCalls for
// the user's calls, then listRecordings per call. `ok` is false when Stream is
// unconfigured or unreachable, so callers can tell an outage from "no
// recordings". A failed per-call lookup keeps the partial list but skips the
// cache, so the next request retries instead of serving it for the full TTL.
export async function fetchUserRecordings(
  userId: string,
): Promise<RecordingsResult> {
  const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
  const secretKey = process.env.STREAM_SECRET_KEY;

  if (!apiKey || !secretKey) {
    console.error("getUserRecordings: missing Stream API keys");
    return { ok: false, recordings: [] };
  }

  try {
    const client = new StreamClient(apiKey, secretKey);

    const cached = recordingsCache.get(userId);
    if (cached && Date.now() < cached.expiry) {
      return { ok: true, recordings: cached.value };
    }

    const callsResponse = await client.video.queryCalls({
      filter_conditions: {
        created_by_user_id: userId,
      },
      limit: 100,
      sort: [{ field: "created_at", direction: -1 }],
    });

    const calls = callsResponse.calls || [];
    let partial = false;

    const allRecordings = await Promise.all(
      calls.map(async (call: StreamCallItem) => {
        const callObj = call.call ?? call;
        const callId = callObj.id;
        const callType = callObj.type;
        if (!callId || !callType) return [];

        try {
          const recordingsResponse = await client.video.listRecordings({
            type: callType,
            id: callId,
          });
          const recordings = recordingsResponse.recordings || [];

          return recordings.map((recording) => {
            // Stream recordings have no top-level `id` — they are identified by
            // session_id + filename. Synthesize a stable, unique id from Stream's
            // real identifier so the delete path (which matches on `id`) works.
            // Prefer any existing id (future-proofing) but never leave it undefined.
            const sessionId = (recording as { session_id?: string }).session_id ?? "";
            const filename = (recording as { filename?: string }).filename ?? "";
            const existingId = (recording as { id?: string }).id;
            return {
              ...recording,
              id: existingId ?? `${callId}:${sessionId}:${filename}`,
              call_id: callId,
              call_type: callType,
            };
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`getUserRecordings: call ${callId}: ${msg}`);
          partial = true;
          return [];
        }
      }),
    );

    const result = allRecordings.flat();
    if (!partial) {
      recordingsCache.set(userId, {
        expiry: Date.now() + RECORDINGS_CACHE_TTL_MS,
        value: result,
      });
    }
    return { ok: true, recordings: result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("getUserRecordings: API error:", msg);
    return { ok: false, recordings: [] };
  }
}

// Same list, empty on failure, for callers that only need best-effort data.
export async function getUserRecordings(
  userId: string,
): Promise<RecordingItem[]> {
  return (await fetchUserRecordings(userId)).recordings;
}

// Owner-only delete: only the user's own recordings (resolved through
// getUserRecordings, which filters by created_by_user_id) can be matched, so a
// missing id means "not yours / not found". Removes the recording via the
// Stream Video API and invalidates the per-user cache so the next list is fresh.
export async function deleteUserRecording(
  userId: string,
  recordingId: string,
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
  const secretKey = process.env.STREAM_SECRET_KEY;

  if (!apiKey || !secretKey) {
    return { ok: false, error: "Stream not configured" };
  }

  try {
    const { ok, recordings } = await fetchUserRecordings(userId);
    if (!ok) return { ok: false, error: "Recordings unavailable" };
    const rec = recordings.find((r) => r.id === recordingId);
    if (!rec) return { ok: false, error: "Recording not found" };

    const sessionId = rec.session_id as string | undefined;
    const filename = rec.filename as string;
    const client = new StreamClient(apiKey, secretKey);
    await client.video.deleteRecording({
      type: rec.call_type,
      id: rec.call_id,
      session: sessionId ?? "",
      filename,
    });

    recordingsCache.delete(userId);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("deleteUserRecording: API error:", msg);
    return { ok: false, error: msg };
  }
}
