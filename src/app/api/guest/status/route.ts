import { NextRequest, NextResponse } from "next/server";
import { getStatus } from "@/lib/guest-store";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const guest_token = searchParams.get("guest_token");
  if (!guest_token) return NextResponse.json({ error: "missing guest_token" }, { status: 400 });
  const status = await getStatus(guest_token); // pending | admitted | denied | expired | not_found
  return NextResponse.json({ status });
}
