import { describe, expect, it } from "vitest";
import { isAlreadyRecordingError } from "@/lib/recording-state";

// Regression test for the "already started" recording edge case (D3.4 /debug):
// when the owner leaves a call without stopping the recording, Stream keeps the
// individual recorder "started" for that call id, so a rejoin + record throws
// "recording ... is already started". We must detect that exact case and treat
// it as already recording, not as a hard failure.

describe("isAlreadyRecordingError", () => {
  it("matches the real Stream coordinator message (rejoin with orphaned recording)", () => {
    const err = new Error(
      'recording "call_raw_recorder:individual" is already started',
    );
    expect(isAlreadyRecordingError(err)).toBe(true);
  });

  it("matches coordinator error code 4 even without the message text", () => {
    expect(isAlreadyRecordingError({ code: 4, message: "StartRecording failed" })).toBe(
      true,
    );
  });

  it("does NOT match an unrelated recording error (must still surface)", () => {
    const err = new Error("not allowed to start recording for this call");
    expect(isAlreadyRecordingError(err)).toBe(false);
  });

  it("does NOT match a non-recording error", () => {
    expect(isAlreadyRecordingError(new Error("network timeout"))).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isAlreadyRecordingError(null)).toBe(false);
    expect(isAlreadyRecordingError(undefined)).toBe(false);
  });
});
