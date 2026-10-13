import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { searchAcrossMeetings } from "@/agent/rag";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: unknown = await request.json().catch(() => null);
    const query =
      body && typeof body === "object"
        ? (body as { query?: unknown }).query
        : undefined;

    if (typeof query !== "string" || !query.trim()) {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 },
      );
    }

    const results = await searchAcrossMeetings(userId, query.trim());

    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    console.error("Cross-meeting search error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
