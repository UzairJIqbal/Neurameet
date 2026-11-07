import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  NEED_ROLES,
  accessErrorResponse,
  requireProjectRole,
} from "@/lib/project-auth";
import {
  installationToken,
  pullCommits,
  type GitHubPullCommit,
} from "@/lib/github";
import { liveInstallationIds } from "@/lib/github-rules";
import type { TaskCommit, TaskCommitsResponse } from "@/lib/task-types";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const NOT_FOUND = "Task not found";
const MAX_PRS = 5;
const SHORT_SHA = 7;

type LinkRow = { repo_id: number; pr_number: number };
type RepoRow = { repo_id: number; full_name: string; installation_id: number };

function toCommit(commit: GitHubPullCommit, fullName: string): TaskCommit {
  return {
    sha: commit.sha.slice(0, SHORT_SHA),
    message: commit.commit.message.split("\n")[0],
    authorLogin: commit.author?.login ?? null,
    url: `https://github.com/${fullName}/commit/${commit.sha}`,
  };
}

/** Repos still linked to this project, under an installation that still works. */
async function liveRepos(
  supabase: ReturnType<typeof supabaseServer>,
  projectId: string,
  repoIds: number[],
): Promise<Map<number, RepoRow>> {
  const { data, error } = await supabase
    .from("github_repos")
    .select("repo_id, full_name, installation_id")
    .eq("project_id", projectId)
    .in("repo_id", repoIds);
  if (error) throw error;
  const rows = (data ?? []) as RepoRow[];
  const live = await liveInstallationIds(supabase, [
    ...new Set(rows.map((row) => row.installation_id)),
  ]);
  return new Map(
    rows
      .filter((row) => live.has(row.installation_id))
      .map((row) => [row.repo_id, row]),
  );
}

// Developer or higher. Read from GitHub on click and never stored (AC-70q).
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const supabase = supabaseServer();
    const { data: head, error: headErr } = await supabase
      .from("tasks")
      .select("project_id")
      .eq("id", id)
      .maybeSingle();
    if (headErr) throw headErr;
    if (!head) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    const projectId = (head as { project_id: string }).project_id;
    await requireProjectRole(
      supabase,
      userId,
      projectId,
      NEED_ROLES.content,
      NOT_FOUND,
    );

    const { data: linkData, error: linkErr } = await supabase
      .from("task_links")
      .select("repo_id, pr_number")
      .eq("task_id", id)
      .order("created_at", { ascending: false })
      .limit(MAX_PRS);
    if (linkErr) throw linkErr;
    const links = (linkData ?? []) as LinkRow[];
    const repos = links.length
      ? await liveRepos(supabase, projectId, [
          ...new Set(links.map((link) => link.repo_id)),
        ])
      : new Map<number, RepoRow>();

    try {
      const tokens = new Map<number, Promise<string>>();
      const tokenFor = (installationId: number) => {
        const known = tokens.get(installationId);
        if (known) return known;
        const fresh = installationToken(installationId);
        tokens.set(installationId, fresh);
        return fresh;
      };
      const reads = links.flatMap((link) => {
        const repo = repos.get(link.repo_id);
        if (!repo) return [];
        return [
          (async () => ({
            repoFullName: repo.full_name,
            prNumber: link.pr_number,
            commits: (
              await pullCommits(
                repo.full_name,
                link.pr_number,
                await tokenFor(repo.installation_id),
              )
            ).map((commit) => toCommit(commit, repo.full_name)),
          }))(),
        ];
      });
      const response: TaskCommitsResponse = {
        pullRequests: await Promise.all(reads),
      };
      return NextResponse.json(response);
    } catch (err) {
      console.error("[tasks] commit read failed:", err);
      return NextResponse.json(
        { error: "We couldn't read the commits from GitHub." },
        { status: 502 },
      );
    }
  } catch (err) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("[tasks] commits failed:", err);
    return NextResponse.json(
      { error: "Failed to load the commits" },
      { status: 500 },
    );
  }
}
