import { createHash, timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { runDailyCron } from "@/lib/daily-cron";
import { sweepStuckMeetings } from "@/agent/meeting-pipeline";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The daily jobs answer within 60 s; the meeting sweep then runs after the
// response (spec 0005, AC-9) and needs the full Hobby ceiling.
export const maxDuration = 300;

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
  const supabase = supabaseServer();
  after(async () => {
    try {
      const swept = await sweepStuckMeetings(supabase);
      console.log("[cron] meeting sweep", { swept });
    } catch (err) {
      console.error("[cron] meeting sweep failed:", err);
    }
  });
  try {
    return NextResponse.json(await runDailyCron(supabase));
  } catch (err) {
    console.error("[cron] daily run failed:", err);
    return NextResponse.json({ error: "Cron run failed" }, { status: 500 });
  }
}
