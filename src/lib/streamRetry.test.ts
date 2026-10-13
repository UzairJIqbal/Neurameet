// @vitest-environment jsdom
//
// Regression test for the meeting-creation 1006 break (2026-08-27).
//
// clicking New Meeting called call.getOrCreate, which awaits the user WebSocket.
// A transient 1006 (abnormal socket drop) rejected it and the modal stayed stuck.
// withStreamConnectionRetry retries the operation once the SDK reconnects
// (connection.changed online), so a single blip no longer fails the action.
//
// These tests prove: (1) a 1006 then reconnect recovers, (2) non-connection
// errors are surfaced without retry, (3) a persistent 1006 exhausts attempts
// instead of hanging forever.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StreamVideoClient } from "@stream-io/video-react-sdk";
import { withStreamConnectionRetry } from "./streamRetry";

const makeClient = () => {
	let listener: ((e: { online?: boolean }) => void) | null = null;
	const client = {
		on: (_e: string, cb: (e: { online?: boolean }) => void) => {
			listener = cb;
		},
		off: (_e: string, _cb: (e: { online?: boolean }) => void) => {
			listener = null;
		},
	} as unknown as StreamVideoClient;
	return { client, fireOnline: () => listener?.({ online: true }) };
};

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("withStreamConnectionRetry", () => {
	beforeEach(() => vi.clearAllMocks());

	it("retries after a 1006 once the connection comes back online", async () => {
		const { client, fireOnline } = makeClient();
		const op = vi
			.fn()
			.mockRejectedValueOnce({ isWSFailure: true, code: 1006, message: "WS failed" })
			.mockResolvedValue("created");

		const promise = withStreamConnectionRetry(client, op);
		await flush();
		fireOnline();
		const result = await promise;

		expect(result).toBe("created");
		expect(op).toHaveBeenCalledTimes(2);
	});

	it("does not retry non-connection errors", async () => {
		const { client } = makeClient();
		const op = vi.fn().mockRejectedValue(new Error("bad input"));

		await expect(withStreamConnectionRetry(client, op)).rejects.toThrow("bad input");
		expect(op).toHaveBeenCalledTimes(1);
	});

	it("exhausts attempts on a persistent 1006 instead of hanging", async () => {
		const { client, fireOnline } = makeClient();
		const op = vi.fn().mockRejectedValue({ isWSFailure: true, code: 1006 });

		const promise = withStreamConnectionRetry(client, op, 2);
		await flush();
		fireOnline();
		await expect(promise).rejects.toMatchObject({ code: 1006 });
		expect(op).toHaveBeenCalledTimes(2);
	});
});
