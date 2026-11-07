import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("@ai-sdk/google", () => ({ google: () => "gemini" }));
vi.mock("@ai-sdk/groq", () => ({ groq: () => "groq" }));
vi.mock("ai", () => ({ generateText: vi.fn(), generateObject: vi.fn() }));

import { generateObject } from "ai";
import {
  FALLBACK_MAX_OUTPUT_TOKENS,
  generateStructuredWithFallback,
  PRIMARY_STRUCTURED_TIMEOUT_MS,
} from "./models";

const schema = z.object({ ok: z.boolean() });
type CallArgs = { model: string; abortSignal?: AbortSignal };

// A Gemini call that never answers, but rejects once its signal aborts.
function hangUntilAborted(args: CallArgs): Promise<never> {
  return new Promise((_, reject) => {
    args.abortSignal?.addEventListener("abort", () =>
      reject(args.abortSignal?.reason),
    );
  });
}

// AbortSignal.timeout uses Node's internal timers, which fake timers do not
// control, so rebuild it on setTimeout for the timer tests.
function useFakeAbortTimeout() {
  vi.useFakeTimers();
  vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
    const controller = new AbortController();
    setTimeout(
      () => controller.abort(new DOMException("timed out", "TimeoutError")),
      ms,
    );
    return controller.signal;
  });
}

function mockProviders(gemini: (args: CallArgs) => Promise<unknown>) {
  vi.mocked(generateObject).mockImplementation(((args: CallArgs) =>
    args.model === "gemini"
      ? gemini(args)
      : Promise.resolve({
          object: { ok: false },
        })) as unknown as typeof generateObject);
}

function modelsCalled(): string[] {
  return vi
    .mocked(generateObject)
    .mock.calls.map(([args]) => (args as unknown as CallArgs).model);
}

describe("generateStructuredWithFallback", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.mocked(generateObject).mockReset();
  });

  it("returns Gemini's object and passes it an abort signal", async () => {
    mockProviders(() => Promise.resolve({ object: { ok: true } }));

    const result = await generateStructuredWithFallback({
      schema,
      prompt: "p",
    });

    expect(result.object).toEqual({ ok: true });
    expect(modelsCalled()).toEqual(["gemini"]);
    const [args] = vi.mocked(generateObject).mock.calls[0];
    expect((args as unknown as CallArgs).abortSignal).toBeInstanceOf(
      AbortSignal,
    );
  });

  it("falls back to Groq when Gemini is aborted", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockProviders(() =>
      Promise.reject(new DOMException("timed out", "TimeoutError")),
    );

    const result = await generateStructuredWithFallback({
      schema,
      prompt: "p",
    });

    expect(result.object).toEqual({ ok: false });
    expect(modelsCalled()).toEqual(["gemini", "groq"]);
  });

  it("gives Groq a token budget and low reasoning, Gemini neither", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockProviders(() => Promise.reject(new Error("quota")));

    await generateStructuredWithFallback({ schema, prompt: "p" });

    const [gemini, groq] = vi.mocked(generateObject).mock.calls;
    expect(gemini[0]).not.toHaveProperty("providerOptions");
    expect(groq[0]).toMatchObject({
      maxOutputTokens: FALLBACK_MAX_OUTPUT_TOKENS,
      providerOptions: { groq: { reasoningEffort: "low" } },
    });
  });

  it.each([
    "Failed to validate JSON. Please adjust your prompt.",
    "Failed to generate JSON. Please adjust your prompt.",
    "max completion tokens reached before generating a valid document",
  ])("tries Groq once more after: %s", async (message) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let groqCalls = 0;
    vi.mocked(generateObject).mockImplementation(((args: CallArgs) => {
      if (args.model === "gemini") return Promise.reject(new Error("quota"));
      groqCalls += 1;
      return groqCalls === 1
        ? Promise.reject(new Error(message))
        : Promise.resolve({ object: { ok: true } });
    }) as unknown as typeof generateObject);

    const result = await generateStructuredWithFallback({
      schema,
      prompt: "p",
    });

    expect(result.object).toEqual({ ok: true });
    expect(modelsCalled()).toEqual(["gemini", "groq", "groq"]);
  });

  it("stops after the second Groq JSON failure", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(generateObject).mockRejectedValue(
      new Error("Failed to validate JSON."),
    );

    await expect(
      generateStructuredWithFallback({ schema, prompt: "p" }),
    ).rejects.toThrow("validate JSON");
    expect(modelsCalled()).toEqual(["gemini", "groq", "groq"]);
  });

  it("does not try Groq again on other errors", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(generateObject).mockRejectedValue(new Error("rate limited"));

    await expect(
      generateStructuredWithFallback({ schema, prompt: "p" }),
    ).rejects.toThrow("rate limited");
    expect(modelsCalled()).toEqual(["gemini", "groq"]);
  });

  it("aborts a stalled Gemini call after the default limit", async () => {
    useFakeAbortTimeout();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockProviders(hangUntilAborted);

    const pending = generateStructuredWithFallback({ schema, prompt: "p" });
    await vi.advanceTimersByTimeAsync(PRIMARY_STRUCTURED_TIMEOUT_MS - 1);
    expect(modelsCalled()).toEqual(["gemini"]);

    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({ object: { ok: false } });
    expect(modelsCalled()).toEqual(["gemini", "groq"]);
  });

  it("respects a longer primaryTimeoutMs", async () => {
    useFakeAbortTimeout();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockProviders(hangUntilAborted);

    const pending = generateStructuredWithFallback({
      schema,
      prompt: "p",
      primaryTimeoutMs: 90_000,
    });
    await vi.advanceTimersByTimeAsync(PRIMARY_STRUCTURED_TIMEOUT_MS);
    expect(modelsCalled()).toEqual(["gemini"]);

    await vi.advanceTimersByTimeAsync(60_000);
    await expect(pending).resolves.toEqual({ object: { ok: false } });
    expect(modelsCalled()).toEqual(["gemini", "groq"]);
  });
});
