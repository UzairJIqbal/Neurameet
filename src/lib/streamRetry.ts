import type { StreamVideoClient } from "@stream-io/video-react-sdk";

// Stream operations that depend on the user WebSocket (queryCalls, call.getOrCreate,
// call.join, and similar) reject with a 1006 / isWSFailure when the socket drops
// mid-flight. The SDK auto-reconnects, but the in-flight request is already dead, so
// without a retry a single transient blip fails the whole action (for example, creating
// a meeting throws and the modal stays stuck). This wrapper waits for the connection to
// come back online, then retries, so a transient drop never breaks a user action. It
// falls through to the original error if the connection never heals or the failure is
// not a connection drop (bad input, permissions, and so on).
export const withStreamConnectionRetry = async <T>(
	client: StreamVideoClient,
	op: () => Promise<T>,
	maxAttempts = 3,
): Promise<T> => {
	let lastErr: unknown;

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		try {
			return await op();
		} catch (err) {
			lastErr = err;
			const isWsFailure =
				(err as { isWSFailure?: boolean })?.isWSFailure === true ||
				(err as { code?: number })?.code === 1006;

			// Non-connection errors are real; surface them without retrying.
			if (!isWsFailure) throw err;
			if (attempt === maxAttempts - 1) break;

			await waitForConnectionOnline(client);
		}
	}

	throw lastErr;
};

const waitForConnectionOnline = (
	client: StreamVideoClient,
	timeoutMs = 8000,
): Promise<void> =>
	new Promise((resolve) => {
		let done = false;
		const finish = () => {
			if (done) return;
			done = true;
			clearTimeout(timer);
			client.off("connection.changed", onConnectionChanged);
			resolve();
		};
		const onConnectionChanged = (event: { online?: boolean }) => {
			if (event?.online) finish();
		};
		const timer = setTimeout(finish, timeoutMs);
		client.on("connection.changed", onConnectionChanged);
	});
