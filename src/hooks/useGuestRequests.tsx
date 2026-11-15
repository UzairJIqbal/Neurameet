"use client";

import { useEffect, useRef, useState } from "react";
import type { Call, CustomVideoEvent } from "@stream-io/video-client";
import { useClerk } from "@clerk/nextjs";
import toast from "react-hot-toast";
import { User } from "lucide-react";

// G2: Owner notification when a guest requests to join. Used by MeetingSetup
// (the owner has not joined yet) and MeetingRoom (the owner is in the call).
// Two discovery mechanisms:
//   1. Real-time: subscribes to the "custom" event type. Custom events from
//      sendCallEvent (REST POST to /call/event) arrive as CustomVideoEvent
//      { type: "custom", custom: { event: "guest.request_join", ... } }.
//      Only delivered once the owner has joined the call.
//   2. Polling: GET /api/guest/pending every 5s, so an owner on the setup
//      screen, or one who was not on the call when the event fired, still
//      discovers pending guests.
//
// Both feed the same showGuestToast() helper. The toast uses a stable id
// (guest_token) so duplicates update the existing toast instead of stacking.
// A 10-min TTL timer auto-dismisses stale toasts (matching the guest-store TTL).
export function useGuestRequests(call: Call | undefined, isOwner: boolean) {
  const [pollFailCount, setPollFailCount] = useState(0);
  const { redirectToSignIn } = useClerk();
  // Ref so a new Clerk function identity never restarts the poll.
  const redirectRef = useRef(redirectToSignIn);
  redirectRef.current = redirectToSignIn;

  useEffect(() => {
    if (!call || !isOwner) return;

    const pendingTimers = new Map<string, NodeJS.Timeout>();

    const showGuestToast = (guestToken: string, guestName: string) => {
      // Already showing this guest (event + poll both fire): keep the existing
      // toast and its TTL timer instead of re-rendering and leaking a timer.
      if (pendingTimers.has(guestToken)) return;
      // Single-click UX: the interactive toast stays visible long enough for the
      // owner to SEE the outcome (success/error) on the same card they clicked,
      // then auto-dismisses after a short delay. Previously, the `finally` block
      // called toast.dismiss(guestToken) immediately, which removed the buttons
      // right after the API call — forcing a confusing double-click.
      // The outcome is shown inline (not via a separate toast) so the owner's
      // attention stays on the same control.
      const ToastContent = () => {
        // Separate loading state per action so clicking Accept does not show
        // a spinner on the Deny button (the old bug: shared `loading` made
        // isPending true for BOTH buttons).
        const [loadingAdmit, setLoadingAdmit] = useState(false);
        const [loadingDeny, setLoadingDeny] = useState(false);
        const [outcome, setOutcome] = useState<
          "idle" | "success" | "error" | "pending"
        >("idle");
        const admitCalled = useRef(false);
        const denyCalled = useRef(false);
        // Ref mirrors `outcome` so the finally block can read the terminal state
        // immediately after setOutcome — React batches setState, so reading the
        // `outcome` variable in finally would always see the pre-set value and
        // the delayed dismissal would never fire.
        const outcomeRef = useRef(outcome);
        const setOutcomeState = (
          v: "idle" | "success" | "error" | "pending",
        ) => {
          outcomeRef.current = v;
          setOutcome(v);
        };

        const handleAdmit = async () => {
          if (admitCalled.current) return;
          admitCalled.current = true;
          setLoadingAdmit(true);
          setOutcomeState("pending");
          try {
            const res = await fetch("/api/guest/admit", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                guest_token: guestToken,
                meeting_id: call.id,
              }),
            });
            if (res.status === 401) {
              toast.dismiss(guestToken);
              redirectRef.current({ redirectUrl: window.location.pathname });
              return;
            }
            if (res.ok) {
              toast.success("Guest admitted", { id: `success-${guestToken}` });
              setOutcomeState("success");
            } else if (res.status === 409) {
              toast.error("This request was already handled", {
                id: `error-${guestToken}`,
              });
              setOutcomeState("error");
            } else {
              toast.error("Could not admit guest — try again", {
                id: `error-${guestToken}`,
              });
              setOutcomeState("error");
            }
          } catch {
            toast.error("Network error — try again", {
              id: `error-${guestToken}`,
            });
            setOutcomeState("error");
          } finally {
            setLoadingAdmit(false);
            // Delayed dismissal so the owner sees the inline outcome. Only dismiss
            // on success/error terminal states, not on the still-pending spinner.
            if (
              outcomeRef.current === "success" ||
              outcomeRef.current === "error"
            ) {
              setTimeout(() => {
                toast.dismiss(guestToken);
                const existing = pendingTimers.get(guestToken);
                if (existing) clearTimeout(existing);
                pendingTimers.delete(guestToken);
              }, 1500);
            }
          }
        };

        const handleDeny = async () => {
          if (denyCalled.current) return;
          denyCalled.current = true;
          setLoadingDeny(true);
          setOutcomeState("pending");
          try {
            const res = await fetch("/api/guest/deny", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                guest_token: guestToken,
                meeting_id: call.id,
              }),
            });
            if (res.status === 401) {
              toast.dismiss(guestToken);
              redirectRef.current({ redirectUrl: window.location.pathname });
              return;
            }
            if (res.ok) {
              toast.success("Guest denied", { id: `success-${guestToken}` });
              setOutcomeState("success");
            } else if (res.status === 409) {
              toast.error("This request was already handled", {
                id: `error-${guestToken}`,
              });
              setOutcomeState("error");
            } else {
              toast.error("Could not deny guest — try again", {
                id: `error-${guestToken}`,
              });
              setOutcomeState("error");
            }
          } catch {
            toast.error("Network error — try again", {
              id: `error-${guestToken}`,
            });
            setOutcomeState("error");
          } finally {
            setLoadingDeny(false);
            // Delayed dismissal so the owner sees the inline outcome.
            if (
              outcomeRef.current === "success" ||
              outcomeRef.current === "error"
            ) {
              setTimeout(() => {
                toast.dismiss(guestToken);
                const existing = pendingTimers.get(guestToken);
                if (existing) clearTimeout(existing);
                pendingTimers.delete(guestToken);
              }, 1500);
            }
          }
        };

        const showOutcome = outcome === "success" || outcome === "error";
        // Each button has its own loading flag — no cross-talk.
        const admitPending = loadingAdmit;
        const denyPending = loadingDeny;

        // Constant-size container: reserve space for the button column so the
        // popup does NOT resize/stretch/deform when transitioning between idle,
        // loading, and outcome states. The spinner and the ✓/✗ occupy the same
        // reserved width, and both text lines always render (hiding text causes
        // the container to shrink). This is the "fixed-size admission toast" rule
        // from step-G1 §4.5.3: loading and success states must render inside a
        // constant-size container.
        return (
          <div className="flex min-w-[260px] sm:min-w-[280px] max-w-[calc(100vw-2rem)] items-center gap-3 rounded-xl border border-outline-variant/30 bg-inverse-surface px-4 py-3 text-inverse-on-surface">
            <User className="h-5 w-5 text-primary-container" />
            <div className="flex flex-col gap-0.5">
              <span className="text-body-sm font-medium text-inverse-on-surface">
                {showOutcome ? (
                  outcome === "success" ? (
                    (guestName ?? "Guest") + " admitted"
                  ) : (
                    "Could not admit " + (guestName ?? "guest")
                  )
                ) : (
                  <>{guestName ?? "A guest"} wants to join</>
                )}
              </span>
              <span className="text-body-xs text-inverse-on-surface/70">
                {showOutcome
                  ? "Closing…"
                  : "Review and admit to let them into the meeting"}
              </span>
            </div>
            {/* Fixed-width button column (min-w + sm:w-[90px]) so idle buttons, loading
                spinners, and outcome ✓/✗ all render in the same reserved space
                without shifting the container bounds. */}
            <div className="flex shrink-0 w-[70px] sm:w-[90px] justify-end">
              {!showOutcome ? (
                <>
                  {/* Both buttons use fixed w-[70px] sm:w-[90px] with
                      absolutely-positioned spinner overlay
                      so the button dimensions NEVER change
                      between idle and loading states.
                      This is the structural fix for the
                      repeated "Accepting…" overflow bug
                      — using min-width lets the button
                      grow past its container when the
                      longer loading text + spinner renders. */}
                  <div className="relative w-[70px] sm:w-[90px]">
                    <button
                      disabled={denyPending}
                      onClick={handleDeny}
                      className="invisible w-[70px] sm:w-[90px] rounded-xl border border-outline-variant/40 bg-inverse-on-surface/10 px-4 py-2 text-body-xs font-medium text-inverse-on-surface hover:bg-inverse-on-surface/20 disabled:opacity-50"
                    >
                      <span
                        className={denyPending ? "opacity-0" : "opacity-100"}
                      >
                        Deny
                      </span>
                      {denyPending && (
                        <span className="absolute inset-0 flex items-center justify-center">
                          <svg
                            className="animate-spin h-3 w-3"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                        </span>
                      )}
                    </button>
                  </div>
                  <div className="relative w-[70px] sm:w-[90px]">
                    <button
                      disabled={admitPending}
                      onClick={handleAdmit}
                      className="w-[70px] sm:w-[90px] rounded-xl bg-primary-container px-4 py-2 text-body-xs font-medium text-on-primary hover:bg-primary disabled:opacity-50"
                    >
                      <span
                        className={admitPending ? "opacity-0" : "opacity-100"}
                      >
                        Accept
                      </span>
                      {admitPending && (
                        <span className="absolute inset-0 flex items-center justify-center">
                          <svg
                            className="animate-spin h-3 w-3"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                        </span>
                      )}
                    </button>
                  </div>
                </>
              ) : (
                // Reserve the same height as the buttons so the container
                // doesn't collapse vertically when switching to the outcome.
                <span className="flex h-[38px] w-full items-center justify-end text-body-xs text-inverse-on-surface/70">
                  {outcome === "success" ? "✓" : "✗"}
                </span>
              )}
            </div>
          </div>
        );
      };

      toast(<ToastContent />, {
        id: guestToken,
        duration: Infinity,
      });

      const timer = setTimeout(
        () => {
          toast.dismiss(guestToken);
          pendingTimers.delete(guestToken);
        },
        10 * 60 * 1000,
      );
      pendingTimers.set(guestToken, timer);
    };

    // Real-time event listener.
    // "custom" — not "all" — is the correct wildcard for events sent via
    // sendCallEvent. The "all" meta-event filters by event.call_cid and
    // only dispatches built-in WebSocket events (call_started, participant_left, etc.).
    // Custom events from sendCallEvent arrive via call_custom_event on the WebSocket
    // and are dispatched as CustomVideoEvent { type: "custom", custom: {...} }.
    const off = call.on("custom", (event: CustomVideoEvent) => {
      if (!event.custom || event.custom.event !== "guest.request_join") return;
      const { guest_token, guest_name } = event.custom;
      if (!guest_token) return;
      showGuestToast(guest_token, guest_name);
    });

    // Polling fallback: discover pending guests every 5 seconds.
    // Only shows toasts for guests not already shown (toast id dedup handles this).
    const poll = () => {
      void fetch(`/api/guest/pending?meetingId=${encodeURIComponent(call.id)}`)
        .then((res) => {
          if (!res.ok) throw new Error(`pending check failed (${res.status})`);
          return res.json();
        })
        .then(
          (data: { pending: Array<{ guest_token: string; name: string }> }) => {
            // Reset fail count on success.
            setPollFailCount(0);
            for (const guest of data.pending) {
              showGuestToast(guest.guest_token, guest.name);
            }
          },
        )
        .catch((err) => {
          // Non-fatal — real-time events are the primary path.
          console.debug("[useGuestRequests] guest pending poll failed:", err);
          // Increment fail count; after 2 consecutive failures the owner
          // gets a one-time warning toast (the call itself keeps running).
          setPollFailCount((c) => c + 1);
        });
    };

    poll();
    const interval = setInterval(poll, 5000);

    return () => {
      off();
      clearInterval(interval);
      for (const timer of pendingTimers.values()) {
        clearTimeout(timer);
      }
    };
  }, [call, isOwner]);
  // Warn once when guest polling keeps failing. Never replace the call UI.
  useEffect(() => {
    if (pollFailCount === 2) {
      toast.error(
        "Guest discovery polling failed — pending guests may be delayed.",
        { id: "guest-poll-fail" },
      );
    }
  }, [pollFailCount]);
}
