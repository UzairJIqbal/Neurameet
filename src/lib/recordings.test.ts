import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok, queue, resetQueues } from "@/test/supabase-queue-mock";

const { mockQueryCalls, mockListRecordings, mockDeleteRecording } = vi.hoisted(
  () => {
    process.env.NEXT_PUBLIC_STREAM_API_KEY = "key";
    process.env.STREAM_SECRET_KEY = "secret";
    return {
      mockQueryCalls: vi.fn(),
      mockListRecordings: vi.fn(),
      mockDeleteRecording: vi.fn(),
    };
  },
);

vi.mock("server-only", () => ({}));
vi.mock(
  "@/lib/supabase-server",
  async () => (await import("@/test/supabase-queue-mock")).supabaseServerModule,
);
vi.mock("@stream-io/node-sdk", () => ({
  StreamClient: vi.fn(function () {
    return {
      video: {
        queryCalls: mockQueryCalls,
        listRecordings: mockListRecordings,
        deleteRecording: mockDeleteRecording,
      },
    };
  }),
}));

import { deleteUserRecording, fetchUserRecordings } from "./recordings";

const rec = (session: string) => ({ session_id: session, filename: "f.mp4" });
let n = 0;

describe("recordings with project meetings", () => {
  let user: string;
  beforeEach(() => {
    resetQueues();
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    // A fresh user id per test so the per-user Stream cache never leaks.
    user = `u${++n}`;
    mockQueryCalls.mockResolvedValue({ calls: [] });
    mockListRecordings.mockImplementation(async ({ id }: { id: string }) => ({
      recordings: [rec(`s_${id}`)],
    }));
    mockDeleteRecording.mockResolvedValue({});
  });

  // project_members, then meetings (created project calls), then meetings (project calls)
  const access = (
    members: Array<{ project_id: string; role: string }>,
    created: Array<{ stream_call_id: string; project_id: string }>,
    projectCalls: Array<{ stream_call_id: string; project_id: string }>,
  ) => {
    queue("project_members", ok(members));
    queue("meetings", ok(created), ok(projectCalls));
  };

  it("keeps personal recordings of created calls", async () => {
    mockQueryCalls.mockResolvedValue({
      calls: [{ call: { id: "c1", type: "default" } }],
    });
    access([], [], []);
    const { ok: success, recordings } = await fetchUserRecordings(user);
    expect(success).toBe(true);
    expect(recordings.map((r) => r.call_id)).toEqual(["c1"]);
  });

  it("lists a project call's recordings for a Developer, not for a Viewer", async () => {
    access(
      [
        { project_id: "p1", role: "developer" },
        { project_id: "p2", role: "viewer" },
      ],
      [],
      [
        { stream_call_id: "pc1", project_id: "p1" },
        { stream_call_id: "pc2", project_id: "p2" },
      ],
    );
    const { recordings } = await fetchUserRecordings(user);
    expect(recordings.map((r) => r.call_id)).toEqual(["pc1"]);
  });

  it("hides a created project call once the creator is no longer a member", async () => {
    mockQueryCalls.mockResolvedValue({
      calls: [{ call: { id: "pc9", type: "default" } }],
    });
    access([], [{ stream_call_id: "pc9", project_id: "p1" }], []);
    const { recordings } = await fetchUserRecordings(user);
    expect(recordings).toEqual([]);
  });

  describe("delete", () => {
    const id = "pc1:s_pc1:f.mp4";
    const projectMeeting = ok({
      id: "m1",
      user_id: "creator",
      project_id: "p1",
    });

    it("returns 404 to a non member of the project", async () => {
      queue("meetings", projectMeeting);
      queue("project_members", ok(null));
      expect(await deleteUserRecording(user, id)).toMatchObject({
        ok: false,
        status: 404,
      });
      expect(mockDeleteRecording).not.toHaveBeenCalled();
    });

    it.each(["developer", "viewer"])(
      "returns 403 to a project %s",
      async (role) => {
        queue("meetings", projectMeeting);
        queue("project_members", ok({ role }));
        expect(await deleteUserRecording(user, id)).toMatchObject({
          ok: false,
          status: 403,
          error: "Not authorized",
        });
        expect(mockDeleteRecording).not.toHaveBeenCalled();
      },
    );

    it("lets a project Admin delete", async () => {
      queue("meetings", projectMeeting);
      queue("project_members", ok({ role: "admin" }));
      expect(await deleteUserRecording(user, id)).toEqual({ ok: true });
      expect(mockDeleteRecording).toHaveBeenCalledWith({
        type: "default",
        id: "pc1",
        session: "s_pc1",
        filename: "f.mp4",
      });
    });

    it("keeps the personal path: the creator deletes their own call's recording", async () => {
      mockQueryCalls.mockResolvedValue({
        calls: [{ call: { id: "c1", type: "default" } }],
      });
      queue("meetings", ok(null)); // no project meeting for c1
      access([], [], []);
      expect(await deleteUserRecording(user, "c1:s_c1:f.mp4")).toEqual({
        ok: true,
      });
    });

    it("keeps the personal 404 for a recording that is not yours", async () => {
      queue("meetings", ok(null));
      access([], [], []);
      expect(await deleteUserRecording(user, "cX:s:f.mp4")).toMatchObject({
        ok: false,
        error: "Recording not found",
      });
    });
  });
});
