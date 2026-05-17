/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { StreamClient } from "@stream-io/node-sdk";
import { auth } from "@clerk/nextjs/server";

const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
const secretKey = process.env.STREAM_SECRET_KEY;

export async function GET() {
	const { userId } = await auth();

	if (!userId) {
		return NextResponse.json(
			{ error: "Unauthorized", recordings: [] },
			{ status: 401 },
		);
	}

	if (!apiKey || !secretKey) {
		console.error("❌ Missing API keys");
		return NextResponse.json(
			{ error: "Missing API configuration", recordings: [] },
			{ status: 500 },
		);
	}

	try {
		const client = new StreamClient(apiKey, secretKey);

		const callsResponse = await client.video.queryCalls({
			filter_conditions: {
				$or: [
					{ created_by_user_id: userId },
					{ members: { $in: [userId] } },
				],
			},
			limit: 100,
			sort: [{ field: "created_at", direction: -1 }],
		});

		const calls = callsResponse.calls || [];

		const allRecordings = await Promise.all(
			calls.map(async (call: any) => {
				const callObj = call.call || call;
				const callId = callObj.id;
				const callType = callObj.type;

				try {
					const recordingsResponse = await client.video.listRecordings({
						type: callType,
						id: callId,
					});
					const recordings = recordingsResponse.recordings || [];

					return recordings.map((recording: any) => ({
						...recording,
						call_id: callId,
						call_type: callType,
					}));
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					console.warn(`  ⚠️ Call ${callId}: ${msg}`);
					return [];
				}
			}),
		);

		const recordings = allRecordings.flat();

		return NextResponse.json({ recordings });
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error("❌ API Error:", msg);

		return NextResponse.json(
			{ error: msg || "Failed to fetch recordings", recordings: [] },
			{ status: 500 },
		);
	}
}
