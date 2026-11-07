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
    updateTask: vi.fn(),
    listMembers: vi.fn(),
    addTaskComment: vi.fn(),
    deleteTaskComment: vi.fn(),
    getTaskCommits: vi.fn(),
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
import { ProjectClientError } from "@/lib/project-client";
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
  projectId: "p1",
  task: {
    id: "t1",
    key: "NM-1",
    title: "Fix login",
    description: null,
    status: "completed",
    priority: "medium",
    createdAt: "2026-11-01T10:00:00Z",
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
  proofChain: { meetingId: null, meetingTitle: null },
});

const member = (userId: string, name: string, role = "developer") => ({
  userId,
  role,
  joinedAt: "2026-11-01T10:00:00Z",
  name,
  email: `${userId}@x.test`,
});

const members = (myRole: string, me = "u1") => ({
  members: [member("u1", "Ali"), member("u2", "Sara")],
  myRole,
  me,
});

const openTask = (over = {}, extra = {}) => ({
  ...detail({
    status: "todo",
    completionKind: null,
    completionEvidence: null,
    ...over,
  }),
  prLinks: [],
  comments: [],
  commentsTruncated: false,
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  nav.search = "";
  client.listMembers.mockResolvedValue(members("owner"));
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

  it("gives an Owner every field, and saves with the version it read", async () => {
    client.getTask.mockResolvedValue(
      openTask({ assigneeId: "u2", assigneeName: "Sara" }),
    );
    client.listMembers.mockResolvedValue(members("owner"));
    client.updateTask.mockResolvedValue({ task: { priority: "high" } });
    const onChanged = vi.fn();
    render(<TaskDrawer taskId="t1" onClose={() => {}} onChanged={onChanged} />);
    const priority = await screen.findByLabelText("Priority");
    expect(screen.getByLabelText("Status")).toBeTruthy();
    expect(screen.getByLabelText("Due date")).toBeTruthy();
    const assignee = screen.getByLabelText("Assignee") as HTMLSelectElement;
    expect([...assignee.options].map((o) => o.text)).toEqual([
      "Unassigned",
      "Ali (you)",
      "Sara",
    ]);
    fireEvent.change(priority, { target: { value: "high" } });
    await waitFor(() =>
      expect(client.updateTask).toHaveBeenCalledWith("t1", {
        priority: "high",
        ifVersion: 3,
      }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("offers a Developer only themselves, and reads only on someone else's task", async () => {
    client.getTask.mockResolvedValue(openTask());
    client.listMembers.mockResolvedValue(members("developer"));
    const { unmount } = render(<TaskDrawer taskId="t1" onClose={() => {}} />);
    const assignee = (await screen.findByLabelText(
      "Assignee",
    )) as HTMLSelectElement;
    expect([...assignee.options].map((o) => o.text)).toEqual([
      "Unassigned",
      "Ali (you)",
    ]);
    unmount();

    client.getTask.mockResolvedValue(
      openTask({ assigneeId: "u2", assigneeName: "Sara" }),
    );
    render(<TaskDrawer taskId="t1" onClose={() => {}} />);
    await screen.findByText("Sara");
    await waitFor(() => expect(client.listMembers).toHaveBeenCalledTimes(2));
    expect(screen.queryByLabelText("Assignee")).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("gives a Viewer plain text, no comments, and no commits", async () => {
    client.getTask.mockResolvedValue({
      ...detail({
        status: "todo",
        completionKind: null,
        completionEvidence: null,
      }),
      prLinks: [{ id: "l1", state: "open", merged: false, reverted: false }],
    });
    client.listMembers.mockResolvedValue(members("viewer"));
    render(<TaskDrawer taskId="t1" onClose={() => {}} />);
    await screen.findByText("To Do");
    await waitFor(() => expect(client.listMembers).toHaveBeenCalled());
    expect(screen.queryByLabelText("Status")).toBeNull();
    expect(screen.queryByRole("region", { name: "Comments" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Show commits" })).toBeNull();
  });

  it("asks for evidence before completing by hand", async () => {
    client.getTask.mockResolvedValue(openTask());
    client.listMembers.mockResolvedValue(members("owner"));
    client.updateTask.mockResolvedValue({ task: { status: "completed" } });
    render(<TaskDrawer taskId="t1" onClose={() => {}} />);
    fireEvent.change(await screen.findByLabelText("Status"), {
      target: { value: "completed" },
    });
    expect(client.updateTask).not.toHaveBeenCalled();
    expect(screen.getAllByRole("dialog")).toHaveLength(2);
  });

  it("reloads and says so when someone else changed the task first", async () => {
    client.getTask.mockResolvedValue(openTask());
    client.listMembers.mockResolvedValue(members("owner"));
    client.updateTask.mockRejectedValue(new ProjectClientError(409, "Stale"));
    render(<TaskDrawer taskId="t1" onClose={() => {}} />);
    fireEvent.change(await screen.findByLabelText("Priority"), {
      target: { value: "high" },
    });
    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        "Someone else changed this task. We loaded the latest.",
      ),
    );
    expect(client.getTask).toHaveBeenCalledTimes(2);
  });

  it("edits the description", async () => {
    client.getTask.mockResolvedValue(openTask());
    client.listMembers.mockResolvedValue(members("owner"));
    client.updateTask.mockResolvedValue({ task: { description: "New words" } });
    render(<TaskDrawer taskId="t1" onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Description" }), {
      target: { value: "  New words " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(client.updateTask).toHaveBeenCalledWith("t1", {
        description: "New words",
        ifVersion: 3,
      }),
    );
  });

  it("adds a comment and tells the board", async () => {
    const comment = {
      id: "c1",
      authorId: "u1",
      authorName: "Ali",
      body: "<b>Plain</b>",
      createdAt: "2026-11-07T10:00:00Z",
    };
    client.getTask
      .mockResolvedValueOnce(openTask())
      .mockResolvedValue(openTask({}, { comments: [comment] }));
    client.listMembers.mockResolvedValue(members("developer"));
    client.addTaskComment.mockResolvedValue({ comment });
    const onCommentsChanged = vi.fn();
    render(
      <TaskDrawer
        taskId="t1"
        onClose={() => {}}
        onCommentsChanged={onCommentsChanged}
      />,
    );
    const box = await screen.findByLabelText("Add a comment");
    const send = screen.getByRole("button", {
      name: "Comment",
    }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(box, { target: { value: "<b>Plain</b>" } });
    fireEvent.click(send);
    // Shown as the literal text: nothing in a comment is ever markup.
    await screen.findByText("<b>Plain</b>");
    expect(onCommentsChanged).toHaveBeenCalledWith(1);
  });

  it("offers delete on your own comment only, unless you manage the project", async () => {
    const comments = [
      {
        id: "c1",
        authorId: "u1",
        authorName: "Ali",
        body: "Mine",
        createdAt: "2026-11-07T10:00:00Z",
      },
      {
        id: "c2",
        authorId: "u2",
        authorName: "Sara",
        body: "Theirs",
        createdAt: "2026-11-07T09:00:00Z",
      },
    ];
    client.getTask.mockResolvedValue(
      openTask({}, { comments, commentsTruncated: true }),
    );
    client.listMembers.mockResolvedValue(members("developer"));
    render(<TaskDrawer taskId="t1" onClose={() => {}} />);
    await screen.findByText("Showing the latest 50 comments.");
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: "Delete this comment" }),
      ).toHaveLength(1),
    );
  });

  it("shows commits on click, for Developer or higher", async () => {
    client.getTask.mockResolvedValue({ ...detail(), comments: [] });
    client.listMembers.mockResolvedValue(members("developer"));
    client.getTaskCommits.mockResolvedValue({
      pullRequests: [
        {
          repoFullName: "acme/app",
          prNumber: 7,
          commits: [
            {
              sha: "abcdef1",
              message: "Fix login",
              authorLogin: "dev1",
              url: "https://github.com/acme/app/commit/abcdef1",
            },
          ],
        },
      ],
    });
    render(<TaskDrawer taskId="t1" onClose={() => {}} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Show commits" }),
    );
    const sha = await screen.findByRole("link", { name: "abcdef1" });
    expect(sha.getAttribute("href")).toBe(
      "https://github.com/acme/app/commit/abcdef1",
    );
    expect(screen.getByText("dev1")).toBeTruthy();
  });

  it("says so in place when commits fail, and blanks nothing else", async () => {
    client.getTask.mockResolvedValue({ ...detail(), comments: [] });
    client.listMembers.mockResolvedValue(members("developer"));
    client.getTaskCommits.mockRejectedValue(new Error("502"));
    render(<TaskDrawer taskId="t1" onClose={() => {}} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Show commits" }),
    );
    await screen.findByText("We couldn't read the commits from GitHub.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Fix login" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Comments" })).toBeTruthy();
  });

  it("links manual evidence only when it is a web address", async () => {
    client.getTask.mockResolvedValue(
      openTask({
        status: "completed",
        completionKind: "manual",
        completionEvidence: "javascript:alert(1)",
      }),
    );
    render(<TaskDrawer taskId="t1" onClose={() => {}} />);
    await screen.findByText("Completed by hand");
    expect(screen.getByText("javascript:alert(1)").tagName).toBe("P");
  });
});
