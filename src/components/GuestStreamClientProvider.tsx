/* eslint-disable prettier/prettier */
"use client";

import { StreamVideoClient, StreamVideo } from "@stream-io/video-react-sdk";
import { useEffect, useState, useRef } from "react";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { LoadError } from "@/components/ui/load-error";
import { LoaderOne } from "@/components/ui/loader";

// Standalone Stream provider for unauthenticated guests.
// G0 §4.5.2 — never imports or reuses StreamClientProvider (the signed-in path).
//
// Bug #1 fix: guestUserId is the server-issued user.id from POST /api/guest/request-join.
// The Stream guest token was minted for that exact id, so we MUST use it here —
// regenerating an id breaks auth.
//
// Type note: StreamVideoClientOptionsWithGuestUser has `token?: never` and
// `tokenProvider?: never` in the installed @stream-io/video-client typings, which
// reflects Stream's assumption that guest users are created client-side (no token).
// But our flow mints the guest server-side and receives an access_token back. To
// authenticate with that token we avoid the guest-user constructor overload and
// instead call client.connectUser(guestUser, accessToken) after construction —
// the same two-step pattern the signed-in StreamClientProvider uses.
//
// StrictMode ghost-participant guard: React StrictMode (dev) double-invokes
// useEffect (mount → cleanup → mount). Without a ref guard, this creates TWO
// StreamVideoClient instances. The async connectUser resolution race then causes
// setClient(firstClient) to fire AFTER setClient(secondClient), swapping the
// StreamVideo component's client prop mid-lifecycle — creating duplicate SFU
// connections for the same guest identity (ghost participant tiles).
//
// The fix mirrors the signed-in StreamClientProvider's clientRef guard: create the
// client ONCE (guarded by a ref), set it synchronously BEFORE connectUser
// resolves, and only use `connected` state to gate the WebSocket auth. This ensures
// only ONE StreamVideoClient is ever created regardless of StrictMode re-invocation.
export default function GuestStreamClientProvider({
	children,
	accessToken,
	guestUserId,
	guestDisplayName,
	guestEmail,
}: {
	children: React.ReactNode;
	accessToken: string;
	guestUserId: string;
	guestDisplayName: string;
	guestEmail: string | null;
}) {
	const [client, setClient] = useState<StreamVideoClient | null>(null);
	const [connected, setConnected] = useState(false);
	const [connectError, setConnectError] = useState<string | null>(null);
	const clientRef = useRef<StreamVideoClient | null>(null);

	// Bounded timeout: if connectUser never resolves (e.g. Stream API hiccup),
	// surface a recoverable error instead of an infinite spinner.
	const { timedOut } = useLoadingTimeout(!connected && !connectError, {
		timeoutMs: 8000,
		onTimeout: () => {
			setConnectError(
				"We couldn't connect to the meeting service. Check your connection and try again.",
			);
		},
	});

	useEffect(() => {
		// Clear any stale connectError from a previous attempt so that a fresh
		// connection (new credentials) starts with a clean slate.
		setConnectError(null);

		// StrictMode ghost-participant guard: React StrictMode (dev) double-invokes
		// useEffect (mount → cleanup → mount). Without this ref guard, two
		// StreamVideoClient instances would be created. The async connectUser
		// resolution race would then cause setClient(firstClient) to fire AFTER
		// setClient(secondClient), swapping the StreamVideo client prop mid-lifecycle
		// — creating duplicate SFU connections for the same guest identity (ghost
		// participant tiles). This mirrors the signed-in StreamClientProvider's
		// clientRef pattern (StreamClientProvider.tsx line 20).
		if (clientRef.current) return;

		const c = new StreamVideoClient({
			apiKey: process.env.NEXT_PUBLIC_STREAM_API_KEY!,
		});
		clientRef.current = c;
		// Set the client synchronously — BEFORE connectUser resolves — so that
		// StreamVideo renders with a stable client prop. This prevents the async
		// race where two clients' connectUser promises resolve out of order and
		// swap the StreamVideo client prop mid-lifecycle.
		setClient(c);

		// Await connectUser before marking the client as ready and rendering children.
		// Fire-and-forget (the old behavior) raced with the lobby's call.get() —
		// the call could fire before the Stream WebSocket was authenticated,
		// surfacing a false "We couldn't connect" error.
		// Include the server-minted display name so Stream renders it on the owner's
		// participant tiles instead of falling back to the guest user_id. This name
		// is authoritative (sourced from createGuestUser's stored user.name via the
		// request-join response), NOT client-supplied form state — preventing a
		// guest from spoofing an arbitrary name.
		//
		// Do not mark this user as a guest in the client options. The SDK treats
		// that marker as a request to call /guest and mint another guest. This
		// token already belongs to the server-minted guest, so the authenticated
		// token path preserves its server-side guest permissions without
		// rewrapping the user id.
		c.connectUser(
				{ id: guestUserId, name: guestDisplayName },
				accessToken,
			)
				.then(() => {
					setConnected(true);
				})
				.catch((err) => {
					console.error("[GuestStreamClientProvider] connectUser failed:", err);
					setConnectError(
						err?.message || "Failed to connect to the meeting service.",
					);
				});

		return () => {
			void c.disconnectUser();
			clientRef.current = null;
		};
	}, [accessToken, guestUserId, guestDisplayName, guestEmail]);

	if (connectError) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<LoadError message={connectError} onRetry={() => window.location.reload()} />
			</div>
		);
	}

	if (timedOut) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<LoadError
					message="We couldn't connect to the meeting service. Check your connection and try again."
					onRetry={() => window.location.reload()}
				/>
			</div>
		);
	}

	// Show a loading spinner while the Stream client is connecting.
	// This avoids flashing LoadError during the brief in-flight window
	// while connectUser resolves (~1s on a healthy connection).
	if (!client || !connected) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<LoaderOne />
			</div>
		);
	}

	return <StreamVideo client={client}>{children}</StreamVideo>;
}