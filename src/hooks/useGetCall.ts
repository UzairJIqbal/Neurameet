/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable prettier/prettier */
import { useUser } from "@clerk/nextjs";
import { Call, useStreamVideoClient } from "@stream-io/video-react-sdk";
import { useEffect, useMemo, useState } from "react";

export const useGetCall = (reloadNonce = 0) => {
	const client = useStreamVideoClient();
	const { user } = useUser();

	const [calls, setCalls] = useState<Call[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		const loadCalls = async () => {
			if (cancelled || !client || !user?.id) return;

			setIsLoading(true);
			setError(null);

			// Wrap the query in a timeout and retry transient WS 1006 errors
			const timeoutMs = 15000; // increased timeout to handle slower query responses
			const maxRetries = 3;
			const retryDelayMs = 500;

			const queryWithTimeout = () => {
				return Promise.race([
					client.queryCalls({
						filter_conditions: {
							starts_at: { $exists: true },
							$or: [
								{ created_by_user_id: user.id },
								{ members: { $in: [user.id] } },
							],
						},
						sort: [
							{ field: "starts_at", direction: -1 },
						],
					}),
					new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs))
				]) as Promise<{ calls: Call[] }>;
			};

			try {
				let attempts = 0;
				let callsResult: any = [];
				while (attempts < maxRetries) {
					try {
						const { calls } = await queryWithTimeout();
						callsResult = calls;
						break; // success
					} catch (err: any) {
						attempts++;
						const isWsFailure = err?.code === 1006 || err?.isWSFailure === true;
						if (attempts < maxRetries && isWsFailure) {
							await new Promise(res => setTimeout(res, retryDelayMs));
							continue;
						}
						throw err;
					}
				}

				if (cancelled) return;
				setCalls(callsResult ?? []);
			} catch (err: any) {
				if (cancelled) return;
				console.error("Error loading calls:", err);
				setError(err?.message ?? "Failed to load calls");
				setCalls([]);
			} finally {
				if (!cancelled) setIsLoading(false);
			}
		};

		loadCalls();

		const onConnectionChanged = (event: { online?: boolean }) => {
			if (event?.online) loadCalls();
		};
		client?.on("connection.changed", onConnectionChanged);

		return () => {
			cancelled = true;
			client?.off("connection.changed", onConnectionChanged);
		};
	}, [client, user?.id, reloadNonce]);

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

	return {
		upcomingCalls,
		previousCalls,
		allCalls: calls,
		isLoading,
		error,
	};
};
