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
    const { query } = (await request.json()) as { query?: string };

    if (!query || !query.trim()) {
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
