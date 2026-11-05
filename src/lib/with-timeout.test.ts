import { describe, it, expect, vi, afterEach } from "vitest";
import { TimeoutError, withTimeout } from "./with-timeout";

afterEach(() => vi.useRealTimers());

describe("withTimeout", () => {
  it("resolves with the promise's value in time", async () => {
    await expect(withTimeout(Promise.resolve(7), 50)).resolves.toBe(7);
  });

  it("rejects with a TimeoutError when the promise hangs", async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise<never>(() => {}), 100);
    vi.advanceTimersByTime(100);
    await expect(pending).rejects.toBeInstanceOf(TimeoutError);
  });

  it("passes the promise's own rejection through", async () => {
    await expect(
      withTimeout(Promise.reject(new Error("boom")), 50),
    ).rejects.toThrow("boom");
  });
});
