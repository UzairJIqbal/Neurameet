import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runDailyCron } from "@/lib/daily-cron";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const digest = (text: string): Buffer =>
  createHash("sha256").update(text).digest();

// Always a 401 with no secret set. Hashing first gives both sides one length.
function isCronCall(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}

/** Vercel cron only (AC-76). */
export async function GET(req: Request) {
  if (!isCronCall(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await runDailyCron(supabaseServer()));
  } catch (err) {
    console.error("[cron] daily run failed:", err);
    return NextResponse.json({ error: "Cron run failed" }, { status: 500 });
  }
}
