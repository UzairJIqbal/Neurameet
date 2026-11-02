/* eslint-disable prettier/prettier */
import "server-only";
import { StreamClient } from "@stream-io/node-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase-server";
import {
  checkMeetingAccess,
  isProjectRole,
  NEED_ROLES,
  ProjectAccessError,
  type MeetingAccessRow,
  type ProjectRole,
} from "@/lib/project-auth";

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

// Per call cache for project meeting recordings (who may see them is decided
// per request by loadProjectCallAccess, so caching the Stream list is safe).
const projectCallCache = new Map<
  string,
  { expiry: number; value: RecordingItem[] }
>();

export type RecordingsResult = { ok: boolean; recordings: RecordingItem[] };

// Phase W (spec 0004): project meeting recordings follow the project role
// matrix, not the Stream call creator. Read on every request (no role cache),
// so a removed member loses access immediately even though the Stream list
// below is cached.
type ProjectCallAccess = {
  // Stream call id -> caller's role, for meetings of the caller's active projects.
  roleByCall: Map<string, ProjectRole>;
  // Stream call id -> project id, for project meetings the caller created
  // (their access is decided by the project role, never by being the creator).
  createdProjectCalls: Map<string, string>;
  roleByProject: Map<string, ProjectRole>;
};

const PROJECT_CALL_LIMIT = 100;

async function loadProjectCallAccess(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProjectCallAccess> {
  const [members, created] = await Promise.all([
    supabase
      .from("project_members")
      .select("project_id, role")
      .eq("user_id", userId)
      .is("removed_at", null),
    supabase
      .from("meetings")
      .select("stream_call_id, project_id")
      .eq("user_id", userId)
      .not("project_id", "is", null),
  ]);
  if (members.error) throw members.error;
  if (created.error) throw created.error;

  const roleByProject = new Map<string, ProjectRole>();
  for (const row of (members.data ?? []) as { project_id: string; role: unknown }[]) {
    if (isProjectRole(row.role)) roleByProject.set(row.project_id, row.role);
  }

  const roleByCall = new Map<string, ProjectRole>();
  if (roleByProject.size > 0) {
    const { data, error } = await supabase
      .from("meetings")
      .select("stream_call_id, project_id")
      .in("project_id", [...roleByProject.keys()])
      .order("created_at", { ascending: false })
      .limit(PROJECT_CALL_LIMIT);
    if (error) throw error;
    for (const row of (data ?? []) as { stream_call_id: string; project_id: string }[]) {
      const role = roleByProject.get(row.project_id);
      if (role) roleByCall.set(row.stream_call_id, role);
    }
  }

  const createdProjectCalls = new Map<string, string>();
  for (const row of (created.data ?? []) as { stream_call_id: string; project_id: string }[]) {
    createdProjectCalls.set(row.stream_call_id, row.project_id);
  }
  return { roleByCall, createdProjectCalls, roleByProject };
}

// Lists one call's recordings, each with a stable synthesized id.
async function listCallRecordings(
  client: StreamClient,
  callType: string,
  callId: string,
): Promise<RecordingItem[]> {
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
}

// Recordings of project meetings the caller may see (content need: Owner,
// Admin, Developer) that are not among the caller's own created calls.
async function fetchProjectRecordings(
  client: StreamClient,
  access: ProjectCallAccess,
  skip: Set<string>,
): Promise<{ recordings: RecordingItem[]; partial: boolean }> {
  let partial = false;
  const callIds = [...access.roleByCall.entries()]
    .filter(([callId, role]) => !skip.has(callId) && NEED_ROLES.content.includes(role))
    .map(([callId]) => callId);
  const lists = await Promise.all(
    callIds.map(async (callId) => {
      const cached = projectCallCache.get(callId);
      if (cached && Date.now() < cached.expiry) return cached.value;
      try {
        const value = await listCallRecordings(client, "default", callId);
        projectCallCache.set(callId, {
          expiry: Date.now() + RECORDINGS_CACHE_TTL_MS,
          value,
        });
        return value;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`getUserRecordings: project call ${callId}: ${msg}`);
        partial = true;
        return [];
      }
    }),
  );
  return { recordings: lists.flat(), partial };
}

// Keeps a created call's recordings unless it is a project meeting the caller
// no longer has content access to.
function canSeeCreatedCall(callId: string, access: ProjectCallAccess): boolean {
  const projectId = access.createdProjectCalls.get(callId);
  if (!projectId) return true;
  const role = access.roleByProject.get(projectId);
  return role !== undefined && NEED_ROLES.content.includes(role);
}

