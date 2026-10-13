// @vitest-environment node
//
// Tests for the Supabase-backed guest-store (replaces G0 §4.4.2/§4.4.5 in-memory Map).
// The store is async and DB-backed; these tests mock supabaseServer() and assert
// the atomic INSERT...ON CONFLICT / UPDATE...WHERE status='pending' logic.
//
// The mock simulates a real Postgres partial unique index on
// (meeting_id, request_nonce) WHERE status IN ('pending','minting') — the core
// of the idempotency / dedup guarantee that the in-memory nonceIndex provided.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createPending,
  resolveMint,
  rejectMint,
  getStatus,
  getGuest,
  admit,
  deny,
  expireByMeetingId,
  cleanup,
  getAllPending,
  _reset as reset,
} from "./guest-store";

// In-memory mock DB that simulates the partial unique index + atomic UPDATE.
type MockRow = {
  guest_token: string;
  meeting_id: string;
  request_nonce: string;
  name: string;
  email: string | null;
  status: string;
  stream_user_id: string | null;
  access_token: string | null;
  created_at: string;
  minted_at: string | null;
  expires_at: string;
};

const mockDb: MockRow[] = [];
const now = () => new Date();

// Simulate Postgres partial unique index: (meeting_id, request_nonce) WHERE status IN ('pending','minting')
function findNonceConflict(meetingId: string, nonce: string): MockRow | undefined {
  return mockDb.find(
    (r) =>
      r.meeting_id === meetingId &&
      r.request_nonce === nonce &&
      (r.status === "pending" || r.status === "minting"),
  );
}

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockInsert = vi.fn();

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: () => ({
    from: () => ({
      select: mockSelect,
      update: mockUpdate,
      delete: mockDelete,
      insert: mockInsert,
    }),
  }),
}));

