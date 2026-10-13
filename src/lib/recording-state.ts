// Stream keeps the individual recorder ("call_raw_recorder:individual") "started"
// server-side for a call id even after the call session ends, if the owner left
// without pressing Stop. Rejoining that same call and pressing record then throws
// "recording ... is already started" (coordinator error code 4). This helper
// detects that exact case so the UI can treat it as "already recording" instead of
// a hard failure. It is a pure function so the detection is unit-testable without
// mounting the Stream call object.

const ALREADY_STARTED_RE = /already started/i;

export function isAlreadyRecordingError(err: unknown): boolean {
  if (!err) return false;
  // Coordinator error code 4 == "StartRecording failed ... already started".
  const code = (err as { code?: number })?.code;
  if (code === 4) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return ALREADY_STARTED_RE.test(msg);
}
