// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import type { GitHubSummaryResponse } from "@/lib/github-types";
import type { ProjectFull, ProjectRole } from "@/lib/project-types";

const params = vi.hoisted(() => ({ value: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/projects/p1",
  useSearchParams: () => params.value,
}));
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("./GitHubTab", () => ({ default: () => <div>connect flow</div> }));

const client = vi.hoisted(() => ({
  getGitHubSummary: vi.fn(),
  syncGitHub: vi.fn(),
  unlinkGitHubRepo: vi.fn(),
}));
vi.mock("@/lib/project-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/project-client")>(
    "@/lib/project-client",
  );
  return { ...actual, ...client };
});

import GitHubPanel from "./GitHubPanel";

const summary: GitHubSummaryResponse = {
  repos: [
    { repoId: 100, fullName: "acme/app", private: true, defaultBranch: "main" },
  ],
  lastSyncedAt: null,
  counts: { openPrs: 1, mergedPrs: 2, linkedTasks: 3 },
  pulls: [
    {
      repoFullName: "acme/app",
      number: 7,
      title: "Fix login",
      url: "https://github.com/acme/app/pull/7",
      authorLogin: "ali",
      state: "merged",
      mergedAt: "2026-11-01T12:00:00Z",
      reverted: false,
      taskKeys: ["NM-1", "NM-2"],
    },
  ],
  truncated: false,
};

const projectAs = (role: ProjectRole, connected = true) =>
  ({
    id: "p1",
    name: "Core",
    role,
    github: { connected, repos: [], lastSyncedAt: null },
  }) as unknown as ProjectFull;

const show = (role: ProjectRole, connected = true, onChanged = vi.fn()) =>
  render(
    <GitHubPanel
      project={projectAs(role, connected)}
      reloadKey={0}
      onChanged={onChanged}
    />,
  );

beforeEach(() => {
  params.value = new URLSearchParams();
  client.getGitHubSummary.mockResolvedValue(summary);
  client.syncGitHub.mockResolvedValue({ checked: 1, updated: 0, skipped: 0 });
  client.unlinkGitHubRepo.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("GitHubPanel", () => {
  it("shows a Developer the repo, linked counts, and no Sync or Disconnect", async () => {
    show("developer");
    expect(
      await screen.findByText("acme/app", { selector: "span" }),
    ).toBeTruthy();
    expect(screen.getByText("Open linked PRs")).toBeTruthy();
    expect(screen.getByText("Private")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sync now" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Disconnect" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Manage repositories" }),
    ).toBeNull();
  });

  it("lets an Admin sync but not disconnect", async () => {
    const onChanged = vi.fn();
    show("admin", true, onChanged);
    await screen.findByText("Open linked PRs");
    expect(screen.queryByRole("button", { name: "Disconnect" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(client.syncGitHub).toHaveBeenCalledWith("p1");
  });

  it("lets the Owner disconnect behind a confirm and reveal the connect flow", async () => {
    const onChanged = vi.fn();
    show("owner", true, onChanged);
    await screen.findByText("Open linked PRs");
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(client.unlinkGitHubRepo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, disconnect" }));
    await waitFor(() =>
      expect(client.unlinkGitHubRepo).toHaveBeenCalledWith("p1", 100),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());

    expect(screen.queryByText("connect flow")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Manage repositories" }),
    );
    expect(screen.getByText("connect flow")).toBeTruthy();
  });

  it("opens the connect flow when GitHub sends the Owner back", async () => {
    params.value = new URLSearchParams("github=connected");
    show("owner");
    expect(screen.getByText("connect flow")).toBeTruthy();
  });

  it("lists the PR with its author, merge status, and task keys, with a link out", async () => {
    show("developer");
    await screen.findByText("Open linked PRs");
    fireEvent.click(screen.getByRole("tab", { name: "Pull Requests" }));
    const link = screen.getByRole("link", { name: /#7 Fix login/ });
    expect(link.getAttribute("href")).toBe(
      "https://github.com/acme/app/pull/7",
    );
    expect(screen.getByText("ali")).toBeTruthy();
    expect(screen.getByText(/^Merged (?!linked)/)).toBeTruthy();
    expect(screen.getByText("NM-1, NM-2")).toBeTruthy();
    expect(screen.getByText(/Only pull requests linked to tasks/)).toBeTruthy();
  });

  it("shows the rules and webhook events under Settings", async () => {
    show("developer");
    await screen.findByText("Open linked PRs");
    fireEvent.click(screen.getByRole("tab", { name: "Settings" }));
    expect(screen.getByText("Automation rules")).toBeTruthy();
    expect(screen.getByText("pull_request")).toBeTruthy();
  });

  it("gives a non Owner the empty state and never asks for a summary", () => {
    show("developer", false);
    expect(screen.getByText("GitHub is not connected.")).toBeTruthy();
    expect(screen.getByText("The project Owner connects it.")).toBeTruthy();
    expect(client.getGitHubSummary).not.toHaveBeenCalled();
  });

  it("gives the Owner the connect flow when nothing is linked", () => {
    show("owner", false);
    expect(screen.getByText("connect flow")).toBeTruthy();
    expect(client.getGitHubSummary).not.toHaveBeenCalled();
  });

  it("offers a retry when the summary fails", async () => {
    client.getGitHubSummary.mockRejectedValue(new Error("boom"));
    show("developer");
    expect(
      await screen.findByText("We couldn't load the GitHub summary."),
    ).toBeTruthy();
    expect(screen.queryByText("boom")).toBeNull();
  });
});
