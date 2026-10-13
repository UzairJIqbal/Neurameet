import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { generatePrepSuggestions } from "@/agent/prep";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { title, notes } = (await request.json()) as {
      title?: string;
      notes?: string;
    };

    if (!title || !title.trim()) {
      return NextResponse.json(
        { error: "Meeting title is required" },
        { status: 400 },
      );
    }

    const suggestions = await generatePrepSuggestions(
      userId,
      title.trim(),
      notes?.trim() || undefined,
    );

    return NextResponse.json({ suggestions });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Prep generation failed";
    console.error("Meeting prep error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
