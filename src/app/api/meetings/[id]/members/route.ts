import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { StreamClient } from "@stream-io/node-sdk";

const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
const secretKey = process.env.STREAM_SECRET_KEY;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  const { id } = await params;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!id) {
    return NextResponse.json({ error: "Missing meeting id" }, { status: 400 });
  }

  if (!apiKey || !secretKey) {
    return NextResponse.json(
      { error: "Missing API configuration" },
      { status: 500 },
    );
  }

  try {
    const client = new StreamClient(apiKey, secretKey);
    const call = client.video.call("default", id);

    await call.get();
    await call.updateCallMembers({
      update_members: [{ user_id: userId }],
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Meeting not found";

    return NextResponse.json({ error: message }, { status: 404 });
  }
}
