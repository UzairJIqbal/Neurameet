/* eslint-disable prettier/prettier */
"use client";

import { tokenProvider } from "@/actions/stream.actions";
import Loader from "@/components/Loader";
import { LoadError } from "@/components/ui/load-error";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { useUser } from "@clerk/nextjs";
import { StreamVideo, StreamVideoClient } from "@stream-io/video-react-sdk";
import React, { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";

const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;

const StreamVideoProvider = ({ children }: { children: React.ReactNode }) => {
	const [videoClient, setVideoClient] = useState<StreamVideoClient | null>(
		null,
	);
	const { user, isLoaded } = useUser();
	const clientRef = useRef<StreamVideoClient | null>(null);
	const pathname = usePathname();

	// Signed-out guests on the guest lobby route use GuestStreamClientProvider
	// (mounted on the page itself) instead of this signed-in Stream provider.
	// Without this bypass, `user` is null so connectUser never fires, videoClient
	// stays null, the 12s timeout below fires, and the guest sees a false
	// "We couldn't connect to the meeting service" error even though the page is
	// rendering correctly. Let the guest subtree handle its own Stream client.
	const isGuestLobby = /^\/meeting\/[^/]+\/guest$/.test(pathname);

	// The whole app sits behind this gate. If Clerk never resolves a loaded
	// user (or the client can't be created) videoClient stays null and the page
	// spins forever with no escape. Borrow P0's bounded timeout so we surface a
	// recoverable error + Retry instead of an infinite spinner.
	// A signed-out user never gets a client, so they are not a connection
	// failure; they get a sign-in prompt below instead of the timeout error.
	const isSignedOut = isLoaded && !user;
	const { timedOut } = useLoadingTimeout(
		!videoClient && !isGuestLobby && !isSignedOut,
		{ timeoutMs: 12000 },
	);

	useEffect(() => {
		if (!isLoaded || !user) return;
		if (!apiKey) throw new Error("API key not found");

		// prevent duplicate client creation
		if (clientRef.current) return;

		const client = new StreamVideoClient({
			apiKey,
			user: {
				id: user.id,
				name:
				user.username ||
				user.fullName ||
				[user.firstName, user.lastName].filter(Boolean).join(" ") ||
				user.id,
				image: user.imageUrl,
			},
			tokenProvider,
		});

		clientRef.current = client;
		setVideoClient(client);

		// Open the authenticated WebSocket connection up front. Stream's REST
		// calls (e.g. client.queryCalls) wait on connectionIdPromise before
		// sending, so without an active connection the request never leaves and
		// axios aborts at its 5s timeout. Connecting here resolves that for every
		// consumer, not just call screens. connectUser dedupes by user id, so the
		// call join/get paths that also connect stay safe.
		client
			.connectUser(
				{
					id: user.id,
					name:
				user.username ||
				user.fullName ||
				[user.firstName, user.lastName].filter(Boolean).join(" ") ||
				user.id,
					image: user.imageUrl,
				},
				tokenProvider,
			)
			.catch((err) => {
				console.error("Failed to connect Stream user:", err);
			});

		return () => {
			client.disconnectUser?.();
			clientRef.current = null;
		};
	}, [user?.id, isLoaded]);

	// Guest lobby: skip this provider entirely — the page handles its own Stream client.
	if (isGuestLobby) return <>{children}</>;

	if (isSignedOut) {
		return (
			<div className="flex h-screen w-full items-center justify-center">
				<LoadError
					message="Sign in to continue."
					listHref="/sign-in"
					listLabel="Sign in"
				/>
			</div>
		);
	}

	if (timedOut) {
		return (
			<div className="flex h-screen w-full items-center justify-center">
				<LoadError
					message="We couldn't connect to the meeting service. Check your connection and try again."
					onRetry={() => window.location.reload()}
					listHref="/"
					listLabel="Back to home"
				/>
			</div>
		);
	}

	if (!videoClient) return <Loader />;

	return <StreamVideo client={videoClient}>{children}</StreamVideo>;
};

export default StreamVideoProvider;
