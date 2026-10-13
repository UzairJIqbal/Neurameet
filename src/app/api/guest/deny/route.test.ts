// @vitest-environment node
//
// Regression test for the G2 emit bug in POST /api/guest/deny.
// Root cause: same as admit — sendCallEvent payload omitted `user_id`, which
// Stream rejects server-side with "either user or user_id must be provided
// when using server side auth" — so the guest.denied event never reached the
// guest. The admit route has a 1-test regression; deny is the structural
// mirror and must be guarded too.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPending, resolveMint, _reset as reset } from "@/lib/guest-store";

const { mockAuth, mockSupabase, mockSendCallEvent, mockFrom } = vi.hoisted(() => {
  const mockSendCallEvent = vi.fn(async (_payload: any) => ({ success: true }));
  const mockAuth = vi.fn();

  const seedRows: any[] = [];

  const mockSelect = vi.fn(() => ({
    eq: () => ({
      eq: () => ({
        maybeSingle: () => {
          if (seedRows.length > 0) {
            return Promise.resolve({ data: seedRows[0], error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
      }),
      in: () => ({
        maybeSingle: () => Promise.resolve({ data: seedRows[0] ?? null, error: null }),
      }),
      ne: () => ({
        select: () => Promise.resolve({ data: [], error: null }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
      }),
      gt: () => Promise.resolve({ data: seedRows, error: null }),
      lt: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
    }),
    lt: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
  }));

  const mockUpdate = vi.fn(() => ({
    eq: () => ({
      eq: () => ({
        select: () => Promise.resolve({ data: [{ guest_token: "gt_seed" }], error: null }),
      }),
    }),
  }));

  const mockDelete = vi.fn(() => ({
    eq: () => Promise.resolve({ data: [], error: null }),
    lt: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
    neq: () => Promise.resolve({ data: [], error: null }),
  }));

  const mockInsert = vi.fn(() => ({
    select: () => ({
      single: () => {
        const row = {
          guest_token: "gt_seed",
          meeting_id: "meet-1",
          request_nonce: "n1",
          name: "Alice",
          email: null,
          status: "pending",
          stream_user_id: "guest-1",
          access_token: "tok",
          created_at: new Date().toISOString(),
          minted_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 600000).toISOString(),
        };
        seedRows.push(row);
        return Promise.resolve({ data: row, error: null });
      },
    }),
  }));

  const mockFrom = () => ({
    select: mockSelect,
    update: mockUpdate,
    delete: mockDelete,
    insert: mockInsert,
  });

  const mockSupabase = vi.fn(() => ({
    from: mockFrom,
  }));

  return { mockAuth, mockSupabase, mockSendCallEvent, mockFrom, seedRows };
});

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: mockSupabase }));
vi.mock("@stream-io/node-sdk", () => ({
  StreamClient: class {
    video = { sendCallEvent: mockSendCallEvent };
  },
}));

import { POST } from "./route";

describe("POST /api/guest/deny emit user_id (G2 regression)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reset().catch(() => {});
    mockAuth.mockResolvedValue({ userId: "owner-1" });
  });

  afterEach(() => {
    reset().catch(() => {});
  });

  it("passes user_id === owner Clerk id to sendCallEvent", async () => {
    // Pre-seed a pending guest with resolved mint via the store.
    const { guest } = await createPending({
      meeting_id: "meet-1",
      request_nonce: "n1",
      name: "Alice",
    });
    await resolveMint(guest.guest_token, {
      stream_user_id: "guest-1",
      access_token: "tok",
    });

    // The deny route's getGuest cross-check needs the row to return.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockChain: any = {
      eq: () => ({
        maybeSingle: () =>
          Promise.resolve({
            data: {
              guest_token: guest.guest_token,
              meeting_id: "meet-1",
              name: "Alice",
              status: "pending",
              stream_user_id: "guest-1",
            },
            error: null,
          }),
      }),
    };
    mockFrom().select.mockReturnValueOnce(mockChain);

    // The meeting owner check returns user_id = "owner-1".
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockChain2: any = {
      eq: () => ({
        maybeSingle: () =>
          Promise.resolve({
            data: { id: "meet1", user_id: "owner-1" },
            error: null,
          }),
      }),
    };
    mockFrom().select.mockReturnValueOnce(mockChain2);

    const req = new Request("http://localhost/api/guest/deny", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guest_token: guest.guest_token,
        meeting_id: "meet-1",
      }),
    });

    await POST(req as never);

    expect(mockSendCallEvent).toHaveBeenCalledTimes(1);
    const calls = mockSendCallEvent.mock.calls as unknown as Array<
      [{ user_id: string; custom: { event: string; guest_token: string } }]
    >;
    expect(calls[0][0].user_id).toBe("owner-1");
    expect(calls[0][0].custom.event).toBe("guest.denied");
    expect(calls[0][0].custom.guest_token).toBe(guest.guest_token);
  });
});
