// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const { client, nav, toastMock } = vi.hoisted(() => ({
  client: {
    getTask: vi.fn(),
    listGitHubRepos: vi.fn(),
    linkGitHubRepo: vi.fn(),
    unlinkGitHubRepo: vi.fn(),
  },
  nav: { replace: vi.fn(), search: "" },
  toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("react-hot-toast", () => ({ default: toastMock }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => "/projects/p1",
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("@/lib/project-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/project-client")>()),
  ...client,
}));

import GitHubTab from "./GitHubTab";
import TaskDrawer from "./TaskDrawer";
import type { ProjectDetail } from "@/lib/project-types";

const project = {
  id: "p1",
  name: "Atlas",
  taskPrefix: "NM",
  role: "owner",
  memberCount: 2,
  meetingCount: 1,
  createdAt: "2026-11-01",
} as ProjectDetail;

const choice = (over = {}) => ({
  repoId: 100,
  fullName: "acme/app",
  private: true,
  installationId: 1,
  accountLogin: "acme",
  link: "none",
  ...over,
});

const detail = (over = {}) => ({
  task: {
    id: "t1",
    key: "NM-1",
    title: "Fix login",
    description: null,
    status: "completed",
    assigneeId: null,
    assigneeName: null,
    dueDate: null,
    completionKind: "merge",
    completionEvidence: "https://github.com/acme/app/pull/7",
    version: 3,
    ...over,
  },
  events: [],
  prLinks: [
    {
      id: "l1",
      state: "merged",
      merged: true,
      reverted: true,
      repoFullName: "acme/app",
      prNumber: 7,
      prTitle: "Fix login",
      prUrl: "https://github.com/acme/app/pull/7",
    },
  ],
  proofChain: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  nav.search = "";
  client.listGitHubRepos.mockResolvedValue({
    repos: [choice()],
    installUrl: "https://github.com/apps/x/installations/new",
    authorizeUrl: "https://github.com/login/oauth/authorize",
  });
});
afterEach(cleanup);

describe("GitHubTab", () => {
  it.each([
    ["connected", "success", "GitHub is connected. Pick a repository to link."],
    [
      "not_yours",
      "error",
      "That GitHub installation isn't on your account, so nothing was saved.",
    ],
    [
      "requested",
      "success",
      "Sent to your organization owner. Come back here once they approve it.",
    ],
    ["failed", "error", "We couldn't connect GitHub. Please try again."],
  ] as const)(
    "says the %s outcome and clears the address",
    async (code, kind, text) => {
      nav.search = `tab=github&github=${code}`;
      render(<GitHubTab project={project} />);
      await screen.findByText("acme/app");
      expect(toastMock[kind]).toHaveBeenCalledWith(text, {
        id: "github-outcome",
      });
      expect(nav.replace).toHaveBeenCalledWith("/projects/p1?tab=github");
    },
  );

  it("offers both GitHub links and a Private badge", async () => {
    render(<GitHubTab project={project} />);
    await screen.findByText("acme/app");
    expect(
      screen.getByRole("link", { name: /Install the GitHub App/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /I already installed it/ }),
    ).toBeTruthy();
    expect(screen.getByText("Private")).toBeTruthy();
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it("links a free repo and reloads the list", async () => {
    client.linkGitHubRepo.mockResolvedValue({ ok: true, repoId: 100 });
    render(<GitHubTab project={project} />);
    fireEvent.click(await screen.findByRole("button", { name: "Link" }));
    await waitFor(() =>
      expect(client.linkGitHubRepo).toHaveBeenCalledWith("p1", 100),
    );
    await waitFor(() =>
      expect(client.listGitHubRepos).toHaveBeenCalledTimes(2),
    );
  });

  it("blocks a repo linked to another project", async () => {
    client.listGitHubRepos.mockResolvedValue({
      repos: [choice({ link: "other" })],
      installUrl: "u",
      authorizeUrl: "a",
    });
    render(<GitHubTab project={project} />);
    await screen.findByText("Linked to another project");
    expect(screen.queryByRole("button", { name: "Link" })).toBeNull();
  });
});

describe("TaskDrawer", () => {
  it("shows an Owner the PR, the revert, and the merge evidence", async () => {
    client.getTask.mockResolvedValue(detail());
    render(<TaskDrawer taskId="t1" onClose={() => {}} />);
    await screen.findByText(/Completed by merge/);
    expect(screen.getByText(/acme\/app/)).toBeTruthy();
    expect(screen.getByText("Reverted")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "View the pull request" })
        .getAttribute("href"),
    ).toBe("https://github.com/acme/app/pull/7");
  });

  it("shows a Viewer the state and no repo, title, or link", async () => {
    client.getTask.mockResolvedValue({
      ...detail({ completionEvidence: null }),
      prLinks: [{ id: "l1", state: "merged", merged: true, reverted: false }],
    });
    render(<TaskDrawer taskId="t1" onClose={() => {}} />);
    await screen.findByText("Completed by merge");
    expect(screen.queryByText(/acme\/app/)).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("says when no PR names the task", async () => {
    client.getTask.mockResolvedValue({
      ...detail({ completionKind: null }),
      prLinks: [],
    });
    render(<TaskDrawer taskId="t1" onClose={() => {}} />);
    await screen.findByText("No pull requests name this task yet.");
  });

  it("shows an error instead of spinning when the load fails", async () => {
    client.getTask.mockRejectedValue(new Error("down"));
    render(<TaskDrawer taskId="t1" onClose={() => {}} />);
    await screen.findByText("We couldn't load this task.");
  });
});
