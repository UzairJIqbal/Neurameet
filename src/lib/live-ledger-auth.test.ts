import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { client, ok, queue, resetQueues } from "@/test/supabase-queue-mock";

const { mockVerify } = vi.hoisted(() => ({ mockVerify: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/stream-token", () => ({ verifyStreamUserToken: mockVerify }));

import {
  findLiveMeeting,
  isLiveManager,
  liveManagerDenial,
  resolveLiveCaller,
} from "./live-ledger-auth";

const supabase = client as unknown as SupabaseClient;
const personal = ok({ id: "m1", user_id: "owner", project_id: null });
const project = ok({ id: "m1", user_id: "creator", project_id: "p1" });

const resolve = (authUserId: string | null, guestStreamToken = null) =>
  resolveLiveCaller(supabase, { callId: "c1", authUserId, guestStreamToken });

describe("live-ledger-auth", () => {
  beforeEach(() => {
    resetQueues();
    vi.clearAllMocks();
  });

  it("findLiveMeeting maps project_id, null for a personal meeting", async () => {
    queue("meetings", ok({ id: "m1", user_id: "owner" }), project);
    expect(await findLiveMeeting(supabase, "c1")).toEqual({
      id: "m1",
      ownerId: "owner",
      projectId: null,
    });
    expect(await findLiveMeeting(supabase, "c1")).toEqual({
      id: "m1",
      ownerId: "creator",
      projectId: "p1",
    });
  });

  describe("manager checks", () => {
    const personalMeeting = { id: "m1", ownerId: "owner", projectId: null };
    const projectMeeting = { id: "m1", ownerId: "creator", projectId: "p1" };

    it("personal: only the creator, with the old 404 for anyone else", async () => {
      expect(await liveManagerDenial(supabase, "owner", personalMeeting)).toBe(
        null,
      );
      const denied = await liveManagerDenial(supabase, "x", personalMeeting);
      expect(denied?.status).toBe(404);
      expect(await denied?.json()).toEqual({ error: "Meeting not found" });
      expect(await isLiveManager(supabase, "x", personalMeeting)).toBe(false);
    });

    it("project: Owner and Admin pass, others 403, non members 404", async () => {
      queue(
        "project_members",
        ok({ role: "owner" }),
        ok({ role: "admin" }),
        ok({ role: "developer" }),
        ok({ role: "viewer" }),
        ok(null),
      );
      expect(await liveManagerDenial(supabase, "o", projectMeeting)).toBe(null);
      expect(await liveManagerDenial(supabase, "a", projectMeeting)).toBe(null);
      expect(
        (await liveManagerDenial(supabase, "d", projectMeeting))?.status,
      ).toBe(403);
      expect(
        (await liveManagerDenial(supabase, "v", projectMeeting))?.status,
      ).toBe(403);
      expect(
        (await liveManagerDenial(supabase, "x", projectMeeting))?.status,
      ).toBe(404);
    });
  });

  describe("resolveLiveCaller", () => {
    it("personal: the owner manages, an attendee participates, others are out", async () => {
      queue("meetings", personal, personal, personal);
      queue("attendance_events", ok([{ id: "e1" }]), ok([]));
      expect(await resolve("owner")).toMatchObject({ isOwner: true });
      expect(await resolve("p1")).toMatchObject({
        callerId: "p1",
        isOwner: false,
      });
      expect(await resolve("x")).toBeNull();
    });

    it("project: an Admin manages, any member participates without attendance", async () => {
      queue("meetings", project, project, project);
      queue(
        "project_members",
        // admin: the manage check
        ok({ role: "admin" }),
        // viewer: the manage check, then the membership check
        ok({ role: "viewer" }),
        ok({ role: "viewer" }),
        // non member: both checks miss
        ok(null),
        ok(null),
      );
      queue("attendance_events", ok([]));
      expect(await resolve("a1")).toMatchObject({ isOwner: true });
      expect(await resolve("v1")).toMatchObject({
        callerId: "v1",
        isOwner: false,
      });
      expect(await resolve("x")).toBeNull();
    });

    it("project: the creator who is no longer a manager is not the owner", async () => {
      queue("meetings", project);
      queue(
        "project_members",
        ok({ role: "developer" }),
        ok({ role: "developer" }),
      );
      expect(await resolve("creator")).toMatchObject({ isOwner: false });
    });

    it("keeps the guest token check unchanged", async () => {
      queue("meetings", project, project);
      mockVerify.mockResolvedValueOnce("guest-1").mockResolvedValueOnce(null);
      expect(
        await resolveLiveCaller(supabase, {
          callId: "c1",
          authUserId: null,
          guestStreamToken: "tok",
        }),
      ).toMatchObject({ callerId: "guest-1", isOwner: false });
      expect(
        await resolveLiveCaller(supabase, {
          callId: "c1",
          authUserId: null,
          guestStreamToken: "bad",
        }),
      ).toBeNull();
      expect(mockVerify).toHaveBeenCalledWith("tok", "c1");
    });
  });
});
