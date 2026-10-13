// @vitest-environment node
//
// Tests for GET /api/guest/status — the guest's 5s poll endpoint.
// Verifies the route delegates to getStatus and returns the right JSON shape,
// including the not_found and expired branches that the guest page relies on.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// vi.hoisted makes this available inside the vi.mock factory (which is
// hoisted above top-level const declarations).
const { mockGetStatus } = vi.hoisted(() => ({
  mockGetStatus: vi.fn(),
}));

vi.mock("@/lib/guest-store", () => ({ getStatus: mockGetStatus }));

import { GET } from "./route";

describe("GET /api/guest/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when guest_token is missing", async () => {
    const req = new Request("http://localhost/api/guest/status");
    const res = await GET(req as NextRequest);
    expect(res.status).toBe(400);
  });

  it("returns the status from getStatus for a valid token", async () => {
    mockGetStatus.mockResolvedValue("pending");
    const req = new Request("http://localhost/api/guest/status?guest_token=gt_1");
    const res = await GET(req as NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "pending" });
  });

  it("returns 200 with 'not_found' when the token does not exist", async () => {
    mockGetStatus.mockResolvedValue("not_found");
    const req = new Request("http://localhost/api/guest/status?guest_token=gt_nope");
    const res = await GET(req as NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "not_found" });
  });

  it("returns 200 with 'expired' when the row passed its TTL", async () => {
    mockGetStatus.mockResolvedValue("expired");
    const req = new Request("http://localhost/api/guest/status?guest_token=gt_exp");
    const res = await GET(req as NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "expired" });
  });

  it("returns 200 with 'admitted' so the guest knows to join the call", async () => {
    mockGetStatus.mockResolvedValue("admitted");
    const req = new Request("http://localhost/api/guest/status?guest_token=gt_admit");
    const res = await GET(req as NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "admitted" });
  });
});
