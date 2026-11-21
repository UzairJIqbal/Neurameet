import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRpc, mockEmbed, mockGenerate } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockEmbed: vi.fn(),
  mockGenerate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("ai", () => ({ embed: mockEmbed }));
vi.mock("./rag", () => ({ QUESTION_EMBEDDING: "embedding-model" }));
vi.mock("./models", () => ({ generateStructuredWithFallback: mockGenerate }));
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: () => ({ rpc: mockRpc }),
}));

import { generatePrepSuggestions } from "./prep";

const suggestions = {
  context: ["Survey is pending"],
  openActionItems: [],
  discussionPoints: [],
  questionsToAsk: [],
};

describe("generatePrepSuggestions", () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockEmbed.mockReset();
    mockEmbed.mockResolvedValue({ embedding: [0.1] });
    mockGenerate.mockResolvedValue({ object: suggestions });
  });

  it("returns the LLM suggestions only", async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    const result = await generatePrepSuggestions("user-1", "Survey sync");

    expect(result).toEqual({ suggestions });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc.mock.calls[0][0]).toBe("match_meeting_chunks_user");
  });

  it("returns empty suggestions for an empty query", async () => {
    const result = await generatePrepSuggestions("user-1", "  ");
    expect(result.suggestions.context).toEqual([]);
    expect(mockEmbed).not.toHaveBeenCalled();
  });
});
