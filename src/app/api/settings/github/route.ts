import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { accountAuthorizeUrl } from "@/lib/github";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The status still loads on a server with no GitHub App set up.
function authorizeUrlFor(userId: string): string | null {
  try {
    return accountAuthorizeUrl(userId);
  } catch {
    return null;
  }
}

/** Your connected GitHub account and the link to connect one (AC-77f). */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { data, error } = await supabaseServer()
      .from("user_settings")
      .select("github_login, github_user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({
      connected: data?.github_user_id != null,
      login: data?.github_login ?? null,
      authorizeUrl: authorizeUrlFor(userId),
    });
  } catch (err) {
    console.error("[settings] github read failed:", err);
    return NextResponse.json(
      { error: "Failed to load your GitHub account" },
      { status: 500 },
    );
  }
}

/** Clears your link only. No installation, repo, or claim changes (AC-77f). */
export async function DELETE() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { error } = await supabaseServer()
      .from("user_settings")
      .update({
        github_login: null,
        github_user_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[settings] github disconnect failed:", err);
    return NextResponse.json(
      { error: "Failed to disconnect GitHub" },
      { status: 500 },
    );
  }
}
