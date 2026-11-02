import { NextResponse } from "next/server";
import { fail } from "@/lib/minutes-review";
import { verifySeal } from "@/lib/minutes-seal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tasdeeq, Verified Minutes (spec 0003, AC-16). Public, no sign in. Returns the
// result, the hash, the meeting title and date, and the status text, never the
// minutes text.

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const sealId = params.get("sealId");
  if (!sealId) return fail(400, "sealId is required");

  try {
    const result = await verifySeal(sealId, params.get("hash"));
    if (!result) return fail(404, "Seal not found");
    return NextResponse.json(result);
  } catch (err) {
    console.error("[tasdeeq] verify failed", { sealId, err });
    return fail(500, "Could not check this seal");
  }
}
