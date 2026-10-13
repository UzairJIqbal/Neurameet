// @vitest-environment node
// src/app/api/attendance/event/route.test.ts
/**
 * Tests for the attendance event API route.
 * Directly invokes the POST handler with mocked Supabase client.
 */
import { describe, it, expect, vi } from "vitest";
// Mock Clerk server auth to avoid client component import error
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: null }),
}));

vi.mock("server-only", () => ({}));

// Mock Stream client used in resolveMeetingTitle
vi.mock("@stream-io/node-sdk", () => ({
  StreamClient: class {
    video = {
      call: () => ({
        get: async () => ({
          call: { custom: { title: "Test Meeting" } },
        }),
      }),
    };
  },
}));

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: () => {
    const builder = {
      // Chainable query builder methods
      from: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      // Terminal methods returning promises
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      single: vi.fn().mockResolvedValue({ data: { id: "meeting123" }, error: null }),
    };
    return builder;
  },
}));

import { POST } from "./route";
import type { NextRequest } from "next/server";

// Helper to create a minimal NextRequest-like object
function mockRequest(body: Record<string, unknown>) {
  return {
    json: async () => body,
    method: "POST",
    headers: new Headers({ "content-type": "application/json" }),
  } as unknown as NextRequest;
}

describe("POST /api/attendance/event", () => {
  it("accepts a guest payload when identifiers provided", async () => {
    const payload = {
      stream_call_id: "call123",
      participant_email: "guest@example.com",
      event_type: "join",
    };
    const resp = await POST(mockRequest(payload));
    const data = await resp.json();
    expect(resp.status).toBe(200);
    expect(data.ok).toBe(true);
  });

  it("rejects missing identifiers", async () => {
    const payload = { call_id: "call123", event: "join" };
    const resp = await POST(mockRequest(payload));
    const data = await resp.json();
    expect(resp.status).toBe(400);
    expect(data.error).toBeDefined();
  });
});

