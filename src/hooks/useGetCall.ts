/* eslint-disable prettier/prettier */
/* eslint-disable prettier/prettier */
import { useUser } from "@clerk/nextjs";
import { Call, useStreamVideoClient } from "@stream-io/video-react-sdk";
import { useEffect, useMemo, useRef, useState } from "react";

// A transient WebSocket drop (code 1006) that is worth retrying.
const isWsFailure = (err: unknown): boolean => {
	if (typeof err !== "object" || err === null) return false;
	const e = err as { code?: unknown; isWSFailure?: unknown };
	return e.code === 1006 || e.isWSFailure === true;
};

export const useGetCall = (reloadNonce = 0) => {
	const client = useStreamVideoClient();
	const { user } = useUser();

	const [calls, setCalls] = useState<Call[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Each load takes a new id; only the latest may write state, so an earlier
	// overlapping run (boot query vs. reconnect reload) can't apply stale data.
	const requestIdRef = useRef(0);

	useEffect(() => {
		let cancelled = false;

		const loadCalls = async () => {
			if (cancelled || !client || !user?.id) return;

			const requestId = ++requestIdRef.current;
			const isCurrent = () => !cancelled && requestId === requestIdRef.current;

			setIsLoading(true);
			setError(null);

			// Wrap the query in a timeout and retry transient WS 1006 errors
			const timeoutMs = 15000; // increased timeout to handle slower query responses
			const maxRetries = 3;
			const retryDelayMs = 500;

			const queryWithTimeout = async (): Promise<{ calls: Call[] }> => {
				let timer: ReturnType<typeof setTimeout> | undefined;
				const timeout = new Promise<never>((_, reject) => {
					timer = setTimeout(
						() => reject(new Error(`Timeout after ${timeoutMs}ms`)),
						timeoutMs,
					);
				});
				try {
					return await Promise.race([
						client.queryCalls({
							filter_conditions: {
								starts_at: { $exists: true },
								$or: [
									{ created_by_user_id: user.id },
									{ members: { $in: [user.id] } },
								],
							},
							sort: [{ field: "starts_at", direction: -1 }],
						}),
						timeout,
					]);
				} finally {
					clearTimeout(timer);
				}
			};

			try {
				let attempts = 0;
				let callsResult: Call[] = [];
				while (attempts < maxRetries) {
					try {
						const { calls } = await queryWithTimeout();
						callsResult = calls;
						break; // success
					} catch (err: unknown) {
						attempts++;
						if (attempts < maxRetries && isWsFailure(err)) {
							await new Promise((res) => setTimeout(res, retryDelayMs));
							continue;
						}
						throw err;
					}
				}

				if (!isCurrent()) return;
				setCalls(callsResult ?? []);
			} catch (err: unknown) {
				if (!isCurrent()) return;
				console.error("Error loading calls:", err);
				setError(err instanceof Error ? err.message : "Failed to load calls");
				setCalls([]);
			} finally {
				if (isCurrent()) setIsLoading(false);
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
