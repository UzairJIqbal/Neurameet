import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockEmbedTexts } = vi.hoisted(() => ({ mockEmbedTexts: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  clerkClient: async () => ({ users: { getUserList: vi.fn() } }),
}));
vi.mock("@/agent/embed", () => ({ embedTexts: mockEmbedTexts }));

import {
  buildNameMatcher,
  embedTitle,
  locateQuote,
  suggestAssignee,
} from "./proposals";

const transcript = [
  "Ali Khan: I will ship the login fix by Friday.",
  "Sara: Sounds good, I'll review it.",
  "Ali Khan: And the docs too.",
  "Sara: the docs too, yes.",
].join("\n");

beforeEach(() => vi.clearAllMocks());

describe("locateQuote", () => {
  it("returns the first quote that matches exactly one line", () => {
    expect(locateQuote(transcript, ["ship the login fix"])).toEqual({
      quote: "ship the login fix",
      line: 1,
      speaker: "Ali Khan",
    });
  });

  it("skips a quote on two lines and moves to the next", () => {
    expect(locateQuote(transcript, ["the docs too", "I'll review it"])).toEqual(
      {
        quote: "I'll review it",
        line: 2,
        speaker: "Sara",
      },
    );
  });

  it("returns null for no quotes, blanks, or a made up quote", () => {
    expect(locateQuote(transcript, null)).toBeNull();
    expect(locateQuote(transcript, [null, "  "])).toBeNull();
    expect(locateQuote(transcript, ["we will rewrite everything"])).toBeNull();
  });
});

describe("buildNameMatcher", () => {
  const match = buildNameMatcher([
    { userId: "u1", name: "Ali Khan" },
    { userId: "u2", name: "Sara Ahmed" },
    { userId: "u3", name: "Sara Malik" },
  ]);

  it("matches a full name in any case, or a unique first name", () => {
    expect(match("ali khan")).toBe("u1");
    expect(match("Ali")).toBe("u1");
    expect(match("Sara Malik")).toBe("u3");
  });

  it("refuses a shared first name, an unknown name, and no one", () => {
    expect(match("Sara")).toBeNull();
    expect(match("Bilal")).toBeNull();
    expect(match("Ali Raza")).toBeNull();
    expect(match("me")).toBeNull();
    expect(match(null)).toBeNull();
  });
});

describe("suggestAssignee (own track rule)", () => {
  const matchName = buildNameMatcher([
    { userId: "u1", name: "Ali Khan" },
    { userId: "u2", name: "Sara Ahmed" },
  ]);
  const located = { quote: "ship it", line: 1, speaker: "Ali Khan" };

  it("suggests the speaker when the AI named the same person", () => {
    expect(
      suggestAssignee({
        located,
        speakerUserId: "u1",
        aiAssignee: "Ali",
        matchName,
      }),
    ).toBe("u1");
  });

  it("suggests no one when the AI named someone else", () => {
    expect(
      suggestAssignee({
        located,
        speakerUserId: "u1",
        aiAssignee: "Sara",
        matchName,
      }),
    ).toBeNull();
  });

  it("suggests no one without a verified quote or a resolved speaker", () => {
    expect(
      suggestAssignee({
        located: null,
        speakerUserId: "u1",
        aiAssignee: "Ali",
        matchName,
      }),
    ).toBeNull();
    expect(
      suggestAssignee({
        located,
        speakerUserId: null,
        aiAssignee: "Ali",
        matchName,
      }),
    ).toBeNull();
  });
});

describe("embedTitle", () => {
  it("returns the vector", async () => {
    mockEmbedTexts.mockResolvedValue([[0.1, 0.2]]);
    await expect(embedTitle("Fix login")).resolves.toEqual([0.1, 0.2]);
  });

  it("returns null when embedding fails", async () => {
    mockEmbedTexts.mockRejectedValue(new Error("quota"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(embedTitle("Fix login")).resolves.toBeNull();
  });
});
