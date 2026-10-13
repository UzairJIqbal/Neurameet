import { describe, it, expect, vi, beforeEach } from "vitest";

// Shared mocks created once (hoisted above the vi.mock factories) so the
// factories can reference them without a TDZ error.
const { mockEmbedMany, mockSupabase } = vi.hoisted(() => {
  const eq = vi.fn(() => ({ error: null }));
  const del = vi.fn(() => ({ eq }));
  const insert = vi.fn(() => ({ error: null }));
  const from = vi.fn(() => ({ delete: del, insert }));
  const mockClient = { from };
  return {
    mockEmbedMany: vi.fn(),
    mockSupabase: vi.fn(() => mockClient),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  embedMany: mockEmbedMany,
}));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: mockSupabase }));

import { embedAndStore, chunkTranscript } from "./embed";

// Build a fake embedding vector of the right dimension for a batch of values.
const okEmbeddings = (values: string[]) => ({
  embeddings: values.map(() => new Array<number>(768).fill(0.1)),
});

describe("embedAndStore resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retries transient (429) failures with backoff, then succeeds", async () => {
    mockEmbedMany
      .mockRejectedValueOnce(new Error("429 rate limit"))
      .mockRejectedValueOnce(new Error("429 rate limit"))
      .mockImplementationOnce(async (opts: { values: string[] }) =>
        okEmbeddings(opts.values),
      );

    const res = await embedAndStore("m1", "Para one.\n\nPara two.");

    // Two failures + one success = three calls, no throw.
    expect(mockEmbedMany).toHaveBeenCalledTimes(3);
    expect(res.chunkCount).toBeGreaterThan(0);
  });

  it("does NOT retry a deterministic count mismatch", async () => {
    mockEmbedMany.mockResolvedValue({ embeddings: [] });

    await expect(embedAndStore("m1", "Hello world.")).rejects.toThrow(
      "Embedding count mismatch",
    );
    expect(mockEmbedMany).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry a permanent API error (e.g. invalid key)", async () => {
    const { APICallError } = await import("ai");
    mockEmbedMany.mockRejectedValue(
      new APICallError({
        message: "API key not valid",
        url: "https://example.test",
        requestBodyValues: {},
        statusCode: 400,
        isRetryable: false,
      }),
    );

    await expect(embedAndStore("m1", "Hello world.")).rejects.toThrow(
      "API key not valid",
    );
    expect(mockEmbedMany).toHaveBeenCalledTimes(1);
  });

  it("batches >100 chunks into separate embedMany calls (Gemini 100 cap)", async () => {
    // Each paragraph is >900 chars, so chunkTranscript yields roughly one chunk
    // per paragraph — enough to exceed Gemini's 100-per-request batch limit.
    const paras = Array.from(
      { length: 250 },
      (_, i) => `Speaker ${i}: ${"word ".repeat(200)}`,
    ).join("\n\n");
    const chunkCount = chunkTranscript(paras).length;
    expect(chunkCount).toBeGreaterThan(100);

    mockEmbedMany.mockImplementation(async (opts: { values: string[] }) =>
      okEmbeddings(opts.values),
    );

    const res = await embedAndStore("m1", paras);

    expect(res.chunkCount).toBe(chunkCount);
    expect(mockEmbedMany).toHaveBeenCalledTimes(Math.ceil(chunkCount / 100));
  });
});
