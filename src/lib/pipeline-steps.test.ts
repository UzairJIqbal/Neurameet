import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  claimPipelineStep,
  deriveRecapSteps,
  isStepStale,
  markPipelineStep,
  PIPELINE_STEP_STALE_MS,
} from "./pipeline-steps";

function rpcClient(
  rpc: (name: string, args: Record<string, unknown>) => unknown,
): SupabaseClient {
  return { rpc: vi.fn(rpc) } as unknown as SupabaseClient;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("markPipelineStep", () => {
  it("writes a final step with endedAt, ms, model and source", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const client = rpcClient(async () => ({ error: null }));
    const startedAt = new Date(Date.now() - 1500).toISOString();

    await markPipelineStep(
      client,
      "m1",
      "process",
      { status: "done", startedAt, model: "lite" },
      "webhook",
    );

    const call = vi.mocked(client.rpc).mock.calls[0];
    expect(call[0]).toBe("pipeline_mark");
    const args = call[1] as {
      p_meeting: string;
      p_step: string;
      p_source: string | null;
      p_value: { status: string; ms: number; endedAt: string; model: string };
    };
    expect(args.p_meeting).toBe("m1");
    expect(args.p_step).toBe("process");
    expect(args.p_source).toBe("webhook");
    expect(args.p_value.status).toBe("done");
    expect(args.p_value.model).toBe("lite");
    expect(args.p_value.ms).toBeGreaterThanOrEqual(1500);
    expect(typeof args.p_value.endedAt).toBe("string");
  });

  it("writes a running step without endedAt or ms", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const client = rpcClient(async () => ({ error: null }));

    await markPipelineStep(client, "m1", "recording", {
      status: "running",
      startedAt: new Date().toISOString(),
    });

    const args = vi.mocked(client.rpc).mock.calls[0][1] as {
      p_value: Record<string, unknown>;
      p_source: string | null;
    };
    expect(args.p_value.endedAt).toBeUndefined();
    expect(args.p_value.ms).toBeUndefined();
    expect(args.p_source).toBeNull();
  });

  it("never throws when the RPC fails", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = rpcClient(async () => {
      throw new Error("network");
    });

    await expect(
      markPipelineStep(client, "m1", "embed", {
        status: "failed",
        startedAt: new Date().toISOString(),
      }),
    ).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
  });
});

describe("claimPipelineStep", () => {
  it("returns true when the RPC claims the step", async () => {
    const client = rpcClient(async () => ({ data: true, error: null }));
    await expect(claimPipelineStep(client, "m1", "process")).resolves.toBe(
      true,
    );
    expect(vi.mocked(client.rpc).mock.calls[0][1]).toEqual({
      p_meeting: "m1",
      p_step: "process",
      p_allow_done: true,
    });
  });

  it("passes allowDone false through", async () => {
    const client = rpcClient(async () => ({ data: false, error: null }));
    await expect(claimPipelineStep(client, "m1", "embed", false)).resolves.toBe(
      false,
    );
    expect(
      (vi.mocked(client.rpc).mock.calls[0][1] as { p_allow_done: boolean })
        .p_allow_done,
    ).toBe(false);
  });

  it("returns false on an RPC error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const client = rpcClient(async () => ({
      data: null,
      error: { message: "boom" },
    }));
    await expect(claimPipelineStep(client, "m1", "process")).resolves.toBe(
      false,
    );
  });
});

describe("isStepStale", () => {
  it("is stale only for an old running step", () => {
    const now = Date.now();
    const old = new Date(now - PIPELINE_STEP_STALE_MS - 1000).toISOString();
    const fresh = new Date(now - 1000).toISOString();
    expect(isStepStale({ status: "running", startedAt: old }, now)).toBe(true);
    expect(isStepStale({ status: "running", startedAt: fresh }, now)).toBe(
      false,
    );
    expect(isStepStale({ status: "done", startedAt: old }, now)).toBe(false);
    expect(isStepStale(undefined, now)).toBe(false);
  });
});

describe("deriveRecapSteps", () => {
  const base = {
    state: "not_started",
    rawTextAvailable: false,
    hasInsights: false,
    pendingStale: false,
    noRecordingFinal: false,
    pipeline: null,
  };
  const now = Date.now();
  const fresh = new Date(now - 1000).toISOString();
  const old = new Date(now - PIPELINE_STEP_STALE_MS - 1000).toISOString();

  it("waits on every step before anything started", () => {
    expect(deriveRecapSteps(base, now)).toEqual({
      recording: "waiting",
      transcript: "waiting",
      summary: "waiting",
    });
  });

  it("shows the recording running while the server settles", () => {
    const steps = deriveRecapSteps(
      {
        ...base,
        state: "pending",
        pipeline: {
          steps: { recording: { status: "running", startedAt: fresh } },
        },
      },
      now,
    );
    expect(steps.recording).toBe("running");
    expect(steps.transcript).toBe("running");
  });

  it("marks the recording done once whisper started", () => {
    const steps = deriveRecapSteps(
      {
        ...base,
        state: "pending",
        pipeline: {
          steps: { whisper: { status: "running", startedAt: fresh } },
        },
      },
      now,
    );
    expect(steps).toEqual({
      recording: "done",
      transcript: "running",
      summary: "waiting",
    });
  });

  it("fails the recording only when no recording is final", () => {
    expect(
      deriveRecapSteps({ ...base, state: "no_recording" }, now).recording,
    ).toBe("running");
    expect(
      deriveRecapSteps(
        { ...base, state: "no_recording", noRecordingFinal: true },
        now,
      ).recording,
    ).toBe("failed");
  });

  it("treats a stale pending row as not running", () => {
    expect(
      deriveRecapSteps({ ...base, state: "pending", pendingStale: true }, now)
        .transcript,
    ).toBe("waiting");
  });

  it("fails the transcript on a failed state or a whisper failure", () => {
    expect(deriveRecapSteps({ ...base, state: "failed" }, now).transcript).toBe(
      "failed",
    );
    const whisperFailed = {
      steps: { whisper: { status: "failed" as const, startedAt: fresh } },
    };
    expect(
      deriveRecapSteps({ ...base, pipeline: whisperFailed }, now).transcript,
    ).toBe("failed");
    expect(
      deriveRecapSteps(
        { ...base, state: "pending", pipeline: whisperFailed },
        now,
      ).transcript,
    ).toBe("running");
  });

  it("derives the summary from insights and the process step", () => {
    const ready = { ...base, state: "ready", rawTextAvailable: true };
    expect(deriveRecapSteps({ ...ready, hasInsights: true }, now).summary).toBe(
      "done",
    );
    expect(
      deriveRecapSteps(
        {
          ...ready,
          pipeline: {
            steps: { process: { status: "running", startedAt: fresh } },
          },
        },
        now,
      ).summary,
    ).toBe("running");
    expect(
      deriveRecapSteps(
        {
          ...ready,
          pipeline: {
            steps: { process: { status: "running", startedAt: old } },
          },
        },
        now,
      ).summary,
    ).toBe("waiting");
    expect(
      deriveRecapSteps(
        {
          ...ready,
          pipeline: {
            steps: { process: { status: "failed", startedAt: fresh } },
          },
        },
        now,
      ).summary,
    ).toBe("failed");
  });
});
