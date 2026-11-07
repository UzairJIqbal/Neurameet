// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { listConversations } from "./chatHistory";

const save = (id: string, text: string) =>
  window.sessionStorage.setItem(
    `neurameet:chat:${id}`,
    JSON.stringify({
      updatedAt: 1,
      messages: [{ id: "1", role: "user", parts: [{ type: "text", text }] }],
    }),
  );

describe("listConversations", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("skips project assistant history and keeps the rest", () => {
    save("general", "hello");
    save("meeting-1", "about the meeting");
    save("project:p1", "about the project");

    const ids = listConversations()
      .map((c) => c.id)
      .sort();

    expect(ids).toEqual(["general", "meeting-1"]);
  });
});
