import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  NEED_ROLES,
  accessErrorResponse,
  requireProjectRole,
} from "@/lib/project-auth";
import { installUrls, installationRepos } from "@/lib/github";
import type {
  GitHubRepoChoice,
  GitHubRepoListing,
  GitHubReposResponse,
} from "@/lib/github-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
type Supabase = ReturnType<typeof supabaseServer>;

const CLAIM_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const UNIQUE_VIOLATION = "23505";

type UsableInstallation = { installation_id: number; account_login: string };
type ListedRepo = {
  repo: GitHubRepoListing;
  installation: UsableInstallation;
};
type LinkedRow = {
  repo_id: number;
  project_id: string;
  installation_id: number;
  full_name: string;
  default_branch: string;
  private: boolean;
};

const LINKED_COLUMNS =
  "repo_id, project_id, installation_id, full_name, default_branch, private";

// A claim by you under 30 days old, or a repo already linked here, so a new Owner
// after a transfer still sees it. Deleted and suspended ones never count (AC-47).
async function usableInstallations(
  supabase: Supabase,
  userId: string,
  projectId: string,
): Promise<UsableInstallation[]> {
  const claimedAfter = new Date(Date.now() - CLAIM_MAX_AGE_MS).toISOString();
  const [claims, linked] = await Promise.all([
    supabase
      .from("github_installation_claims")
      .select("installation_id")
      .eq("user_id", userId)
      .gte("claimed_at", claimedAfter),
    supabase
      .from("github_repos")
      .select("installation_id")
      .eq("project_id", projectId),
  ]);
  if (claims.error) throw claims.error;
  if (linked.error) throw linked.error;

  const ids = [
    ...new Set(
      [...(claims.data ?? []), ...(linked.data ?? [])].map(
        (r) => (r as { installation_id: number }).installation_id,
      ),
    ),
  ];
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("github_installations")
    .select("installation_id, account_login")
    .in("installation_id", ids)
    .is("deleted_at", null)
    .is("suspended_at", null);
  if (error) throw error;
  return (data ?? []) as UsableInstallation[];
}

// One installation GitHub cannot read is logged and does not hide the others.
async function listUsableRepos(
  installations: UsableInstallation[],
): Promise<ListedRepo[]> {
  const results = await Promise.all(
    installations.map(async (installation) => {
      try {
        const repos = await installationRepos(installation.installation_id);
        return repos.map((repo) => ({ repo, installation }));
      } catch (err) {
        console.error("[github] installation read failed", {
          installationId: installation.installation_id,
          err,
        });
        return [];
      }
    }),
  );
  return results.flat();
}

// Owner only: repos your installations can see, with link state, plus the install links.
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const supabase = supabaseServer();
    await requireProjectRole(supabase, userId, id, NEED_ROLES.owner);

    let urls: { installUrl: string; authorizeUrl: string };
    try {
      urls = installUrls(id, userId);
    } catch (err) {
      console.error("[github] App is not configured:", err);
      return NextResponse.json(
        { error: "The GitHub App is not set up on this server yet" },
        { status: 503 },
      );
    }

    const installations = await usableInstallations(supabase, userId, id);
    const listed = await listUsableRepos(installations);

    const { data: mine, error: mineError } = await supabase
      .from("github_repos")
      .select(LINKED_COLUMNS)
      .eq("project_id", id);
    if (mineError) throw mineError;
    const mineRows = (mine ?? []) as LinkedRow[];
    const mineIds = new Set(mineRows.map((r) => r.repo_id));

    const listedIds = listed.map((l) => l.repo.id);
    let otherIds = new Set<number>();
    if (listedIds.length > 0) {
      const { data: rows, error: rowsError } = await supabase
        .from("github_repos")
        .select("repo_id")
        .in("repo_id", listedIds)
        .neq("project_id", id);
      if (rowsError) throw rowsError;
      otherIds = new Set(
        ((rows ?? []) as Array<{ repo_id: number }>).map((r) => r.repo_id),
      );
    }

    const repos: GitHubRepoChoice[] = listed.map(({ repo, installation }) => ({
      repoId: repo.id,
      fullName: repo.full_name,
      private: repo.private,
      installationId: installation.installation_id,
      accountLogin: installation.account_login,
      // Never names the other project.
      link: mineIds.has(repo.id)
        ? "this"
        : otherIds.has(repo.id)
          ? "other"
          : "none",
    }));

    // A linked repo GitHub could not list stays visible, so it can still be unlinked.
    const accounts = new Map(
      installations.map((i) => [i.installation_id, i.account_login]),
    );
    const listedSet = new Set(listedIds);
    for (const row of mineRows) {
      if (listedSet.has(row.repo_id)) continue;
      repos.push({
        repoId: row.repo_id,
        fullName: row.full_name,
        private: row.private,
        installationId: row.installation_id,
        accountLogin: accounts.get(row.installation_id) ?? "",
        link: "this",
      });
    }

    return NextResponse.json({
      repos,
      ...urls,
    } satisfies GitHubReposResponse);
  } catch (err) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("[github] repo list failed:", err);
    return NextResponse.json(
      { error: "Failed to load repositories" },
      { status: 500 },
    );
  }
}

const IN_OTHER_PROJECT = () =>
  NextResponse.json(
    { error: "This repository is linked to another project" },
    { status: 409 },
  );

// Owner only: { repoId } must come from your installation's repo list (AC-46).
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    repoId?: unknown;
  } | null;
  const repoId = body?.repoId;
  if (typeof repoId !== "number" || !Number.isSafeInteger(repoId)) {
    return NextResponse.json({ error: "repoId is required" }, { status: 422 });
  }

  try {
    const supabase = supabaseServer();
    await requireProjectRole(supabase, userId, id, NEED_ROLES.owner);

    const installations = await usableInstallations(supabase, userId, id);
    const listed = await listUsableRepos(installations);
    const found = listed.find((l) => l.repo.id === repoId);
    if (!found) {
      return NextResponse.json(
        { error: "That repository is not in an installation you can use" },
        { status: 422 },
      );
    }

    const { data: existing, error: existingError } = await supabase
      .from("github_repos")
      .select("project_id")
      .eq("repo_id", repoId)
      .maybeSingle();
    if (existingError) throw existingError;
    const linkedTo = (existing as { project_id: string } | null)?.project_id;
    if (linkedTo && linkedTo !== id) return IN_OTHER_PROJECT();
    if (linkedTo === id) return NextResponse.json({ ok: true, repoId });

    const { error: insertError } = await supabase.from("github_repos").insert({
      repo_id: repoId,
      installation_id: found.installation.installation_id,
      project_id: id,
      full_name: found.repo.full_name,
      default_branch: found.repo.default_branch,
      private: found.repo.private,
      linked_by: userId,
    });
    if (insertError) {
      // Lost the race to another link of the same repo.
      if (insertError.code === UNIQUE_VIOLATION) return IN_OTHER_PROJECT();
      throw insertError;
    }

    const { error: auditError } = await supabase.from("audit_log").insert({
      project_id: id,
      actor_id: userId,
      action: "repo.linked",
      target_type: "github_repo",
      target_id: String(repoId),
      detail: { repoId },
    });
    if (auditError) console.error("[github] audit failed:", auditError);

    return NextResponse.json({ ok: true, repoId }, { status: 201 });
  } catch (err) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("[github] repo link failed:", err);
    return NextResponse.json(
      { error: "Failed to link the repository" },
      { status: 500 },
    );
  }
}
