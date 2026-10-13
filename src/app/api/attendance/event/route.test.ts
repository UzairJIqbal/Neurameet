// @vitest-environment node
// src/app/api/attendance/event/route.test.ts
/**
 * Tests for the attendance event API route.
 * Directly invokes the POST handler with mocked Clerk, Stream and Supabase.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const authState = vi.hoisted(() => ({ userId: null as string | null }));
const verifyMock = vi.hoisted(() => vi.fn());
const dbState = vi.hoisted(() => ({
  meeting: null as Record<string, unknown> | null,
  inserts: [] as Array<Record<string, unknown>>,
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: authState.userId }),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/stream-token", () => ({ verifyStreamUserToken: verifyMock }));

// Stream call: titled, created by the owner.
vi.mock("@stream-io/node-sdk", () => ({
  StreamClient: class {
    video = {
      call: () => ({
        get: async () => ({
          call: {
            custom: { title: "Test Meeting" },
            created_by: { id: "owner_1" },
          },
        }),
      }),
    };
  },
}));

// Minimal chainable builder: `single()` returns the inserted row after an
// insert, and no row for lookups (so a join opens a new attendance row).
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: () => {
    let inserting = false;
    const builder = {
      from: vi.fn(() => {
        inserting = false;
        return builder;
      }),
      insert: vi.fn((row: Record<string, unknown>) => {
        inserting = true;
        dbState.inserts.push(row);
        return builder;
      }),
      update: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: dbState.meeting, error: null })),
      single: vi.fn(async () => ({
        data: inserting ? { id: "row123" } : null,
        error: null,
      })),
    };
    return builder;
  },
}));

import { POST } from "./route";
import type { NextRequest } from "next/server";

function mockRequest(body: Record<string, unknown>) {
  return {
    json: async () => body,
    method: "POST",
    headers: new Headers({ "content-type": "application/json" }),
  } as unknown as NextRequest;
}

describe("POST /api/attendance/event", () => {
  beforeEach(() => {
    authState.userId = null;
    dbState.meeting = null;
    dbState.inserts = [];
    verifyMock.mockReset();
    vi.stubEnv("NEXT_PUBLIC_STREAM_API_KEY", "test-key");
    vi.stubEnv("STREAM_SECRET_KEY", "test-secret");
  });

  it("rejects a guest without a Stream token", async () => {
    const resp = await POST(
      mockRequest({
        stream_call_id: "call123",
        participant_email: "g@x.com",
        event_type: "join",
      }),
    );
    expect(resp.status).toBe(401);
  });

  it("rejects a guest whose Stream token Stream does not accept", async () => {
    verifyMock.mockResolvedValue(null);
    const resp = await POST(
      mockRequest({
        stream_call_id: "call123",
        guest_stream_token: "bad",
        event_type: "join",
      }),
    );
    expect(resp.status).toBe(401);
  });

  it("records a verified guest under their Stream id and the call creator as owner", async () => {
    verifyMock.mockResolvedValue("guest-abc");
    const resp = await POST(
      mockRequest({
        stream_call_id: "call123",
        user_id: "spoofed",
        guest_stream_token: "good",
        participant_name: "Guest",
        event_type: "join",
      }),
    );
    expect(resp.status).toBe(200);
    expect(dbState.inserts[0]).toMatchObject({ user_id: "owner_1" });
    expect(dbState.inserts[1]).toMatchObject({
      user_id: "guest-abc",
      stream_user_id: "guest-abc",
    });
  });

  it("uses the Clerk id for signed-in callers, ignoring body user_id", async () => {
    authState.userId = "user_real";
    const resp = await POST(
      mockRequest({
        stream_call_id: "call123",
        user_id: "spoofed",
        event_type: "join",
      }),
    );
    expect(resp.status).toBe(200);
    expect(dbState.inserts[1]).toMatchObject({ user_id: "user_real" });
  });

  it("forbids call_ended from a non-owner", async () => {
    authState.userId = "someone_else";
    dbState.meeting = { id: "m1", ended_at: null, user_id: "owner_1" };
    const resp = await POST(
      mockRequest({ stream_call_id: "call123", event_type: "call_ended" }),
    );
    expect(resp.status).toBe(403);
  });

  it("rejects missing identifiers", async () => {
    const resp = await POST(mockRequest({ call_id: "call123", event: "join" }));
    expect(resp.status).toBe(400);
  });
});
