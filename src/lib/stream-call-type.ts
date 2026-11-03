// Stream call types used by NeuraMeet (spec 0004, child 0004-project-meetings).
// `project` is the members only call type: `user` and `guest` have no
// `join-call`, so only people our server adds as call members can join.
// Browser safe: no server imports.

export const DEFAULT_CALL_TYPE = "default";
export const PROJECT_CALL_TYPE = "project";

export type StreamCallType =
  typeof DEFAULT_CALL_TYPE | typeof PROJECT_CALL_TYPE;

export function isStreamCallType(value: unknown): value is StreamCallType {
  return value === DEFAULT_CALL_TYPE || value === PROJECT_CALL_TYPE;
}

// The type a new meeting gets. The server decides it when it saves the row;
// the browser only reads it back.
export function callTypeForNewMeeting(
  projectId: string | null,
): StreamCallType {
  return projectId ? PROJECT_CALL_TYPE : DEFAULT_CALL_TYPE;
}
