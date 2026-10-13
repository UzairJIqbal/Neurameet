/* eslint-disable prettier/prettier */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getUserRecordings } from "@/lib/recordings";

export async function GET() {
	const { userId } = await auth();

	if (!userId) {
		return NextResponse.json(
			{ error: "Unauthorized", recordings: [] },
			{ status: 401 },
		);
	}

	const recordings = await getUserRecordings(userId);

	return NextResponse.json({ recordings });
}