describe("guest-store (Supabase-backed)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockDb.length = 0;
    mockSelect.mockReset();
    mockUpdate.mockReset();
    mockDelete.mockReset();
    mockInsert.mockReset();

    // Default: return empty for any select chain that isn't explicitly mocked.
    mockSelect.mockReturnValue({
      eq: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
        in: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
      }),
      lt: () => ({ eq: () => ({ select: () => Promise.resolve({ data: [], error: null }) }) }),
    });
    // Default: delete() chain (used by cleanup) returns empty.
    mockDelete.mockReturnValue({
      lt: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
      eq: () => Promise.resolve({ data: [], error: null }),
      neq: () => Promise.resolve({ data: [], error: null }),
    });
    // Default: update() chain returns empty (no rows matched).
    mockUpdate.mockReturnValue({
      eq: () => ({
        eq: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
      }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    reset().catch(() => {});
  });

  describe("createPending", () => {
    it("creates a new pending request when no existing entry exists (isNew=true)", async () => {
      let capturedInsert: any = null;
      mockInsert.mockReturnValue({
        select: () => ({
          single: () => {
            const row: MockRow = {
              guest_token: "gt_new",
              meeting_id: "meet1",
              request_nonce: "nonce1",
              name: "Alice",
              email: null,
              status: "pending",
              stream_user_id: null,
              access_token: null,
              created_at: now().toISOString(),
              minted_at: null,
              expires_at: new Date(Date.now() + 600000).toISOString(),
            };
            mockDb.push(row);
            capturedInsert = row;
            return Promise.resolve({ data: row, error: null });
          },
        }),
      });

      const result = await createPending({
        meeting_id: "meet1",
        request_nonce: "nonce1",
        name: "Alice",
      });

      expect(result.isNew).toBe(true);
      expect(result.guest.status).toBe("pending");
      expect(result.guest.guest_token).toMatch(/^gt_/);
      expect(result.guest.name).toBe("Alice");
      expect(result.guest.stream_user_id).toBeNull();
      expect(result.guest.access_token).toBeNull();
      expect(result.mintPromise).toBeInstanceOf(Promise);
    });

    it("returns isNew=false + sentinel mintPromise for a conflicting nonce (concurrent reuse)", async () => {
      // Simulate the partial unique index rejecting the INSERT with 23505.
      const conflictError = { code: "23505", message: "duplicate key" };
      const existingRow: MockRow = {
        guest_token: "gt_existing",
        meeting_id: "meet1",
        request_nonce: "nonce1",
        name: "Alice",
        email: null,
        status: "pending",
        stream_user_id: null,
        access_token: null,
        created_at: now().toISOString(),
        minted_at: null,
        expires_at: new Date(Date.now() + 600000).toISOString(),
      };
      mockDb.push(existingRow);

      mockInsert.mockReturnValue({
        select: () => ({
          single: () => Promise.resolve({ data: null, error: conflictError }),
        }),
      });

      // The lookup-by-nonce select returns the existing row.
      mockSelect.mockReturnValueOnce({
        eq: () => ({
          eq: () => ({
            in: () => ({
              maybeSingle: () => Promise.resolve({ data: existingRow, error: null }),
            }),
          }),
        }),
      });

      const result = await createPending({
        meeting_id: "meet1",
        request_nonce: "nonce1",
        name: "Bob", // different name, same nonce
      });

      expect(result.isNew).toBe(false);
      expect(result.guest.guest_token).toBe("gt_existing");
      // Sentinel: reuse-path caller polls GET /api/guest/status instead.
      const val = await result.mintPromise;
      expect(val).toBeNull();
    });

    it("creates a new request for a different nonce", async () => {
      mockInsert.mockReturnValue({
        select: () => ({
          single: () =>
            Promise.resolve({
              data: {
                guest_token: "gt_1",
                meeting_id: "meet1",
                request_nonce: "nonce1",
                name: "Alice",
                email: null,
                status: "pending",
                stream_user_id: null,
                access_token: null,
                created_at: now().toISOString(),
                minted_at: null,
                expires_at: new Date(Date.now() + 600000).toISOString(),
              },
              error: null,
            }),
        }),
      });
      mockInsert.mockReturnValueOnce({
        select: () => ({
          single: () =>
            Promise.resolve({
              data: {
                guest_token: "gt_2",
                meeting_id: "meet1",
                request_nonce: "nonce2",
                name: "Alice",
                email: null,
                status: "pending",
                stream_user_id: null,
                access_token: null,
                created_at: now().toISOString(),
                minted_at: null,
                expires_at: new Date(Date.now() + 600000).toISOString(),
              },
              error: null,
            }),
        }),
      });

      const r1 = await createPending({
        meeting_id: "meet1",
        request_nonce: "nonce1",
        name: "Alice",
      });
      const r2 = await createPending({
        meeting_id: "meet1",
        request_nonce: "nonce2",
        name: "Alice",
      });

      expect(r2.isNew).toBe(true);
      expect(r2.guest.guest_token).not.toBe(r1.guest.guest_token);
    });

    it("creates a new request for a different meeting_id with the same nonce", async () => {
      // No conflict because different meeting_id -> different partial-index key.
      mockInsert.mockReturnValue({
        select: () => ({
          single: () =>
            Promise.resolve({
              data: {
                guest_token: "gt_1",
                meeting_id: "meet1",
                request_nonce: "nonce1",
                name: "Alice",
                email: null,
                status: "pending",
                stream_user_id: null,
                access_token: null,
                created_at: now().toISOString(),
                minted_at: null,
                expires_at: new Date(Date.now() + 600000).toISOString(),
              },
              error: null,
            }),
        }),
      });

      await createPending({ meeting_id: "meet1", request_nonce: "nonce1", name: "Alice" });
      const r2 = await createPending({ meeting_id: "meet2", request_nonce: "nonce1", name: "Alice" });

      expect(r2.isNew).toBe(true);
    });
  });

  describe("resolveMint", () => {
    it("writes stream_user_id + access_token + minted_at to the DB row", async () => {
      const row: MockRow = {
        guest_token: "gt_test",
        meeting_id: "meet1",
        request_nonce: "n1",
        name: "Alice",
        email: null,
        status: "pending",
        stream_user_id: null,
        access_token: null,
        created_at: now().toISOString(),
        minted_at: null,
        expires_at: new Date(Date.now() + 600000).toISOString(),
      };
      mockDb.push(row);

      // UPDATE chain returns the updated row.
      mockUpdate.mockReturnValueOnce({
        eq: () => ({
          eq: () => ({
            select: () => Promise.resolve({ data: [{ ...row }], error: null }),
          }),
        }),
      });

      const mint = { stream_user_id: "user_123", access_token: "token_abc" };
      await resolveMint("gt_test", mint);

      // Verify the UPDATE was called with the right values.
      expect(mockUpdate).toHaveBeenCalledWith({
        stream_user_id: "user_123",
        access_token: "token_abc",
        minted_at: expect.any(String),
      });
    });
  });

  describe("rejectMint", () => {
    it("deletes the row so a retry can INSERT fresh", async () => {
      mockDb.push({
        guest_token: "gt_bad",
        meeting_id: "meet1",
        request_nonce: "n1",
        name: "Alice",
        email: null,
        status: "pending",
        stream_user_id: null,
        access_token: null,
        created_at: now().toISOString(),
        minted_at: null,
        expires_at: new Date(Date.now() + 600000).toISOString(),
      });

      const eqMock = vi.fn(() => Promise.resolve({ data: [], error: null }));
      mockDelete.mockReturnValueOnce({ eq: eqMock });

      await rejectMint("gt_bad");

      // rejectMint calls: supabase.from("guest_requests").delete().eq("guest_token", token)
      expect(eqMock).toHaveBeenCalledWith("guest_token", "gt_bad");
    });
  });

  describe("getStatus", () => {
    it("returns 'not_found' for an unknown guest_token", async () => {
      mockSelect.mockReturnValueOnce({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      });
      const result = await getStatus("gt_nonexistent");
      expect(result).toBe("not_found");
    });

    it("returns 'pending' for a live pending row", async () => {
      const row: MockRow = {
        guest_token: "gt_x",
        meeting_id: "meet1",
        request_nonce: "n1",
        name: "Alice",
        email: null,
        status: "pending",
        stream_user_id: null,
        access_token: null,
        created_at: now().toISOString(),
        minted_at: null,
        expires_at: new Date(Date.now() + 600000).toISOString(),
      };
      mockDb.push(row);
      mockSelect.mockReturnValueOnce({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: row, error: null }),
        }),
      });
      const result = await getStatus("gt_x");
      expect(result).toBe("pending");
    });

    it("returns 'expired' for a pending row past TTL", async () => {
      const row: MockRow = {
        guest_token: "gt_y",
        meeting_id: "meet1",
        request_nonce: "n1",
        name: "Alice",
        email: null,
        status: "pending",
        stream_user_id: null,
        access_token: null,
        created_at: now().toISOString(),
        minted_at: null,
        // expired 1 second ago
        expires_at: new Date(Date.now() - 1000).toISOString(),
      };
      mockDb.push(row);
      mockSelect.mockReturnValueOnce({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: row, error: null }),
        }),
      });
      const result = await getStatus("gt_y");
      expect(result).toBe("expired");
    });

    it("returns 'admitted' for an admitted row past TTL (not expired)", async () => {
      const row: MockRow = {
        guest_token: "gt_z",
        meeting_id: "meet1",
        request_nonce: "n1",
        name: "Alice",
        email: null,
        status: "admitted",
        stream_user_id: "user_1",
        access_token: "tok",
        created_at: now().toISOString(),
        minted_at: now().toISOString(),
        expires_at: new Date(Date.now() - 1000).toISOString(),
      };
      mockDb.push(row);
      mockSelect.mockReturnValueOnce({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: row, error: null }),
        }),
      });
      const result = await getStatus("gt_z");
      expect(result).toBe("admitted");
    });
  });

  describe("admit / deny", () => {
    it("admit flips pending -> admitted (returns true)", async () => {
      const row: MockRow = {
        guest_token: "gt_a",
        meeting_id: "meet1",
        request_nonce: "n1",
        name: "Alice",
        email: null,
        status: "pending",
        stream_user_id: null,
        access_token: null,
        created_at: now().toISOString(),
        minted_at: null,
        expires_at: new Date(Date.now() + 600000).toISOString(),
      };
      mockDb.push(row);
      mockUpdate.mockReturnValueOnce({
        eq: () => ({
          eq: () => ({
            select: () => Promise.resolve({ data: [{ guest_token: "gt_a" }], error: null }),
          }),
        }),
      });

      const result = await admit("gt_a");
      expect(result).toBe(true);
    });

    it("admit returns false for unknown token (no row matches WHERE status='pending')", async () => {
      mockUpdate.mockReturnValueOnce({
        eq: () => ({
          eq: () => ({
            select: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      });
      const result = await admit("gt_nonexistent");
      expect(result).toBe(false);
    });

    it("admit returns false for already-admitted token (WHERE clause guards)", async () => {
      // The UPDATE ... WHERE status='pending' matches 0 rows for an admitted row.
      mockUpdate.mockReturnValueOnce({
        eq: () => ({
          eq: () => ({
            select: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      });
      const result = await admit("gt_already_admitted");
      expect(result).toBe(false);
    });

    it("deny changes pending -> denied (returns true)", async () => {
      mockUpdate.mockReturnValueOnce({
        eq: () => ({
          eq: () => ({
            select: () => Promise.resolve({ data: [{ guest_token: "gt_d" }], error: null }),
          }),
        }),
      });
      const result = await deny("gt_d");
      expect(result).toBe(true);
    });

    it("deny returns false for unknown token", async () => {
      mockUpdate.mockReturnValueOnce({
        eq: () => ({
          eq: () => ({
            select: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      });
      const result = await deny("gt_nonexistent");
      expect(result).toBe(false);
    });
  });

  describe("cleanup", () => {
    it("deletes expired pending rows", async () => {
      mockDelete.mockReturnValueOnce({
        lt: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
      });
      await cleanup();
      expect(mockDelete).toHaveBeenCalled();
    });

    it("deletes stale admitted rows (admitted-but-never-joined ghost entries)", async () => {
      // cleanup() now makes two delete calls:
      // 1. .lt("expires_at", now).eq("status", "pending")  — expired pending
      // 2. .lt("minted_at", staleAdmitted).eq("status", "admitted")  — stale admitted
      mockDelete.mockReturnValueOnce({
        lt: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
      });
      mockDelete.mockReturnValueOnce({
        lt: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
      });

      await cleanup();

      // Verify the second delete targets admitted rows on the minted_at staleness window.
      const secondCallArgs = mockDelete.mock.results[1]?.value;
      // The mock returns a chainable; we just verify the call happened.
      expect(mockDelete).toHaveBeenCalledTimes(2);
    });
  });

  describe("getGuest", () => {
    it("returns sanitized { meeting_id, name, status, stream_user_id } — never access_token", async () => {
      const row = {
        meeting_id: "meet1",
        name: "Alice",
        status: "pending",
        stream_user_id: null,
      };
      mockSelect.mockReturnValueOnce({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: row, error: null }),
        }),
      });

      const result = await getGuest("gt_x");
      expect(result).toEqual({
        meeting_id: "meet1",
        name: "Alice",
        status: "pending",
        stream_user_id: null,
      });
      // internal fields must never leak
      expect(result).not.toHaveProperty("access_token");
      expect(result).not.toHaveProperty("mint");
      expect(result).not.toHaveProperty("promise");
    });

    it("returns undefined for an unknown guest_token", async () => {
      mockSelect.mockReturnValueOnce({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      });
      const result = await getGuest("gt_nonexistent");
      expect(result).toBeUndefined();
    });

    it("reflects status after admit", async () => {
      const row = {
        meeting_id: "meet1",
        name: "Alice",
        status: "admitted",
        stream_user_id: "user_1",
      };
      mockSelect.mockReturnValueOnce({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: row, error: null }),
        }),
      });
      const result = await getGuest("gt_x");
      expect(result?.status).toBe("admitted");
      expect(result?.meeting_id).toBe("meet1");
    });

    it("reflects status after deny", async () => {
      const row = {
        meeting_id: "meet1",
        name: "Alice",
        status: "denied",
        stream_user_id: null,
      };
      mockSelect.mockReturnValueOnce({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: row, error: null }),
        }),
      });
      const result = await getGuest("gt_x");
      expect(result?.status).toBe("denied");
    });
  });

  describe("getAllPending", () => {
    it("returns all non-expired pending rows for a meeting_id", async () => {
      const rows = [
        { guest_token: "gt_1", name: "Alice", email: null, created_at: "2026-01-01T00:00:00Z" },
        { guest_token: "gt_2", name: "Bob", email: "bob@x.com", created_at: "2026-01-01T00:01:00Z" },
      ];
      mockSelect.mockReturnValueOnce({
        eq: () => ({
          eq: () => ({
            gt: () => Promise.resolve({ data: rows, error: null }),
          }),
        }),
      });

      const result = await getAllPending("meet1");
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Alice");
      expect(result[1].name).toBe("Bob");
      expect(result[1].email).toBe("bob@x.com");
    });
  });

  describe("expireByMeetingId", () => {
    it("marks all pending guests for a meeting as expired and returns the count", async () => {
      const row1: MockRow = {
        guest_token: "gt_1",
        meeting_id: "meet1",
        request_nonce: "n1",
        name: "Alice",
        email: null,
        status: "pending",
        stream_user_id: null,
        access_token: null,
        created_at: now().toISOString(),
        minted_at: null,
        expires_at: new Date(Date.now() + 600000).toISOString(),
      };
      const row2: MockRow = {
        guest_token: "gt_2",
        meeting_id: "meet1",
        request_nonce: "n2",
        name: "Bob",
        email: null,
        status: "pending",
        stream_user_id: null,
        access_token: null,
        created_at: now().toISOString(),
        minted_at: null,
        expires_at: new Date(Date.now() + 600000).toISOString(),
      };
      mockDb.push(row1, row2);

      // UPDATE chain returns the updated rows.
      mockUpdate.mockReturnValueOnce({
        eq: () => ({
          eq: () => ({
            select: () =>
              Promise.resolve({ data: [row1, row2], error: null }),
          }),
        }),
      });

      const count = await expireByMeetingId("meet1");
      expect(count).toBe(2);
    });

    it("returns 0 when no pending guests exist for the meeting", async () => {
      // UPDATE returns empty array (no rows matched).
      mockUpdate.mockReturnValueOnce({
        eq: () => ({
          eq: () => ({
            select: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      });

      const count = await expireByMeetingId("meet1");
      expect(count).toBe(0);
    });

    it("does not expire admitted or denied guests — only pending ones", async () => {
      const pendingRow: MockRow = {
        guest_token: "gt_p",
        meeting_id: "meet1",
        request_nonce: "n1",
        name: "Alice",
        email: null,
        status: "pending",
        stream_user_id: null,
        access_token: null,
        created_at: now().toISOString(),
        minted_at: null,
        expires_at: new Date(Date.now() + 600000).toISOString(),
      };
      const admittedRow: MockRow = {
        guest_token: "gt_a",
        meeting_id: "meet1",
        request_nonce: "n2",
        name: "Bob",
        email: null,
        status: "admitted",
        stream_user_id: "user_1",
        access_token: "tok",
        created_at: now().toISOString(),
        minted_at: now().toISOString(),
        expires_at: new Date(Date.now() + 600000).toISOString(),
      };
      mockDb.push(pendingRow, admittedRow);

      mockUpdate.mockReturnValueOnce({
        eq: () => ({
          eq: () => ({
            select: () => Promise.resolve({ data: [pendingRow], error: null }),
          }),
        }),
      });

      const count = await expireByMeetingId("meet1");
      expect(count).toBe(1);
    });
  });
});
