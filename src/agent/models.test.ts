import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("@ai-sdk/google", () => ({ google: (id: string) => id }));
vi.mock("@ai-sdk/groq", () => ({ groq: () => "groq" }));
vi.mock("ai", () => ({ generateText: vi.fn(), generateObject: vi.fn() }));

import { generateObject, generateText } from "ai";
import {
  DEFAULT_STRUCTURED_TIMEOUT_MS,
  FALLBACK_MAX_OUTPUT_TOKENS,
  FLASH_BUSY_TTL_MS,
  FLASH_STRUCTURED_TIMEOUT_MS,
  generateStructuredWithFallback,
  resetFlashBusyForTests,
  resolveChatModel,
} from "./models";

const FLASH = "gemini-flash-latest";
const LITE = "gemini-3.5-flash-lite";

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

// Flash runs `flash`; Lite runs `lite` (fails by default, so the old two
// step tests still reach Groq); Groq answers { ok: false }.
function mockProviders(
  flash: (args: CallArgs) => Promise<unknown>,
  lite: (args: CallArgs) => Promise<unknown> = () =>
    Promise.reject(new Error("lite busy")),
) {
  vi.mocked(generateObject).mockImplementation(((args: CallArgs) => {
    if (args.model === FLASH) return flash(args);
    if (args.model === LITE) return lite(args);
    return Promise.resolve({ object: { ok: false } });
  }) as unknown as typeof generateObject);
}

function modelsCalled(): string[] {
  return vi
    .mocked(generateObject)
    .mock.calls.map(([args]) => (args as unknown as CallArgs).model);
}

describe("generateStructuredWithFallback", () => {
  afterEach(() => {
    resetFlashBusyForTests();
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

    expect(result).toEqual({ object: { ok: true }, model: "flash" });
    expect(modelsCalled()).toEqual([FLASH]);
    const [args] = vi.mocked(generateObject).mock.calls[0];
    expect((args as unknown as CallArgs).abortSignal).toBeInstanceOf(
      AbortSignal,
    );
  });

  it("falls back to Groq when Flash and Lite fail", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockProviders(() =>
      Promise.reject(new DOMException("timed out", "TimeoutError")),
    );

    const result = await generateStructuredWithFallback({
      schema,
      prompt: "p",
    });

    expect(result).toEqual({ object: { ok: false }, model: "groq" });
    expect(modelsCalled()).toEqual([FLASH, LITE, "groq"]);
  });

  it("gives Groq a token budget and low reasoning, Gemini no thinking", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockProviders(() => Promise.reject(new Error("quota")));

    await generateStructuredWithFallback({ schema, prompt: "p" });

    const [gemini, lite, groq] = vi.mocked(generateObject).mock.calls;
    expect(lite[0]).not.toHaveProperty("providerOptions");
    expect(gemini[0]).toMatchObject({
      providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
    });
    expect(gemini[0]).not.toHaveProperty("maxOutputTokens");
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
      if (args.model !== "groq") return Promise.reject(new Error("quota"));
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
    expect(modelsCalled()).toEqual([FLASH, LITE, "groq", "groq"]);
  });

  it("stops after the second Groq JSON failure", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(generateObject).mockRejectedValue(
      new Error("Failed to validate JSON."),
    );

    await expect(
      generateStructuredWithFallback({ schema, prompt: "p" }),
    ).rejects.toThrow("validate JSON");
    expect(modelsCalled()).toEqual([FLASH, LITE, "groq", "groq"]);
  });

  it("does not try Groq again on other errors", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(generateObject).mockRejectedValue(new Error("rate limited"));

    await expect(
      generateStructuredWithFallback({ schema, prompt: "p" }),
    ).rejects.toThrow("rate limited");
    expect(modelsCalled()).toEqual([FLASH, LITE, "groq"]);
  });

  it("aborts a stalled Flash call after 15 s, then Lite answers", async () => {
    useFakeAbortTimeout();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockProviders(hangUntilAborted, () =>
      Promise.resolve({ object: { ok: true } }),
    );

    const pending = generateStructuredWithFallback({ schema, prompt: "p" });
    await vi.advanceTimersByTimeAsync(FLASH_STRUCTURED_TIMEOUT_MS - 1);
    expect(modelsCalled()).toEqual([FLASH]);

    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({
      object: { ok: true },
      model: "lite",
    });
    expect(modelsCalled()).toEqual([FLASH, LITE]);
    const [, lite] = vi.mocked(generateObject).mock.calls;
    expect(lite[0]).not.toHaveProperty("providerOptions");
    expect((lite[0] as unknown as CallArgs).abortSignal).toBeInstanceOf(
      AbortSignal,
    );
  });

  it("caps Flash at 15 s even with a longer timeoutMs, and Lite uses it", async () => {
    useFakeAbortTimeout();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockProviders(hangUntilAborted, hangUntilAborted);

    const pending = generateStructuredWithFallback({
      schema,
      prompt: "p",
      timeoutMs: 90_000,
    });
    await vi.advanceTimersByTimeAsync(FLASH_STRUCTURED_TIMEOUT_MS);
    expect(modelsCalled()).toEqual([FLASH, LITE]);

    await vi.advanceTimersByTimeAsync(90_000 - 1);
    expect(modelsCalled()).toEqual([FLASH, LITE]);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({
      object: { ok: false },
      model: "groq",
    });
  });

  it("aborts Lite after the default 30 s", async () => {
    useFakeAbortTimeout();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockProviders(() => Promise.reject(new Error("busy")), hangUntilAborted);

    const pending = generateStructuredWithFallback({ schema, prompt: "p" });
    await vi.advanceTimersByTimeAsync(DEFAULT_STRUCTURED_TIMEOUT_MS - 1);
    expect(modelsCalled()).toEqual([FLASH, LITE]);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toMatchObject({ model: "groq" });
  });

  it("skips Flash for 60 s after a Flash failure", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockProviders(
      () => Promise.reject(new Error("busy")),
      () => Promise.resolve({ object: { ok: true } }),
    );

    await generateStructuredWithFallback({ schema, prompt: "p" });
    await generateStructuredWithFallback({ schema, prompt: "p" });
    expect(modelsCalled()).toEqual([FLASH, LITE, LITE]);

    vi.advanceTimersByTime(FLASH_BUSY_TTL_MS);
    await generateStructuredWithFallback({ schema, prompt: "p" });
    expect(modelsCalled()).toEqual([FLASH, LITE, LITE, FLASH, LITE]);
  });
});

describe("resolveChatModel", () => {
  it("probes Lite when the Flash probe fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(generateText).mockImplementation(((args: { model: string }) =>
      args.model === FLASH
        ? Promise.reject(new Error("busy"))
        : Promise.resolve({ text: "" })) as unknown as typeof generateText);

    await expect(resolveChatModel()).resolves.toBe(LITE);
  });
});
