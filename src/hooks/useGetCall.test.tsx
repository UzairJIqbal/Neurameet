// @vitest-environment jsdom
//
// Regression test for the boot 1006 dashboard break (2026-08-27).
//
// At app load useGetCall fires queryCalls over the user WebSocket. If that
// socket drops with a transient 1006 before the request runs, queryCalls
// rejects. Previously there was no retry, so the dashboard stayed empty until
// a manual page refresh. The fix re-queries when the SDK emits
// connection.changed with online: true (which it does after auto-reconnect).
//
// This test fails without the fix (the list stays empty after the reconnect
// event) and passes with it (the list repopulates).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const h = vi.hoisted(() => {
	let connectionListener: ((e: { online?: boolean }) => void) | null = null;
	const queryCalls = vi.fn();
	const client = {
		queryCalls,
		on: (_event: string, cb: (e: { online?: boolean }) => void) => {
			connectionListener = cb;
		},
		off: (_event: string, _cb: (e: { online?: boolean }) => void) => {
			connectionListener = null;
		},
	};
	return { client, queryCalls, getListener: () => connectionListener };
});

vi.mock("@stream-io/video-react-sdk", () => ({
	useStreamVideoClient: () => h.client,
	Call: function () {},
}));

vi.mock("@clerk/nextjs", () => ({
	useUser: () => ({ user: { id: "u1" }, isLoaded: true }),
}));

import { useGetCall } from "./useGetCall";

describe("useGetCall boot 1006 resilience", () => {
	beforeEach(() => {
		h.queryCalls.mockReset();
	});

	afterEach(() => {
		h.queryCalls.mockReset();
	});

	it("repopulates the call list after the socket reconnects", async () => {
		// First query (boot) fails with a transient WS drop; later queries succeed.
		h.queryCalls
			.mockRejectedValueOnce(new Error("WS failed with code: 1006"))
			.mockResolvedValue({ calls: [{ id: "call_1", state: {} }] });

		const { result } = renderHook(() => useGetCall());

		// The initial failed attempt should not populate the list.
		await waitFor(() => expect(h.queryCalls).toHaveBeenCalled());
		expect(result.current.allCalls).toHaveLength(0);

		// SDK auto-reconnects and emits connection.changed with online: true.
		act(() => {
			h.getListener()?.({ online: true });
		});

		// The list must recover without a manual refresh.
		await waitFor(() => expect(result.current.allCalls).toHaveLength(1));
		expect(result.current.allCalls[0].id).toBe("call_1");
		expect(result.current.error).toBeNull();
	});
});
