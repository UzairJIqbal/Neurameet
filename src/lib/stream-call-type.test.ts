import { describe, it, expect, vi } from "vitest";
import { ok, queue, resetQueues, client } from "@/test/supabase-queue-mock";

vi.mock("server-only", () => ({}));

import {
  callTypeForNewMeeting,
  isStreamCallType,
} from "@/lib/stream-call-type";
import {
  callTypeOfRow,
  streamCallTypeFor,
} from "@/lib/stream-call-type-server";

describe("stream call type helpers (W3)", () => {
  it("accepts only the two known call types", () => {
    expect(isStreamCallType("default")).toBe(true);
    expect(isStreamCallType("project")).toBe(true);
    expect(isStreamCallType("livestream")).toBe(false);
    expect(isStreamCallType(null)).toBe(false);
  });

  it("picks project for a project meeting and default otherwise", () => {
    expect(callTypeForNewMeeting("p1")).toBe("project");
    expect(callTypeForNewMeeting(null)).toBe("default");
  });

  it("reads the type off a row, falling back to default", () => {
    expect(callTypeOfRow({ stream_call_type: "project" })).toBe("project");
    expect(callTypeOfRow({ stream_call_type: "weird" })).toBe("default");
    expect(callTypeOfRow(null)).toBe("default");
  });

  it("looks the type up by Stream call id, default when no row", async () => {
    resetQueues();
    queue("meetings", ok({ stream_call_type: "project" }), ok(null));
    expect(await streamCallTypeFor(client as never, "call_1")).toBe("project");
    expect(await streamCallTypeFor(client as never, "call_2")).toBe("default");
  });

  it("throws on a lookup error instead of guessing default", async () => {
    resetQueues();
    queue("meetings", { data: null, error: { message: "db down" } });
    await expect(
      streamCallTypeFor(client as never, "call_1"),
    ).rejects.toBeTruthy();
  });
});
