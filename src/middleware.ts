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
]);

export default clerkMiddleware(async (auth, req) => {
	const { userId } = await auth();

	// Redirect authenticated users away from public pages to dashboard
	if (isPublicRoute(req) && userId) {
		return NextResponse.redirect(new URL("/dashboard", req.url));
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
