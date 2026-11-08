import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getProjectRole } from "@/lib/project-auth";
import {
  appSlug,
  githubUser,
  installUrls,
  isAccountState,
  readAccountState,
  readInstallState,
  userInstallations,
  userToken,
} from "@/lib/github";
import type { GitHubInstallationListing } from "@/lib/github-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OutcomeCode =
  "connected" | "not_yours" | "requested" | "failed" | "install";
type Supabase = ReturnType<typeof supabaseServer>;

async function storeClaims(
  supabase: Supabase,
  userId: string,
  listed: GitHubInstallationListing[],
): Promise<void> {
  const { error: installError } = await supabase
    .from("github_installations")
    .upsert(
      listed.map((installation) => ({
        installation_id: installation.id,
        account_login: installation.account?.login ?? "unknown",
        account_type: installation.account?.type ?? "User",
        installed_by: userId,
      })),
      // `installed_by` keeps its first value: a second claim never overwrites it.
      { onConflict: "installation_id", ignoreDuplicates: true },
    );
  if (installError) throw installError;

  const claimedAt = new Date().toISOString();
  const { error: claimError } = await supabase
    .from("github_installation_claims")
    .upsert(
      listed.map((installation) => ({
        installation_id: installation.id,
        user_id: userId,
        claimed_at: claimedAt,
      })),
      { onConflict: "installation_id,user_id" },
    );
  if (claimError) throw claimError;
}

async function connect(
  supabase: Supabase,
  userId: string,
  params: URLSearchParams,
): Promise<OutcomeCode> {
  if (params.get("setup_action") === "request") return "requested";
  const code = params.get("code");
  if (!code) return "failed";

  // Proves which installations this person can reach. The token ends here.
  const listed = await userInstallations(await userToken(code));
  const claimedId = params.get("installation_id");
  if (claimedId && !listed.some((i) => String(i.id) === claimedId)) {
    return "not_yours";
  }
  // Nothing installed yet and no install in progress: send them to install it.
  if (listed.length === 0) return claimedId ? "not_yours" : "install";

  await storeClaims(supabase, userId, listed);
  return "connected";
}

type AccountOutcome = "connected" | "already_linked" | "failed" | "expired";

// AC-77g: stores who you are on GitHub and nothing else. The token ends here,
// and this path grants no repo access and changes no task.
async function connectAccount(
  supabase: Supabase,
  userId: string,
  code: string,
): Promise<AccountOutcome> {
  const { id, login } = await githubUser(await userToken(code));
  const { data, error } = await supabase
    .from("user_settings")
    .select("user_id")
    .eq("github_user_id", id)
    .neq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (data) return "already_linked";

  const { error: writeError } = await supabase.from("user_settings").upsert(
    {
      user_id: userId,
      github_login: login,
      github_user_id: id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  // Someone else claimed this id between the read and the write.
  if (writeError?.code === "23505") return "already_linked";
  if (writeError) throw writeError;
  return "connected";
}

async function accountOutcome(
  userId: string,
  params: URLSearchParams,
): Promise<AccountOutcome> {
  const state = readAccountState(params.get("state"));
  if (!state || state.userId !== userId) return "expired";
  const code = params.get("code");
  if (!code) return "failed";
  try {
    return await connectAccount(supabaseServer(), userId, code);
  } catch (err) {
    console.error(
      "[github] account callback failed:",
      err instanceof Error ? err.message : "unknown error",
    );
    return "failed";
  }
}

// Every outcome redirects, so nobody lands on raw JSON (AC-43a).
export async function GET(request: Request) {
  const redirect = (path: string) =>
    NextResponse.redirect(new URL(path, request.url));

  const { userId } = await auth();
  if (!userId) {
    return redirect(`/sign-in?redirect_url=${encodeURIComponent(request.url)}`);
  }

  const params = new URL(request.url).searchParams;
  if (isAccountState(params.get("state"))) {
    const outcome = await accountOutcome(userId, params);
    return redirect(`/settings?tab=connected&github=${outcome}`);
  }

  const state = readInstallState(params.get("state"));
  if (!state || state.userId !== userId) {
    return redirect("/projects?github=expired");
  }

  const toProject = (outcome: OutcomeCode) =>
    redirect(
      `/projects/${encodeURIComponent(state.projectId)}?tab=github&github=${outcome}`,
    );

  try {
    const supabase = supabaseServer();
    const role = await getProjectRole(supabase, userId, state.projectId);
    if (role !== "owner") return toProject("failed");
    const outcome = await connect(supabase, userId, params);
    if (outcome === "install") {
      const { installUrl } = installUrls(
        state.projectId,
        userId,
        await appSlug(),
      );
      return NextResponse.redirect(installUrl);
    }
    return toProject(outcome);
  } catch (err) {
    console.error(
      "[github] callback failed:",
      err instanceof Error ? err.message : "unknown error",
    );
    return toProject("failed");
  }
}