// Returns every recording across the calls this user created (owner-only, per
// D3.4 recording access control), plus the recordings of project meetings the
// caller has content access to (Owner, Admin, Developer). A created call that
// is a project meeting follows the project role, not the creator rule. Calls the Stream Video API: queryCalls for
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
    const access = await loadProjectCallAccess(supabaseServer(), userId);

    const created = await fetchCreatedRecordings(client, userId);
    const own = created.recordings.filter((r) => canSeeCreatedCall(r.call_id, access));
    const createdIds = new Set(created.recordings.map((r) => r.call_id));
    for (const callId of access.createdProjectCalls.keys()) createdIds.add(callId);
    const project = await fetchProjectRecordings(client, access, createdIds);

    const byId = new Map<unknown, RecordingItem>();
    for (const rec of [...own, ...project.recordings]) byId.set(rec.id, rec);
    return { ok: true, recordings: [...byId.values()] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("getUserRecordings: API error:", msg);
    return { ok: false, recordings: [] };
  }
}

// The recordings of every call this user created on Stream (cached per user).
async function fetchCreatedRecordings(
  client: StreamClient,
  userId: string,
): Promise<{ recordings: RecordingItem[] }> {
  const cached = recordingsCache.get(userId);
  if (cached && Date.now() < cached.expiry) {
    return { recordings: cached.value };
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
        return await listCallRecordings(client, callType, callId);
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
  return { recordings: result };
}

// Same list, empty on failure, for callers that only need best-effort data.
export async function getUserRecordings(
  userId: string,
): Promise<RecordingItem[]> {
  return (await fetchUserRecordings(userId)).recordings;
}

export type DeleteRecordingResult = {
  ok: boolean;
  error?: string;
  status?: 403 | 404 | 500;
};

// Owner-only delete: only the user's own recordings (resolved through
// getUserRecordings, which filters by created_by_user_id) can be matched, so a
// missing id means "not yours / not found". A project meeting's recording
// needs the manage role instead (Owner or Admin; non member 404, other roles
// 403). Removes the recording via the Stream Video API and invalidates the
// caches so the next list is fresh.
export async function deleteUserRecording(
  userId: string,
  recordingId: string,
): Promise<DeleteRecordingResult> {
  const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
  const secretKey = process.env.STREAM_SECRET_KEY;

  if (!apiKey || !secretKey) {
    return { ok: false, error: "Stream not configured" };
  }

  try {
    const client = new StreamClient(apiKey, secretKey);
    const rec = await findDeletableRecording(client, userId, recordingId);
    if (!rec) return { ok: false, error: "Recording not found", status: 404 };

    const sessionId = rec.session_id as string | undefined;
    const filename = rec.filename as string;
    await client.video.deleteRecording({
      type: rec.call_type,
      id: rec.call_id,
      session: sessionId ?? "",
      filename,
    });

    recordingsCache.delete(userId);
    projectCallCache.delete(rec.call_id);
    return { ok: true };
  } catch (err) {
    if (err instanceof ProjectAccessError) {
      return { ok: false, error: err.message, status: err.status };
    }
    if (err instanceof RecordingsUnavailableError) {
      return { ok: false, error: err.message };
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("deleteUserRecording: API error:", msg);
    return { ok: false, error: msg };
  }
}

class RecordingsUnavailableError extends Error {
  constructor() {
    super("Recordings unavailable");
  }
}

// Resolves the recording the caller may delete, or null when there is none.
// Throws ProjectAccessError when a project meeting's role check fails.
async function findDeletableRecording(
  client: StreamClient,
  userId: string,
  recordingId: string,
): Promise<RecordingItem | null> {
  const supabase = supabaseServer();
  const callId = recordingId.split(":")[0];
  const { data: meeting, error } = await supabase
    .from("meetings")
    .select("id, user_id, project_id")
    .eq("stream_call_id", callId)
    .maybeSingle();
  if (error) throw error;

  const row = meeting as MeetingAccessRow | null;
  if (row?.project_id) {
    await checkMeetingAccess(supabase, userId, row, "manage", {
      notFoundMessage: "Recording not found",
    });
    const recordings = await listCallRecordings(client, "default", callId);
    return recordings.find((r) => r.id === recordingId) ?? null;
  }

  const { ok, recordings } = await fetchUserRecordings(userId);
  if (!ok) throw new RecordingsUnavailableError();
  return recordings.find((r) => r.id === recordingId && r.call_id === callId) ?? null;
}
