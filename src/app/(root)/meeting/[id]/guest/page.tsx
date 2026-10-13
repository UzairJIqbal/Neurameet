/* eslint-disable prettier/prettier */
"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, MutableRefObject } from "react";
import { useParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import {
  StreamCall,
  StreamTheme,
  useStreamVideoClient,
} from "@stream-io/video-react-sdk";
import type { Call } from "@stream-io/video-react-sdk";
import GuestStreamClientProvider from "@/components/GuestStreamClientProvider";
import DeviceSetup from "@/components/DeviceSetup";
import MeetingRoom from "@/components/MeetingRoom";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { LoadError } from "@/components/ui/load-error";
import { LoaderOne } from "@/components/ui/loader";
import { cn } from "@/lib/utils";

export type JoinPhase =
  | "lobby"
  | "requesting"
  | "waiting"
  | "admitted"
  | "denied"
  | "expired"
  | "not_found"
  | "error";

const POLL_INTERVAL_MS = 5000;
const REQUEST_JOIN_TIMEOUT_MS = 12000;

export default function GuestPage() {
  return <GuestLobby />;
}

// Single-screen lobby: manages all state (name/email/credentials/phase).
//
// 1. Name/email modal (immediate on load).
// 2. DeviceSetup in "lobby" phase — functional camera/mic preview, device dropdowns,
//    toggles. NO call.join() here — the call object exists via <StreamCall> but the
//    guest has not entered the SFU. This mirrors the signed-in flow where MeetingSetup
//    renders DeviceSetup before call.join() is called on button click.
// 3. "Ask to join" button → POST /api/guest/request-join → phase becomes "requesting".
// 4. If approval mode: phase becomes "waiting" → GuestWaitingScreen polls /api/guest/status.
// 5. When poll returns "admitted" → call.join({ create: false }) fires exactly once
//    (StrictMode-safe ref guard) → MeetingRoom mounts.
// 6. If open mode: request-join returns waiting=false → phase jumps to "admitted" directly.
function GuestLobby() {
  const params = useParams<{ id: string }>();
  const meetingId = params?.id ?? "";
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [guestUserId, setGuestUserId] = useState<string | null>(null);
  const [guestDisplayName, setGuestDisplayName] = useState<string | null>(
    null,
  );
  const [guestToken, setGuestToken] = useState<string | null>(null);
  const [phase, setPhase] = useState<JoinPhase>("lobby");
  const [pollError, setPollError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [nameError, setNameError] = useState("");
  const requestNonceRef = useRef<string>("");

  // Generate a request_nonce once per mount (ref so it survives re-renders).
  // A page refresh generates a new nonce → a genuinely new attempt gets a fresh token.
  if (!requestNonceRef.current) {
    requestNonceRef.current = uuidv4();
  }

  const { timedOut: requestTimedOut } = useLoadingTimeout(
    phase === "requesting",
    {
      timeoutMs: REQUEST_JOIN_TIMEOUT_MS,
      onTimeout: () => {
        setPhase("error");
        setPollError("Request timed out — please try again.");
      },
    },
  );

  // Pre-credentials: show the name/email modal immediately (no decorative lobby).
  if (!accessToken || !guestUserId || !guestToken) {
    return (
      <NameModal
        meetingId={meetingId}
        name={name}
        setName={setName}
        email={email}
        setEmail={setEmail}
        nameError={nameError}
        setNameError={setNameError}
        phase={phase}
        pollError={pollError}
        requestTimedOut={requestTimedOut}
        setPhase={setPhase}
        setPollError={setPollError}
        setAccessToken={setAccessToken}
        setGuestUserId={setGuestUserId}
        setGuestDisplayName={setGuestDisplayName}
        setGuestToken={setGuestToken}
        requestNonceRef={requestNonceRef}
      />
    );
  }

  // Once we have credentials, mount the Stream provider. Inside it:
  //   - GuestCallFlow creates the call object via call.get() (NO join yet)
  //   - <StreamCall> provides the call context that device hooks need
  //   - <StreamTheme> provides the styling
  return (
    <GuestStreamClientProvider
      accessToken={accessToken}
      guestUserId={guestUserId}
      guestDisplayName={guestDisplayName ?? ""}
      guestEmail={email || null}
    >
      <GuestCallFlow
        meetingId={meetingId}
        guestToken={guestToken}
        accessToken={accessToken}
        phase={phase}
        setPhase={setPhase}
        requestTimedOut={requestTimedOut}
        pollError={pollError}
        guestEmail={email || null}
        guestDisplayName={guestDisplayName}
      />
    </GuestStreamClientProvider>
  );
}

// Inside GuestStreamClientProvider: create the call object via call.get() (NO join),
// and render the appropriate phase content.
//
// Key correction from the previous (broken) approach:
//   call.get() fetches call metadata WITHOUT entering the SFU.
//   call.join({ create: false }) enters the SFU and must ONLY fire when the
//   owner admits the guest (phase transitions to "admitted"), NOT in the lobby.
//
// DeviceSetup renders in the "lobby" phase with the call object from <StreamCall>.
// Device managers (call.camera, call.microphone) exist on the Call instance before
// join — this is the same pattern the signed-in flow uses (MeetingSetup renders
// DeviceSetup before call.join() is called on button click).
const ADMITTED_CALL_TIMEOUT_MS = 12000;

function GuestCallFlow({
  meetingId,
  guestToken,
  accessToken,
  phase,
  setPhase,
  requestTimedOut,
  pollError,
  guestEmail,
  guestDisplayName,
}: {
  meetingId: string;
  guestToken: string;
  accessToken: string;
  phase: JoinPhase;
  setPhase: (v: JoinPhase) => void;
  requestTimedOut: boolean;
  pollError: string | null;
  guestEmail: string | null;
  guestDisplayName: string | null;
}) {
  const client = useStreamVideoClient();
  const [call, setCall] = useState<Call | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [callEnded, setCallEnded] = useState(false);

  // Timeout guard for the admitted-without-call state (open-mode race).
  // If phase is "admitted" but call is still null after this timeout,
  // call.get() genuinely failed — surface LoadError instead of spinning
  // forever. The isLoading flag resets whenever call becomes truthy,
  // so a successful call.get() resolution cancels the timer cleanly.
  const { timedOut: admittedCallTimedOut } = useLoadingTimeout(
    phase === "admitted" && !call,
    { timeoutMs: ADMITTED_CALL_TIMEOUT_MS },
  );

  // Ref guard: call.join() fires EXACTLY ONCE, only when the owner admits (phase
  // transitions to "admitted"). StrictMode double-invokes effects, so the ref
  // prevents a double-join that would create duplicate SFU participants.
  const joinFiredRef = useRef(false);

  // Create the call object and call.get() — NO join here.
  // call.get() fetches call metadata (settings, etc.) without entering the SFU.
  useEffect(() => {
    if (!client) return;
    if (call) return; // already have a call object

    let cancelled = false;
    const c = client.call("default", meetingId);
    // call.get() runs the SDK's device setup, which auto-enables the camera
    // if `camera_default_on` is true in call settings (Stream SDK default).
    // Without disabling first, this logs "[devices]: Failed to get video stream"
    // when no camera is available — the same bug class as useGetCallbyId & MeetingModel.
    ;(async () => {
      await c.camera.disable().catch(() => {});
      await c.microphone.disable().catch(() => {});
      if (!cancelled) {
        c.get()
          .then(() => {
            console.log("[guest] call.get() resolved (no join yet)", c.id);
            setCall(c);
          })
          .catch((err) => {
            console.error("[guest] call.get() failed:", err);
            setJoinError("Could not load meeting. Please check your link.");
            setPhase("error");
          });
      }
    })();
    return () => { cancelled = true; };
  }, [client, meetingId, setPhase]);

  // When the owner admits (phase becomes "admitted"), fire call.join({ create: false })
  // exactly once. This is the ONLY place call.join() is called — never in the lobby.
  // The ref guard ensures StrictMode doesn't double-fire.
  useEffect(() => {
    if (phase !== "admitted") return;
    if (joinFiredRef.current) return;
    if (!call) return;

    joinFiredRef.current = true;
    console.log("[guest] phase=admitted → firing call.join() (once)", call.id);

    call
      .join({ create: false })
      .then(() => {
        console.log("[guest] call.join() resolved, MeetingRoom will render");
      })
      .catch((err) => {
        console.error("[guest] call.join() failed:", err);
        setJoinError(
          err instanceof Error ? err.message : "Failed to enter the meeting",
        );
        setPhase("error");
      });
  }, [phase, call, setPhase]);

  // If the call ends before the guest is admitted (owner ends the call
  // while the guest is still waiting), show a clear error instead of
  // an infinite spinner. The call object exists even in the waiting
  // phase (it was fetched via call.get() without joining).
  useEffect(() => {
    if (!call || phase === "admitted" || phase === "denied" || phase === "expired") return;
    const offEnded = call.on("call.ended", () => {
      setCallEnded(true);
    });
    return () => offEnded();
  }, [call, phase]);

  // The call ended while the guest was still waiting (owner left
  // before admission). Show a clear error — not an infinite spinner.
  if (callEnded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <LoadError
          message="The meeting has ended before you could join. Share the link again to try."
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  // Call failed to load or join
  if (phase === "error" && joinError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <LoadError message={joinError} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  // Terminal phases — show message screens (no StreamCall needed).
  if (phase === "denied") {
    return (
      <TerminalScreen
        title="Request denied"
        message="The host declined your request to join this meeting."
        actionLabel="Leave"
        onAction={() => window.location.reload()}
        errorVariant
      />
    );
  }

  if (phase === "expired") {
    return (
      <TerminalScreen
        title="Session expired"
        message="Your guest request expired before the host responded. Share the link again to try joining."
      />
    );
  }

  if (phase === "not_found") {
    return (
      <TerminalScreen
        title="Meeting not found"
        message="This meeting no longer exists or the link is invalid."
        errorVariant
      />
    );
  }

  if (phase === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <LoadError
          message={pollError ?? "Something went wrong."}
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  // requestTimedOut during the pre-credentials "requesting" phase is handled
  // by NameModal. Here, requestTimedOut means the request-join POST never settled.
  if (requestTimedOut && phase !== "waiting" && phase !== "admitted") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <LoadError
          message="Something went wrong."
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  // Waiting phase: poll status until admitted/denied/expired/not_found.
  // DeviceSetup is NOT rendered during waiting — the right panel shows a spinner.
  // The call object is reused across phases (no StreamCall remount).
  if (phase === "waiting") {
    return (
      <GuestWaitingScreen
        guestToken={guestToken}
        setPhase={setPhase}
      />
    );
  }

  // Admitted phase: MeetingRoom renders inside StreamCall. call.join() has already
  // fired via the useEffect above. The same StreamCall wrapper ensures continuous
  // call state — no SFU reconnect.
  //
  // If phase is "admitted" but call is still null, we are in the open-mode
  // race: the request-join response short-circuited straight to "admitted"
  // before call.get() resolved. Show a loading spinner instead of LoadError —
  // this is the same bug class as the earlier !connected flash; a momentarily
  // null call is not an error, just an in-flight state.
  if (phase === "admitted") {
    if (!call) {
      // Show spinner while call.get() is still in-flight (the open-mode
      // race), then surface LoadError after the timeout if call never resolves.
      if (admittedCallTimedOut) {
        return (
          <div className="flex min-h-screen items-center justify-center bg-surface">
            <LoadError
              message="Could not enter the meeting. Check your connection and try again."
              onRetry={() => window.location.reload()}
            />
          </div>
        );
      }
      return (
        <div className="flex min-h-screen items-center justify-center bg-surface">
          <LoaderOne />
        </div>
      );
    }
    return (
      <StreamCall call={call}>
        <StreamTheme>
          <MeetingRoom
            guestName={guestDisplayName}
            guestEmail={guestEmail}
            guestStreamToken={accessToken}
          />
        </StreamTheme>
      </StreamCall>
    );
  }

  // Lobby phase: render DeviceSetup inside StreamCall. The call was already
  // fetched via call.get() (NOT joined). DeviceSetup shows the functional
  // VideoPreview + device dropdowns + toggle buttons — the same component
  // the signed-in MeetingSetup uses. The button label is "Ask to join"
  // instead of "Join Meeting".
  if (phase === "lobby" && call) {
    return (
      <StreamCall call={call}>
        <StreamTheme>
          <DeviceSetup
            call={call}
            buttonLabel="Ask to join"
            onJoin={() => setPhase("requesting")}
          />
        </StreamTheme>
      </StreamCall>
    );
  }

  // Requesting phase: DeviceSetup with a spinner overlay. The phase will
  // transition to "waiting" or "admitted" once the request-join API resolves.
  if (phase === "requesting" && call) {
    return (
      <StreamCall call={call}>
        <StreamTheme>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <div className="relative w-full max-w-[420px] rounded-xl border border-outline-variant bg-surface-container-lowest px-4 sm:px-8 py-6 text-center shadow-xl">
              <div className="flex items-center justify-center gap-3 text-body-md text-on-surface-variant">
                <svg
                  className="animate-spin h-5 w-5 text-primary-container"
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
                Sending your request to the host…
              </div>
            </div>
          </div>
        </StreamTheme>
      </StreamCall>
    );
  }

  // Call is still loading — show spinner.
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <div className="text-center">
        <svg
          className="animate-spin h-8 w-8 text-primary mx-auto mb-4"
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
        <p className="text-body-md text-on-surface-variant">
          Loading meeting…
        </p>
      </div>
    </div>
  );
}

// Polling wrapper for the waiting phase. Polls GET /api/guest/status
// every POLL_INTERVAL_MS until the owner admits, denies, or the request
// expires. On "admitted", the parent transitions to phase="admitted",
// which triggers the join useEffect above.
function GuestWaitingScreen({
  guestToken,
  setPhase,
}: {
  guestToken: string;
  setPhase: (v: JoinPhase) => void;
}) {
  const [pollFailCount, setPollFailCount] = useState(0);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(
          `/api/guest/status?guest_token=${encodeURIComponent(guestToken)}`,
        );
        if (!res.ok) {
          throw new Error(`status check failed (${res.status})`);
        }
        const data = await res.json();
        // Reset fail count on success.
        setPollFailCount(0);
        const statuses = [
          "pending",
          "admitted",
          "denied",
          "expired",
          "not_found",
        ] as const;
        const parsed = data.status as (typeof statuses)[number];

        if (parsed === "admitted") {
          setPhase("admitted");
        } else if (parsed === "denied") {
          setPhase("denied");
        } else if (parsed === "expired") {
          setPhase("expired");
        } else if (parsed === "not_found") {
          setPhase("not_found");
        }
        // "pending" → keep polling
      } catch (err) {
        console.debug("[guest/status] poll failed:", err);
        // Increment fail count; after 2+ consecutive failures,
        // show a LoadError so the guest knows polling is broken.
        setPollFailCount((c) => c + 1);
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [guestToken, setPhase]);

  // Consecutive poll failures — show a recoverable error.
  if (pollFailCount >= 2) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <LoadError
          message="Connection lost while waiting. Real-time events still work, but the page may not update until you retry."
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <div className="w-full max-w-2xl rounded-xl border border-outline-variant bg-surface-container-lowest px-4 sm:px-6 py-4 shadow-xl text-center">
        <h1 className="text-display-sm font-semibold text-on-surface mb-4">
          Waiting for the host
        </h1>
        <div className="flex items-center justify-center gap-3 mb-4">
          <svg
            className="animate-spin h-5 w-5 text-primary-container"
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
          <span className="text-body-sm sm:text-body-md text-on-surface-variant">
            Waiting for the host to let you in…
          </span>
        </div>
      </div>
    </div>
  );
}

// Small name/email modal that appears immediately on page load.
// Name is required (2-100 chars); email is optional (format-validated).
// On submit → POST /api/guest/request-join → credentials → DeviceSetup renders.
// No decorative "Camera is off" panel — the modal is the only pre-credentials UI.
function NameModal({
  meetingId,
  name,
  setName,
  email,
  setEmail,
  nameError,
  setNameError,
  phase,
  pollError,
  requestTimedOut,
  setPhase,
  setPollError,
  setAccessToken,
  setGuestUserId,
  setGuestDisplayName,
  setGuestToken,
  requestNonceRef,
}: {
  meetingId: string;
  name: string;
  setName: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  nameError: string;
  setNameError: (v: string) => void;
  phase: JoinPhase;
  pollError: string | null;
  requestTimedOut: boolean;
  setPhase: (v: JoinPhase) => void;
  setPollError: (v: string | null) => void;
  setAccessToken: (v: string) => void;
  setGuestUserId: (v: string) => void;
  setGuestDisplayName: (v: string) => void;
  setGuestToken: (v: string) => void;
  requestNonceRef: MutableRefObject<string>;
}) {
  const handleAskToJoin = async () => {
    // client-side validation
    if (!name || name.length < 2) {
      setNameError("Name must be at least 2 characters");
      return;
    }
    if (name.length > 100) {
      setNameError("Name must be at most 100 characters");
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+$/.test(email)) {
      setNameError("");
      setPhase("error");
      setPollError("Please enter a valid email address");
      return;
    }
    setNameError("");
    setPhase("requesting");
    setPollError(null);

    try {
      const res = await fetch("/api/guest/request-join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meetingId,
          name,
          email: email || undefined,
          request_nonce: requestNonceRef.current,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `request-join failed (${res.status})`);
      }

      const data = await res.json();
      setAccessToken(data.access_token);
      setGuestUserId(data.user.id);
      // Capture the server-minted display name (authoritative, not client-supplied)
      // so we pass it to connectUser and the owner sees a real name, not user.id.
      setGuestDisplayName(data.user.name ?? name);
      setGuestToken(data.guest_token);
      // G3 open-mode short-circuit: when admission is not required, skip
      // the waiting phase and go straight to admitted.
      if (data.waiting) {
        setPhase("waiting");
      } else {
        console.log("[guest] open-mode short-circuit → phase=admitted");
        setPhase("admitted");
      }
    } catch (e) {
      setPhase("error");
      setPollError(e instanceof Error ? e.message : "Failed to request join");
    }
  };

  // Enter key on the form submits it
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAskToJoin();
    }
  };

  if (requestTimedOut) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <LoadError
          message="The meeting service is taking too long to respond."
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  // Error state — show LoadError
  if (phase === "error" && pollError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <LoadError
          message={pollError}
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  // Requesting state — show spinner overlay over the modal
  if (phase === "requesting") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest px-4 sm:px-8 py-6 text-center shadow-xl max-w-sm">
          <div className="flex items-center justify-center gap-3 text-body-md text-on-surface-variant">
            <svg
              className="animate-spin h-5 w-5 text-primary-container"
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
            Sending your request to the host…
          </div>
        </div>
      </div>
    );
  }

  // Default: show the name/email modal
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-sm rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 sm:p-6 shadow-xl">
        <h2 className="mb-4 text-sm font-medium text-on-surface">
          Enter your name to join
        </h2>
        <div className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="guest-name-modal"
              className="mb-1 block text-sm font-medium text-on-surface-variant"
            >
              Name
            </label>
            <input
              id="guest-name-modal"
              type="text"
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameError("");
              }}
              onKeyDown={handleKeyDown}
              placeholder="Your name"
              className="w-full rounded-xl border border-outline-variant bg-surface-container-low px-4 py-2.5 text-body-md text-on-surface placeholder-on-surface-variant/40 focus:border-primary-container focus:outline-none focus:ring-2 focus:ring-primary-container/20"
            />
            {nameError && (
              <p className="mt-1 text-body-sm text-error">{nameError}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="guest-email-modal"
              className="mb-1 block text-sm font-medium text-on-surface-variant"
            >
              Email (optional)
            </label>
            <input
              id="guest-email-modal"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-outline-variant bg-surface-container-low px-4 py-2.5 text-body-md text-on-surface placeholder-on-surface-variant/40 focus:border-primary-container focus:outline-none focus:ring-2 focus:ring-primary-container/20"
            />
          </div>

          {(pollError || nameError) && (
            <div className="rounded-lg border border-error-container bg-error-container/20 px-3 py-2 text-body-sm text-error">
              {pollError || nameError}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleAskToJoin}
          className="mt-4 w-full rounded-2xl bg-primary-container px-6 py-3 text-body-md font-semibold text-on-primary transition-colors hover:bg-primary focus:ring-2 focus:ring-primary/30 whitespace-nowrap"
        >
          Join meeting
        </button>
      </div>
    </div>
  );
}

// Render a simple terminal screen (denied, expired, not_found).
function TerminalScreen({
  title,
  message,
  actionLabel,
  onAction,
  errorVariant = false,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  errorVariant?: boolean;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-surface-container-lowest to-surface">
      <div
        className={cn(
          "rounded-xl border px-4 sm:px-8 py-12 text-center max-w-md",
          errorVariant
            ? "border-error-container bg-error-container/40 text-on-error-container"
            : "border-outline-variant bg-surface-container text-on-surface",
        )}
      >
        <h2 className="text-title-lg font-semibold mb-2">{title}</h2>
        <p
          className={cn(
            "text-body-md mb-6",
            errorVariant ? "text-on-error-container/80" : "text-on-surface-variant",
          )}
        >
          {message}
        </p>
        {actionLabel && onAction && (
          <button
            onClick={onAction}
            className="rounded-lg bg-primary px-6 py-2.5 text-body-md font-semibold text-on-primary hover:bg-primary/90"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
