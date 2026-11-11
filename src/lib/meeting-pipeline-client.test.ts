import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/user-prefs", () => ({
  readUserPrefs: () => ({ aiAutoSummary: true, emailNotifications: false }),
}));
const match = vi.fn();
vi.mock("@/lib/ledger-match-client", () => ({
  requestLedgerMatch: (id: string) => match(id),
}));

import { runMeetingPipeline } from "./meeting-pipeline-client";

const json = (ok: boolean, body: object) =>
  ({ ok, json: async () => body }) as Response;

describe("runMeetingPipeline", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    match.mockReset().mockResolvedValue(true);
    vi.stubGlobal("fetch", fetchMock);
  });

  it("skips when the caller cannot manage the meeting", async () => {
    fetchMock.mockResolvedValueOnce(json(false, {}));
    expect(await runMeetingPipeline("m1")).toEqual({ status: "skipped" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("skips when a summary already exists", async () => {
    fetchMock.mockResolvedValueOnce(json(true, { insights: { summary: "x" } }));
    expect(await runMeetingPipeline("m1")).toEqual({ status: "skipped" });
  });

  it("runs process, embed, then match", async () => {
    fetchMock
      .mockResolvedValueOnce(json(true, { insights: null }))
      .mockResolvedValue(json(true, {}));
    expect(await runMeetingPipeline("m1")).toEqual({
      status: "processed",
      embedded: true,
      matched: true,
    });
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      "/api/meetings/m1",
      "/api/ai/process",
      "/api/ai/embed",
    ]);
    expect(match).toHaveBeenCalledWith("m1");
  });

  it("stops at a process failure with the server message", async () => {
    fetchMock
      .mockResolvedValueOnce(json(true, { insights: null }))
      .mockResolvedValueOnce(json(false, { error: "Quota hit" }));
    expect(await runMeetingPipeline("m1")).toEqual({
      status: "failed",
      message: "Quota hit",
    });
    expect(match).not.toHaveBeenCalled();
  });

  it("skips matching when embedding fails", async () => {
    fetchMock
      .mockResolvedValueOnce(json(true, { insights: null }))
      .mockResolvedValueOnce(json(true, {}))
      .mockResolvedValueOnce(json(false, {}));
    expect(await runMeetingPipeline("m1")).toEqual({
      status: "processed",
      embedded: false,
      matched: false,
    });
    expect(match).not.toHaveBeenCalled();
  });
});
