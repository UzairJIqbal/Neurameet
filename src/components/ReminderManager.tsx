"use client";

// Global, render-less engine that surfaces an OS/browser Notification when a
// scheduled (Upcoming) meeting enters its lead window. Source of truth for
// "enabled" is the desktopReminders localStorage pref; for "have permission"
// is Notification.permission. Runs only while the tab is open (v1 limitation —
// service-worker push is out of scope).

import { useGetCall } from "@/hooks/useGetCall";
import { readUserPrefs } from "@/lib/user-prefs";
import { Call } from "@stream-io/video-react-sdk";
import { useEffect, useRef } from "react";

const REMINDER_INTERVAL_MS = 30_000;
const LEAD_MS = 2 * 60_000; // fire up to 2 min before start
const GRACE_MS = 15 * 60_000; // still fire if started up to 15 min ago
const REMINDED_KEY = "neurameet:reminded"; // sessionStorage dedup set

function readReminded(): Set<string> {
	try {
		const raw = sessionStorage.getItem(REMINDED_KEY);
		if (!raw) return new Set<string>();
		const parsed = JSON.parse(raw) as unknown;
		return new Set(Array.isArray(parsed) ? (parsed as string[]) : []);
	} catch {
		return new Set<string>();
	}
}

function writeReminded(ids: Set<string>): void {
	try {
		sessionStorage.setItem(REMINDED_KEY, JSON.stringify(Array.from(ids)));
	} catch {
		// storage failures are best-effort — dedup may repeat, never fatal
	}
}

export default function ReminderManager() {
	const { upcomingCalls } = useGetCall();

	// Keep latest calls in a ref so the interval never needs to be torn down and
	// recreated as the Upcoming list reference changes.
	const callsRef = useRef<Call[]>(upcomingCalls);
	useEffect(() => {
		callsRef.current = upcomingCalls;
	}, [upcomingCalls]);

	useEffect(() => {
		if (typeof window === "undefined" || typeof Notification === "undefined") {
			return;
		}

		const tick = () => {
			const prefs = readUserPrefs();
			if (!prefs.desktopReminders) {
				// Pref OFF → clear dedup so a re-enabled meeting can remind again.
				try {
					sessionStorage.removeItem(REMINDED_KEY);
				} catch {
					// ignore storage failures
				}
				return;
			}

			if (Notification.permission !== "granted") {
				return; // permission is requested at the Settings toggle gesture
			}

			const reminded = readReminded();

			for (const call of callsRef.current) {
				const start = call.state.startsAt?.getTime();
				if (start === undefined) continue;

				const delta = start - Date.now();
				if (delta > LEAD_MS || delta < -GRACE_MS) continue;
				if (reminded.has(call.id)) continue;

				const title = call.state.custom?.description ?? "Your meeting";
				const notification = new Notification("NeuraMeet: meeting starting soon", {
					body: `${title} — starts ${new Date(start).toLocaleTimeString()}`,
				});
				notification.onclick = () => {
					window.focus();
					window.location.href = `/meeting/${call.id}`;
				};

				reminded.add(call.id);
			}

			writeReminded(reminded);
		};

		tick(); // evaluate immediately, then on each poll
		const handle = setInterval(tick, REMINDER_INTERVAL_MS);
		return () => clearInterval(handle);
	}, []);

	return null;
}
