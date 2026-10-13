/* eslint-disable prettier/prettier */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { deleteUserRecording } from "@/lib/recordings";

// Owner-only delete of a single recording. Ownership is enforced inside
// deleteUserRecording (it only matches recordings from the caller's own calls).
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await deleteUserRecording(userId, id);

  if (!result.ok) {
    const status = result.error === "Recording not found" ? 404 : 500;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ ok: true });
}
