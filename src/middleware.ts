/* eslint-disable prettier/prettier */
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher([
	"/dashboard(.*)",
	"/personal-room(.*)",
	"/previous(.*)",
	"/recording(.*)",
	"/upcoming(.*)",
	"/meeting(.*)",
	"/meeting-intelligence(.*)",
	"/follow-ups(.*)",
	"/ai-chat",
	"/settings",
]);

const isPublicRoute = createRouteMatcher([
	"/",
	"/sign-in(.*)",
	"/sign-up(.*)",
	"/verify-email",
	"/meeting/:id/guest",
]);

export default clerkMiddleware(async (auth, req) => {
	const { userId } = await auth();

	// Public routes are always accessible — let them through (signed-in or not).
	// This MUST run before auth.protect() below, because /meeting/:id/guest
	// matches BOTH isPublicRoute AND isProtectedRoute (via "/meeting(.*)"),
	// so protect() would otherwise redirect signed-out visitors to sign-in.
	//
	// The isPublicRoute matcher with "/meeting/:id/guest" can fail to match
	// nested dynamic routes in some Clerk 6 versions — so we ALSO check the
	// pathname explicitly with a regex as a belt-and-suspenders guard.
	const isGuestPath = /^\/meeting\/[^/]+\/guest$/.test(req.nextUrl.pathname);
	if (isPublicRoute(req) || isGuestPath) {
		if (userId) {
			return NextResponse.redirect(new URL("/dashboard", req.url));
		}
		return; // signed-out visitor on a public route — allow through
	}

	// Guest join: signed-out visitors to the CALL ROOM (/meeting/:id) redirect
	// to the guest lobby (/meeting/:id/guest) instead of Clerk sign-in.
	// Signed-in visitors fall through to protect() below (unchanged).
	// The regex matches only /meeting/<id> and /meeting/<id>/ — it excludes the
	// already-public /meeting/:id/guest subroute and any future subroutes.
	if (/^\/meeting\/[^/]+\/?$/.test(req.nextUrl.pathname) && !userId) {
		const meetingId = req.nextUrl.pathname.split("/")[2];
		return NextResponse.redirect(new URL(`/meeting/${meetingId}/guest`, req.url));
	}

	// Protect authenticated-only routes
	if (isProtectedRoute(req)) await auth.protect();
});

export const config = {
	matcher: [
		// Skip Next.js internals and all static files, unless found in search params
		"/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
		// Always run for API routes
		"/(api|trpc)(.*)",
	],
};
