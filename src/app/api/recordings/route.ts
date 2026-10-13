/* eslint-disable prettier/prettier */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { fetchUserRecordings } from "@/lib/recordings";

export async function GET() {
	const { userId } = await auth();

	if (!userId) {
		return NextResponse.json(
			{ error: "Unauthorized", recordings: [] },
			{ status: 401 },
		);
	}

	const { ok, recordings } = await fetchUserRecordings(userId);

	if (!ok) {
		return NextResponse.json(
			{ error: "Failed to fetch recordings", recordings: [] },
			{ status: 500 },
		);
	}

	return NextResponse.json({ recordings });
}
