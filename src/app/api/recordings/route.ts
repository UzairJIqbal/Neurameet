/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { StreamClient } from "@stream-io/node-sdk";

const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
const secretKey = process.env.STREAM_SECRET_KEY;

export async function GET() {
	if (!apiKey || !secretKey) {
		console.error("❌ Missing API keys");
		return NextResponse.json(
			{ error: "Missing API configuration", recordings: [] },
			{ status: 500 },
		);
	}

	try {
		const client = new StreamClient(apiKey, secretKey);

		// Get the calls list using the correct SDK method
		console.log("📹 Fetching calls from Stream...");
		const callsResponse = await client.video.queryCalls({
			limit: 100,
			sort: [{ field: "created_at", direction: -1 }],
		});

		const calls = callsResponse.calls || [];
		console.log(`📹 Found ${calls.length} calls, querying for recordings...`);

		// For each call, get recordings
		const allRecordings = await Promise.all(
			calls.map(async (call: any) => {
				// Extract id and type - the actual call object is nested under 'call' property
				const callObj = call.call || call;
				const callId = callObj.id;
				const callType = callObj.type;

				try {
					console.log(
						`  Fetching recordings for call ${callId} (type: ${callType})...`,
					);
					const recordingsResponse = await client.video.listRecordings({
						type: callType,
						id: callId,
					});
					const recordings = recordingsResponse.recordings || [];

					if (recordings.length > 0) {
						console.log(
							`  ✓ Call ${callId}: ${recordings.length} recording(s)`,
						);
					}

					return recordings;
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					console.warn(`  ⚠️ Call ${callId}: ${msg}`);
					return [];
				}
			}),
		);

		const recordings = allRecordings.flat();
		console.log(`✅ Total recordings found: ${recordings.length}`);

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
