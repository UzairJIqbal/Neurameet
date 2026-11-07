// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import type { ProjectDetail, ProjectRole } from "@/lib/project-types";

const chat = vi.hoisted(() => ({
  useChat: vi.fn(),
  getProject: vi.fn(),
  params: new URLSearchParams(),
}));

vi.mock("@ai-sdk/react", () => ({ useChat: chat.useChat }));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/projects/p1",
  useSearchParams: () => chat.params,
}));
vi.mock("@/lib/project-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/project-client")>(
    "@/lib/project-client",
  );
  return { ...actual, getProject: chat.getProject };
});
vi.mock("./MembersTab", () => ({ default: () => <div>members tab</div> }));
vi.mock("./TasksBoard", () => ({ default: () => <div>tasks tab</div> }));
vi.mock("./ProposalsPanel", () => ({
  default: () => <div>proposals tab</div>,
}));
vi.mock("./GitHubTab", () => ({ default: () => <div>github tab</div> }));
vi.mock("./DecisionsTab", () => ({ default: () => <div>decisions tab</div> }));
vi.mock("./ActivityTab", () => ({ default: () => <div>activity tab</div> }));

import toast from "react-hot-toast";
import AssistantTab from "./AssistantTab";
import ProjectDetailView from "./ProjectDetailView";

const sources = [
  {
    marker: "S1",
    kind: "chunk",
    label: "Sprint planning, 2026-11-10",
    href: "/meeting-intelligence/m1",
  },
  {
    marker: "S2",
    kind: "task",
    label: "NM-12",
    href: "/projects/p1?tab=tasks&task=t1",
  },
];

const answer = (text: string, list: unknown = sources) => ({
  id: "a1",
  role: "assistant",
  metadata: { sources: list },
  parts: [{ type: "text", text }],
});

const mockChat = (messages: unknown[], error?: Error) =>
  chat.useChat.mockReturnValue({
    messages,
    sendMessage: vi.fn(),
    status: "ready",
    stop: vi.fn(),
    setMessages: vi.fn(),
    error,
  });

const project = (role: ProjectRole): ProjectDetail => ({
  id: "p1",
  name: "Core",
  taskPrefix: "NM",
  role,
  memberCount: 1,
  meetingCount: 1,
  createdAt: "2026-11-01T00:00:00Z",
});

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  chat.params = new URLSearchParams();
  mockChat([]);
});
afterEach(cleanup);

describe("AssistantTab", () => {
  it("uses a project chat id", () => {
    render(<AssistantTab projectId="p1" />);
    expect(chat.useChat).toHaveBeenCalledWith(
      expect.objectContaining({ id: "project:p1" }),
    );
  });

  it("drops a fake marker from the text", () => {
    mockChat([answer("Ships Friday [S1] and Monday [S9].")]);
    render(<AssistantTab projectId="p1" />);
    expect(screen.getByText("Ships Friday [S1] and Monday.")).toBeTruthy();
    expect(screen.queryByText(/S9/)).toBeNull();
  });

  it("gives a cited source a chip that links to its record, and no others", () => {
    mockChat([answer("Ships Friday [S1].")]);
    render(<AssistantTab projectId="p1" />);
    const chips = within(
      screen.getByRole("list", { name: "Sources" }),
    ).getAllByRole("link");
    expect(chips).toHaveLength(1);
    expect(chips[0].getAttribute("href")).toBe("/meeting-intelligence/m1");
    expect(chips[0].textContent).toContain("Sprint planning, 2026-11-10");
    expect(screen.queryByText("NM-12")).toBeNull();
  });

  it("shows no chips when the answer cites nothing", () => {
    mockChat([answer("Not found in this project's records.", [])]);
    render(<AssistantTab projectId="p1" />);
    expect(screen.queryByRole("list", { name: "Sources" })).toBeNull();
  });

  it("does not render an outside link or an image", () => {
    mockChat([
      answer(
        "Read [this page](https://evil.example/?d=1) ![x](https://evil.example/p.png)",
      ),
    ]);
    const { container } = render(<AssistantTab projectId="p1" />);
    expect(screen.getByText(/this page/)).toBeTruthy();
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.innerHTML).not.toContain("evil.example");
  });

  it("applies the same rule to your own message", () => {
    mockChat([
      {
        id: "u1",
        role: "user",
        parts: [
          {
            type: "text",
            text: "[click](https://evil.example) ![x](https://evil.example/p.png)",
          },
        ],
      },
    ]);
    const { container } = render(<AssistantTab projectId="p1" />);
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows the route's error text in a toast, not raw JSON", () => {
    mockChat(
      [],
      new Error(
        JSON.stringify({ error: "Could not search this project's records" }),
      ),
    );
    render(<AssistantTab projectId="p1" />);
    expect(toast.error).toHaveBeenCalledWith(
      "Could not search this project's records",
    );
  });
});

describe("ProjectDetailView assistant tab", () => {
  it("is hidden from Viewers, even with ?tab=assistant", async () => {
    chat.params = new URLSearchParams("tab=assistant");
    chat.getProject.mockResolvedValue({ project: project("viewer") });
    render(<ProjectDetailView id="p1" />);
    await screen.findByText("members tab");
    expect(screen.queryByRole("tab", { name: "AI Assistant" })).toBeNull();
    expect(chat.useChat).not.toHaveBeenCalled();
  });

  it.each<ProjectRole>(["developer", "admin", "owner"])(
    "shows for %s",
    async (role) => {
      chat.params = new URLSearchParams("tab=assistant");
      chat.getProject.mockResolvedValue({ project: project(role) });
      render(<ProjectDetailView id="p1" />);
      expect(
        await screen.findByRole("tab", { name: "AI Assistant" }),
      ).toBeTruthy();
      expect(chat.useChat).toHaveBeenCalled();
    },
  );
});
