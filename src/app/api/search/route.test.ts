import { describe, it, expect, vi, beforeEach } from "vitest";

const { store, mockAuth, mockSearchAcross, mockRpc } = vi.hoisted(() => {
  const store = {
    members: { data: null as unknown, error: null as unknown },
  };
  return {
    store,
    mockAuth: vi.fn(),
    mockSearchAcross: vi.fn(async () => [{ id: "personal-hit" }]),
    mockRpc: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("ai", () => ({ embed: vi.fn(async () => ({ embedding: [0.1] })) }));
vi.mock("@/agent/rag", () => ({
  searchAcrossMeetings: mockSearchAcross,
  QUESTION_EMBEDDING: "embedding-model",
}));
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: () => ({
    rpc: mockRpc,
    from: () => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        maybeSingle: () => Promise.resolve(store.members),
      };
      return builder;
    },
  }),
}));

import { POST } from "./route";

const P = "2fd9c353-0000-4000-8000-000000000001";

const call = (userId: string | null, body: Record<string, unknown>) => {
  mockAuth.mockResolvedValue({ userId });
  return POST(
    new Request("http://localhost/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  store.members = { data: { role: "developer" }, error: null };
  mockRpc.mockResolvedValue({
    data: [
      {
        chunk_id: "c1",
        meeting_id: "m1",
        meeting_title: "Planning",
        started_at: null,
        content: "we ship Friday",
        chunk_index: 2,
        similarity: 0.7,
      },
    ],
    error: null,
  });
});

describe("POST /api/search", () => {
  it("rejects when not signed in", async () => {
    const res = await call(null, { query: "ship" });
    expect(res.status).toBe(401);
  });

  it("requires a query", async () => {
    const res = await call("u1", { query: "  ", projectId: P });
    expect(res.status).toBe(400);
  });

  it("searches your own meetings without a project id", async () => {
    const res = await call("u1", { query: " ship " });
    expect(await res.json()).toEqual({ results: [{ id: "personal-hit" }] });
    expect(mockSearchAcross).toHaveBeenCalledWith("u1", "ship");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("passes the project id to the function and returns search hits", async () => {
    const res = await call("u1", { query: "ship", projectId: P });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      results: [
        {
          id: "c1",
          meetingId: "m1",
          meetingTitle: "Planning",
          chunkText: "we ship Friday",
          chunkIndex: 2,
          similarity: 0.7,
        },
      ],
    });
    expect(mockRpc).toHaveBeenCalledWith(
      "match_project_chunks",
      expect.objectContaining({
        p_project: P,
        match_count: 20,
        min_similarity: 0.3,
      }),
    );
    expect(mockSearchAcross).not.toHaveBeenCalled();
  });

  it("returns 403 for a Viewer", async () => {
    store.members = { data: { role: "viewer" }, error: null };
    const res = await call("u1", { query: "ship", projectId: P });
    expect(res.status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 404 for a non member", async () => {
    store.members = { data: null, error: null };
    const res = await call("u1", { query: "ship", projectId: P });
    expect(res.status).toBe(404);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it.each(["not-a-uuid", 7, null])(
    "returns 422 for the id %s",
    async (projectId) => {
      const res = await call("u1", { query: "ship", projectId });
      expect(res.status).toBe(422);
    },
  );
});
