/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable prettier/prettier */
import { useUser } from "@clerk/nextjs";
import { Call, useStreamVideoClient } from "@stream-io/video-react-sdk";
import { useEffect, useMemo, useState } from "react";

export const useGetCall = () => {
	const client = useStreamVideoClient();
	const { user } = useUser();

	const [calls, setCalls] = useState<Call[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const loadCalls = async () => {
			if (!client || !user?.id) return;

			setIsLoading(true);
			setError(null);

			try {
				const { calls } = await client.queryCalls({
					filter_conditions: {
						starts_at: { $exists: true },
						$or: [
							{ created_by_user_id: user.id },
							{ members: { $in: [user.id] } },
						],
					},
					sort: [
						{
							field: "starts_at",
							direction: -1,
						},
					],
				});

				setCalls(calls ?? []);
			} catch (err: any) {
				console.error("Error loading calls:", err);
				setError(err?.message ?? "Failed to load calls");
				setCalls([]);
			} finally {
				setIsLoading(false);
			}
		};

		loadCalls();
	}, [client, user?.id]);

	// safer date handling + memoized derived data
	const now = Date.now();

	const upcomingCalls = useMemo(() => {
		return calls.filter((call) => {
			const start = call.state.startsAt;
			return start && new Date(start).getTime() > now;
		});
	}, [calls, now]);

	const previousCalls = useMemo(() => {
		return calls.filter((call) => {
			const start = call.state.startsAt;
			const ended = call.state.endedAt;

			return (start && new Date(start).getTime() < now) || !!ended;
		});
	}, [calls, now]);

	console.log("Get all calls", calls);

	return {
		upcomingCalls,
		previousCalls,
		allCalls: calls,
		isLoading,
		error,
	};
};
