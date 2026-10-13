/* eslint-disable prettier/prettier */

import { cn } from "@/lib/utils";
import { isAlreadyRecordingError } from "@/lib/recording-state";
import {
  PaginatedGridLayout,
  SpeakerLayout,
  useCall,
  useCallStateHooks,
  CallingState,
  CallParticipantsList,
  CallStatsButton,
  CallRecordingList,
  CancelCallButton,
  ScreenShareButton,
  defaultEmojiReactionMap,
} from "@stream-io/video-react-sdk";
import type { CallRecording, CustomVideoEvent } from "@stream-io/video-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState, useEffect, useCallback, useRef } from "react";
import { LoaderOne } from "./ui/loader";
import {
  LayoutList,
  ListVideo,
  RefreshCw,
  Smile,
  Users,
  User,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Circle,
  Square,
} from "lucide-react";
import { Button } from "./ui/stateful-button";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useClerk } from "@clerk/nextjs";
import toast from "react-hot-toast";
import { useAttendanceTracking } from "@/hooks/useAttendanceTracking";
import EndCallButton from "@/components/EndCallButton";

type callTypesLayout = "grid" | "speaker-left" | "speaker-right";

// Defined OUTSIDE MeetingRoom so its identity is stable across renders.
// Defining it inside the component made every MeetingRoom re-render (e.g. when
// the attendance hook's useParticipants() churns after a camera toggle) remount
// the whole Stream layout — re-running the SDK video bind path and amplifying a
// "Maximum update depth exceeded" loop triggered by enabling the camera.
const CallLayout = ({ layout }: { layout: callTypesLayout }) => {
  switch (layout) {
    case "grid":
      return <PaginatedGridLayout />;

    case "speaker-left":
      return <SpeakerLayout participantsBarPosition="left" />;

    default:
      return <SpeakerLayout participantsBarPosition="right" />;
  }
};

type MeetingCustomData = { title?: string; description?: string };

const formatElapsed = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
};

// Recordings panel sub-components (module scope, stable identity — same reason
// as CallLayout). Stream's CallRecordingList ships light-themed default rows
// (str-video__* classes) that clash with this dark inverse-surface UI, so we
// pass tokened overrides for item/header/empty/loading and keep the component's
// built-in refresh/empty/loading orchestration.
const formatRecTime = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
};

const RecordingsPanelItem = ({ recording }: { recording: CallRecording }) => {
  const start = recording.start_time ? formatRecTime(recording.start_time) : "";
  const end = recording.end_time ? formatRecTime(recording.end_time) : "";
  return (
    <div className="grid w-full grid-cols-12 items-start gap-2 px-4 py-2">
      <div className="col-span-5 flex min-w-0 flex-col gap-1">
        <span className="truncate text-body-md font-medium text-inverse-on-surface">
          {recording.filename || "Recording"}
        </span>
        {recording.url && (
          <a
            href={recording.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit items-center gap-1 rounded-lg bg-primary-container px-2 py-1 text-label-mono font-semibold text-on-primary transition-colors hover:bg-primary"
          >
            <ListVideo size={12} aria-hidden />
            Open
          </a>
        )}
      </div>
      <span className="col-span-4 break-words text-label-mono text-inverse-on-surface/70">
        {start || (recording.end_time ? "—" : "Processing…")}
      </span>
      <span className="col-span-3 break-words text-label-mono text-inverse-on-surface/70">
        {end || (recording.start_time ? "In progress" : "—")}
      </span>
    </div>
  );
};

const RecordingsPanelHeader = ({
  callRecordings,
  onRefresh,
}: {
  callRecordings: CallRecording[];
  onRefresh?: () => void;
}) => (
  <div className="border-b border-outline-variant/20">
    <div className="flex items-center justify-between gap-2 px-4 py-3">
      <span className="text-body-md font-semibold text-inverse-on-surface">
        Recordings{callRecordings.length ? ` (${callRecordings.length})` : ""}
      </span>
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          aria-label="Refresh recordings"
          className="rounded-lg p-2 text-inverse-on-surface transition-colors hover:bg-inverse-on-surface/10"
        >
          <RefreshCw size={18} aria-hidden />
        </button>
      )}
    </div>
    <div className="grid grid-cols-12 gap-2 px-4 pb-2 text-label-caps uppercase tracking-wider text-inverse-on-surface/70">
      <span className="col-span-5">Name</span>
      <span className="col-span-4">Start time</span>
      <span className="col-span-3">End time</span>
    </div>
  </div>
);

const RecordingsPanelEmpty = () => (
  <div className="px-4 py-8 text-center text-body-md text-inverse-on-surface/70">
    No recordings yet. Composite recordings can take several minutes to finish
    processing after you stop, then appear here automatically.
  </div>
);

const RecordingsPanelLoading = () => (
  <div className="px-4 py-8 text-center text-body-md text-inverse-on-surface/70">
    Loading recordings…
  </div>
);

const MeetingRoom = ({
  guestName,
  guestEmail,
  guestStreamToken,
}: {
  guestName?: string | null;
  guestEmail?: string | null;
  guestStreamToken?: string | null;
}) => {
  const [layout, setLayout] = useState<callTypesLayout>("speaker-right");
  const [showParticipants, setShowParticipants] = useState(false);
  const [showRecordings, setShowRecordings] = useState(false);
  const [recordings, setRecordings] = useState<CallRecording[]>([]);
  // Start in the loading state so the panel never flashes the misleading
  // "No recordings available" empty message on first open (recordings is
  // still empty and the effect hasn't fired yet). It's hidden until opened,
  // so this initial value is never visible in the wrong context.
  const [recordingsLoading, setRecordingsLoading] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [pollFailCount, setPollFailCount] = useState(0);
  const {
    useCallCallingState,
    useCallCustomData,
    useParticipantCount,
    useMicrophoneState,
    useCameraState,
    useLocalParticipant,
  } = useCallStateHooks();
  const callingState = useCallCallingState();
  const callCustom = useCallCustomData() as MeetingCustomData | undefined;
  const participantCount = useParticipantCount();
  const router = useRouter();
  const call = useCall();
  const { user } = useUser();
  const { redirectToSignIn: clerkRedirect } = useClerk();
  const localParticipant = useLocalParticipant();
  const { reportLocalLeave } = useAttendanceTracking(
    !user && (guestName || guestEmail)
      ? {
          streamUserId: localParticipant?.userId ?? null,
          name: guestName ?? null,
          email: guestEmail ?? null,
          guestStreamToken: guestStreamToken ?? null,
        }
      : undefined,
  );
  // D3.4: the owner is the call creator. The Record control is owner-only
  // (UI gating) and the recording consent toast is broadcast to everyone.
  const isOwner = !!call && call.state.createdBy?.id === user?.id;
  const [isRecording, setIsRecording] = useState(false);

  // Mic / camera toggles via the device managers (stable across renders).
  const { microphone: mic, isEnabled: micOn } = useMicrophoneState();
  const { camera: cam, isEnabled: camOn } = useCameraState();

  const [reactionsOpen, setReactionsOpen] = useState(false);
  const reactionEmojis = Object.entries(defaultEmojiReactionMap) as [
    string,
    string,
  ][];

  const title =
    (callCustom?.title ?? callCustom?.description ?? "").trim() || "Meeting";

  // Set the moment any post-call navigation happens so we never navigate twice
  // (manual Leave on the owner side + the `call.ended` event can both fire).
  const recapNavigated = useRef(false);

  const OnLeave = () => {
    reportLocalLeave();
    if (!call) return;
    if (recapNavigated.current) return;
    if (!call.id) {
      console.error("OnLeave: missing call id for recap redirect");
      return;
    }
    recapNavigated.current = true;
    router.replace(`/after-meeting/${call.id}`);
  };

  // Start the call timer when the joined UI mounts (only rendered once JOINED).
  useEffect(() => {
    const id = setInterval(() => setElapsed((prev) => prev + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const loadRecordings = useCallback(
    async (opts?: { silent?: boolean }): Promise<number> => {
      // G8-F8/G8-F9: guests (non-owners) must never call queryRecordings()
      // — Stream's server rejects it with "User '...' with role 'guest' is
      // not allowed to perform action ListRecordings". Gate behind isOwner.
      if (!call || !isOwner) return 0;
      try {
        if (!opts?.silent) setRecordingsLoading(true);
        const res = await call.queryRecordings();
        const recs = res?.recordings ?? [];
        // Diagnostic (D3.4 /debug): confirm what the call actually returns so an
        // empty panel can be told apart from "never created" vs "still processing".
        console.info(
          `[recordings] queryRecordings returned ${recs.length} recording(s) for call ${call.id}`,
        );
        setRecordings(recs);
        return recs.length;
      } catch (err) {
        console.error("Failed to load recordings:", err);
        if (!opts?.silent) toast.error("Could not load recordings.");
        setRecordings([]);
        return 0;
      } finally {
        if (!opts?.silent) setRecordingsLoading(false);
      }
    },
    [call],
  );

  // D3.4 /debug: a composite frame recording is only queryable once Stream has
  // finished processing the file. Stream signals completion with a separate
  // `call.frame_recording_ready` event (not started/stopped), and processing
  // routinely takes minutes. So we (a) reload immediately on `frame_recording_ready`
  // and (b) silently poll while recording and for a bounded window after stop,
  // reloading every 10s until the ~15 min ceiling. The single on-open load alone
  // left the panel empty because the file simply wasn't ready yet.
  const didRecordRef = useRef(false);
  // Server-confirmed recording state: true only after Stream actually fires
  // `call.recording_started` (not when our optimistic local `isRecording` flips).
  // On accounts where individual recording is a no-op (startRecording resolves
  // locally but never starts server-side), `recording_started` never fires, so
  // this stays false and we never make the doomed `stopRecording("individual")`
  // call that the SDK logs as a `[coordinator]: client:post url:
  // .../recordings/individual/stop` console error. Used to gate the stop on
  // call end and on the record toggle.
  const serverRecordingRef = useRef(false);
  useEffect(() => {
    if (isRecording) didRecordRef.current = true;
    if (!didRecordRef.current) return;
    let ticks = 0;
    const id = setInterval(async () => {
      const n = await loadRecordings({ silent: true });
      if (++ticks >= 90) clearInterval(id); // poll the full ~15 min window;
      // the authoritative frame_recording_ready event also reloads. We no
      // longer stop on n > 0, because an already-existing older recording
      // would halt the poll and hide a newer one until a manual refresh.
    }, 10000);
    return () => clearInterval(id);
  }, [isRecording, loadRecordings]);

  const handleRecordToggle = useCallback(async () => {
    if (!call) return;
    try {
      if (isRecording) {
        // Opt out: stop both the transcript feeding individual audio and the
        // composite frame recording. Each is best effort so one failing never
        // blocks stopping the other. Only stop the individual recorder when
        // Stream actually confirmed it started (serverRecordingRef) — if it was a
        // no-op local resolve with no server-side recording, the stop would target
        // nothing and the SDK logs a `[coordinator]: client:post url:
        // .../recordings/individual/stop` console error we can't suppress.
        if (serverRecordingRef.current) {
          await call.stopRecording("individual").catch(() => {});
        }
        await call.stopFrameRecording().catch(() => {});
        setIsRecording(false);
      } else {
        // Opt in only: nothing is captured until the owner explicitly records.
        // Individual audio is what feeds transcript generation; the composite
        // frame recording is started best effort (D3.4: non functional on some
        // accounts) and its failure must not block the individual capture.
        try {
          await call.startRecording("individual");
          setIsRecording(true);
        } catch (startErr) {
          // Edge case: the prior session ended with the recording still active
          // (owner left without pressing Stop), so Stream still considers the
          // individual recorder started. Treat that as "already recording" and
          // continue, rather than erroring on a rejoin. Any other failure
          // propagates to the outer catch so the real message is shown.
          if (isAlreadyRecordingError(startErr)) {
            console.warn(
              "D3.4: individual recording already started (prior session), continuing:",
              startErr,
            );
            setIsRecording(true);
          } else {
            throw startErr;
          }
        }
        await call.startFrameRecording({}).catch((err) => {
          console.warn("D3.4: frame recording unavailable:", err);
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("D3.4: recording toggle failed:", err);
      toast.error(`Recording failed: ${message.slice(0, 160)}`);
    }
  }, [call, isRecording]);

  // Live-room mic/camera toggles. We must not call the SDK's enable() on a
  // device that cannot capture: when permission is "granted" but the device is
  // dead (driver/OS issue, unplugged, remote session), enable() runs a doomed
  // getUserMedia and the SDK logs "[devices]: Failed to get audio/video stream".
  // A plain toggle().catch() does not suppress the SDK's internal logger.error,
  // so we probe first and only enable after the probe succeeds — mirroring the
  // pre-join lobby guard in MeetingSetup.
  const probeMedia = async (kind: "video" | "audio"): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        kind === "video" ? { video: true } : { audio: true },
      );
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch {
      return false;
    }
  };

  const handleMicToggle = async () => {
    if (!mic) return;
    if (micOn) {
      await mic.disable().catch(() => {});
      return;
    }
    const ok = await probeMedia("audio").catch(() => false);
    if (!ok) {
      await mic.disable().catch(() => {});
      toast("Microphone unavailable — check your device or browser permission.");
      return;
    }
    await mic.enable().catch(() => {});
  };

  const handleCamToggle = async () => {
    if (!cam) return;
    if (camOn) {
      await cam.disable().catch(() => {});
      return;
    }
    const ok = await probeMedia("video").catch(() => false);
    if (!ok) {
      await cam.disable().catch(() => {});
      toast("Camera unavailable — check your device or browser permission.");
      return;
    }
    await cam.enable().catch(() => {});
  };

  // Post-call redirect: when the call ends (owner ends it, or the last
  // participant leaves), route everyone to the recap page instead of home.
  // Guard against a second navigation (the owner's manual Leave already routes
  // there, and the `ended` event can also fire for them). Use replace (not push)
  // so the recap replaces the meeting-room entry and one browser-back press
  // returns the user to where they came from, instead of stacking two entries.
  useEffect(() => {
    if (!call) return;
    const offEnded = call.on("call.ended", () => {
      // Best-effort: stop any active recording so a later session of the SAME
      // call id doesn't inherit a still-"started" individual recorder and throw
      // "already started" on rejoin (the owner left without pressing Stop).
      // Gate on `serverRecordingRef` (set only by the authoritative
      // `call.recording_started` event), NOT the optimistic local `isRecording`
      // flag: when individual recording is a no-op on this account,
      // startRecording resolves but the server never starts anything, so the stop
      // would target nothing and the coordinator rejects it — which the SDK logs
      // as a `[coordinator]: client:post url: .../recordings/individual/stop`
      // console error that our `.catch` cannot suppress. With this gate the stop
      // only fires when Stream actually confirmed a recording began. Frame
      // recording is non-functional here (D3.4) and is never started, so skip it.
      // The individual stop is fire-and-forget; failures must not block redirect.
      if (serverRecordingRef.current) {
        void call.stopRecording("individual").catch(() => {});
      }
      if (recapNavigated.current) return;
      if (!call.id) {
        console.error("call.ended: missing call id for recap redirect");
        return;
      }
      recapNavigated.current = true;
      // Best-effort: stamp the meeting "ended" + ended_at so the recap's status
      // and total time are correct even when no transcript is uploaded. Never
      // block the navigation on this; fire and forget.
      // Best-effort: expire all pending guests so their polling loops
      // transition to "expired" instead of waiting forever. Fire-and-forget;
      // failures must not block the redirect.
      if (typeof window !== "undefined") {
        void fetch("/api/guest/expire", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ meeting_id: call.id }),
        }).catch((e) =>
          console.debug("[MeetingRoom] guest expire on call.ended:", e),
        );
      }

      if (typeof window !== "undefined") {
        fetch("/api/attendance/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stream_call_id: call.id,
            event_type: "call_ended",
          }),
        }).catch(() => {});
      }
      router.replace(`/after-meeting/${call.id}`);
    });
    return () => offEnded();
  }, [call, router]);

  // D3.4 / consent: Stream broadcasts recording egress events to ALL
  // participants. Surface a visible, persistent notice the moment any recording
  // starts or stops. The generic `recording_started`/`recording_stopped` events
  // cover the individual audio that feeds transcripts as well as the composite
  // frame recording, so the notice always reflects what is actually captured.
  // `frame_recording_ready` (owner side) fires once Stream finishes processing
  // the composite file, so reload the list then.
  useEffect(() => {
    if (!call) return;
    const offStart = call.on("call.recording_started", () => {
      serverRecordingRef.current = true;
      setIsRecording(true);
      toast("This meeting is being recorded.", { icon: "🔴" });
    });
    const offStop = call.on("call.recording_stopped", () => {
      serverRecordingRef.current = false;
      setIsRecording(false);
      toast("Recording has stopped.");
    });
    const offReady = call.on("call.frame_recording_ready", () => {
      void loadRecordings();
    });
    return () => {
      offStart();
      offStop();
      offReady();
    };
  }, [call, loadRecordings]);

  // G2: Owner notification when a guest requests to join.
  // Two discovery mechanisms:
  //   1. Real-time: subscribes to the "custom" event type. Custom events from
  //      sendCallEvent (REST POST to /call/event) arrive as CustomVideoEvent
  //      { type: "custom", custom: { event: "guest.request_join", ... } }.
  //      The "all" meta-event does NOT receive them — it only dispatches
  //      built-in WebSocket events (call_started, participant_left, etc.)
  //      and filters by event.call_cid.
  //   2. Polling fallback: GET /api/guest/pending every 5s so an owner who was
  //      not on the call when the event fired can still discover pending guests.
  //
  // Both feed the same showGuestToast() helper. The toast uses a stable id
  // (guest_token) so duplicates update the existing toast instead of stacking.
  // A 10-min TTL timer auto-dismisses stale toasts (matching the guest-store TTL).
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
        const [outcome, setOutcome] = useState<"idle" | "success" | "error" | "pending">("idle");
        const admitCalled = useRef(false);
        const denyCalled = useRef(false);
        // Ref mirrors `outcome` so the finally block can read the terminal state
        // immediately after setOutcome — React batches setState, so reading the
        // `outcome` variable in finally would always see the pre-set value and
        // the delayed dismissal would never fire.
        const outcomeRef = useRef(outcome);
        const setOutcomeState = (v: "idle" | "success" | "error" | "pending") => {
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
              body: JSON.stringify({ guest_token: guestToken, meeting_id: call.id }),
            });
            if (res.status === 401) {
              toast.dismiss(guestToken);
              clerkRedirect({ redirectUrl: window.location.pathname });
              return;
            }
            if (res.ok) {
              toast.success("Guest admitted", { id: `success-${guestToken}` });
              setOutcomeState("success");
            } else if (res.status === 409) {
              toast.error("This request was already handled", { id: `error-${guestToken}` });
              setOutcomeState("error");
            } else {
              toast.error("Could not admit guest — try again", { id: `error-${guestToken}` });
              setOutcomeState("error");
            }
          } catch {
            toast.error("Network error — try again", { id: `error-${guestToken}` });
            setOutcomeState("error");
          } finally {
            setLoadingAdmit(false);
            // Delayed dismissal so the owner sees the inline outcome. Only dismiss
            // on success/error terminal states, not on the still-pending spinner.
            if (outcomeRef.current === "success" || outcomeRef.current === "error") {
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
              body: JSON.stringify({ guest_token: guestToken, meeting_id: call.id }),
            });
            if (res.status === 401) {
              toast.dismiss(guestToken);
              clerkRedirect({ redirectUrl: window.location.pathname });
              return;
            }
            if (res.ok) {
              toast.success("Guest denied", { id: `success-${guestToken}` });
              setOutcomeState("success");
            } else if (res.status === 409) {
              toast.error("This request was already handled", { id: `error-${guestToken}` });
              setOutcomeState("error");
            } else {
              toast.error("Could not deny guest — try again", { id: `error-${guestToken}` });
              setOutcomeState("error");
            }
          } catch {
            toast.error("Network error — try again", { id: `error-${guestToken}` });
            setOutcomeState("error");
          } finally {
            setLoadingDeny(false);
            // Delayed dismissal so the owner sees the inline outcome.
            if (outcomeRef.current === "success" || outcomeRef.current === "error") {
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
                  outcome === "success"
                    ? (guestName ?? "Guest") + " admitted"
                    : "Could not admit " + (guestName ?? "guest")
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
                      <span className={denyPending ? "opacity-0" : "opacity-100"}>Deny</span>
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
                      <span className={admitPending ? "opacity-0" : "opacity-100"}>Accept</span>
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

      toast(
        <ToastContent />,
        {
          id: guestToken,
          duration: Infinity,
        },
      );

      const timer = setTimeout(() => {
        toast.dismiss(guestToken);
        pendingTimers.delete(guestToken);
      }, 10 * 60 * 1000);
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
        .then((data: { pending: Array<{ guest_token: string; name: string }> }) => {
          // Reset fail count on success.
          setPollFailCount(0);
          for (const guest of data.pending) {
            showGuestToast(guest.guest_token, guest.name);
          }
        })
        .catch((err) => {
          // Non-fatal — real-time events are the primary path.
          console.debug("[MeetingRoom] guest pending poll failed:", err);
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

  // Warn once when guest polling keeps failing. Never replace the live call UI.
  useEffect(() => {
    if (pollFailCount === 2) {
      toast.error(
        "Guest discovery polling failed — pending guests may be delayed.",
        { id: "guest-poll-fail" },
      );
    }
  }, [pollFailCount]);

  // Load recordings when the panel opens; refresh re-queries on demand.
  useEffect(() => {
    if (showRecordings) void loadRecordings();
  }, [showRecordings, loadRecordings]);

  if (callingState !== CallingState.JOINED) return <LoaderOne />;

  return (
    <section className="relative min-h-screen w-full overflow-hidden bg-inverse-surface text-inverse-on-surface">
      {/* Top bar: title + elapsed timer + participant count */}
      <header className="fixed inset-x-0 top-0 z-40 flex items-center justify-between gap-3 border-b border-outline-variant/20 bg-inverse-surface/95 px-3 py-2 backdrop-blur sm:px-4">
        <div className="flex min-w-0 items-center">
          <span className="truncate text-body-md font-semibold text-inverse-on-surface">
            {title}
          </span>
        </div>
        <div
          className="font-mono text-label-mono tabular-nums text-inverse-on-surface"
          aria-label="Elapsed call time"
        >
          {formatElapsed(elapsed)}
        </div>
        <div className="flex items-center gap-1.5 text-body-md text-inverse-on-surface">
          <Users size={18} aria-hidden />
          <span className="tabular-nums">{participantCount}</span>
        </div>
        {/* D3.4: persistent recording indicator once the owner starts. */}
        {isRecording && (
          <div className="flex items-center gap-1.5 rounded-full bg-error px-2.5 py-1 text-label-mono font-semibold text-on-error">
            <Circle size={8} className="animate-pulse fill-current" aria-hidden />
            REC
          </div>
        )}
      </header>

      {/* Stage */}
      <main className="relative flex min-h-screen items-center justify-center px-2 py-20 sm:px-4">
        <div className="flex h-[calc(100vh-12rem)] w-full max-w-[1000px] items-center">
          <CallLayout layout={layout} />
        </div>
        {/* Tap-outside backdrop: when a side panel is open on a phone there is
            no in page chrome to click to dismiss it (People has a Stream close
            button, Recordings only a toggle), so a dim layer behind the panel
            gives a phone user an obvious escape. It sits below the control bar
            (z-50) and the panel (z-40) so those stay interactive; only the
            video area (z-0) is dimmed and clickable to close. */}
        {(showParticipants || showRecordings) && (
          <div
            data-testid="panel-backdrop"
            aria-hidden="true"
            onClick={() => {
              setShowParticipants(false);
              setShowRecordings(false);
            }}
            className="fixed inset-0 z-30 bg-inverse-surface/50"
          />
        )}
        <div
          data-testid="participants-panel"
          className={cn(
            "fixed top-16 bottom-32 right-2 z-40 hidden w-[calc(100vw-1rem)] max-w-[350px] overflow-y-auto rounded-lg border border-outline-variant bg-surface-container-lowest sm:static sm:ml-2 sm:h-[calc(100vh-10rem)]",
            {
              "show-block": showParticipants,
            },
          )}
        >
          <CallParticipantsList onClose={() => setShowParticipants(false)} />
        </div>
        <div
          data-testid="recordings-panel"
          className={cn(
            "fixed top-16 bottom-32 right-2 z-40 hidden w-[calc(100vw-1rem)] max-w-[350px] overflow-y-auto rounded-lg border border-outline-variant/20 bg-inverse-surface sm:static sm:ml-2 sm:h-[calc(100vh-10rem)]",
            {
              "show-block": showRecordings,
            },
          )}
        >
          <CallRecordingList
            callRecordings={recordings}
            loading={recordingsLoading}
            onRefresh={() => void loadRecordings()}
            CallRecordingListItem={RecordingsPanelItem}
            CallRecordingListHeader={RecordingsPanelHeader}
            EmptyCallRecordingList={RecordingsPanelEmpty}
            LoadingCallRecordingList={RecordingsPanelLoading}
          />
        </div>
      </main>

      {/* Control bar: pill with icon + label controls */}
      <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-2 pb-3 sm:pb-4">
        <div className="flex w-fit max-w-[calc(100vw-1rem)] flex-wrap items-center justify-center gap-2 rounded-2xl border border-outline-variant/20 bg-inverse-surface/95 px-2 py-2 backdrop-blur">
          {/* D3.4: custom controls replace CallControls so the Record control
              is owner-only and the mic/cam/screenshare/leave match the design. */}
          <button
            type="button"
            onClick={handleMicToggle}
            aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
            className="flex cursor-pointer items-center gap-2 rounded-xl bg-inverse-surface px-3 py-2 text-inverse-on-surface hover:bg-inverse-on-surface/10 sm:px-4"
          >
            {micOn ? (
              <Mic size={20} className="text-inverse-on-surface" aria-hidden />
            ) : (
              <MicOff size={20} className="text-error" aria-hidden />
            )}
            <span className="hidden text-body-md sm:inline">
              {micOn ? "Mute" : "Unmute"}
            </span>
          </button>

          <button
            type="button"
            onClick={handleCamToggle}
            aria-label={camOn ? "Turn camera off" : "Turn camera on"}
            className="flex cursor-pointer items-center gap-2 rounded-xl bg-inverse-surface px-3 py-2 text-inverse-on-surface hover:bg-inverse-on-surface/10 sm:px-4"
          >
            {camOn ? (
              <Video size={20} className="text-inverse-on-surface" aria-hidden />
            ) : (
              <VideoOff size={20} className="text-error" aria-hidden />
            )}
            <span className="hidden text-body-md sm:inline">
              {camOn ? "Stop video" : "Start video"}
            </span>
          </button>

          <ScreenShareButton caption="Share" />

          {/* D3.4 (Posture A): only the owner sees the Record control. */}
          {isOwner && (
            <Button
              onClick={handleRecordToggle}
              aria-pressed={isRecording}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 sm:px-4",
                isRecording
                  ? "bg-error text-on-error"
                  : "bg-inverse-surface text-inverse-on-surface hover:bg-inverse-on-surface/10",
              )}
            >
              {isRecording ? (
                <Square size={20} aria-hidden />
              ) : (
                <Circle size={20} aria-hidden />
              )}
              <span className="hidden text-body-md sm:inline">
                {isRecording ? "Stop" : "Record"}
              </span>
            </Button>
          )}

          <CancelCallButton onLeave={OnLeave} caption="Leave" />

          {/* The personal room is permanent: leave it, never end it for everyone. */}
          {call?.id !== user?.id && <EndCallButton />}

          <Button
            onClick={() => {
              setShowParticipants((prev) => !prev);
              setShowRecordings(false);
            }}
            className="flex cursor-pointer items-center gap-2 rounded-xl bg-inverse-surface px-3 py-2 text-inverse-on-surface hover:bg-inverse-on-surface/10 sm:px-4"
          >
            <Users size={20} className="text-inverse-on-surface" aria-hidden />
            <span className="hidden text-body-md text-inverse-on-surface sm:inline">
              People
            </span>
          </Button>

          {/* D3.4: recordings are owner-only (criterion 3). */}
          {isOwner && (
            <Button
              onClick={() => {
                setShowRecordings((prev) => !prev);
                setShowParticipants(false);
              }}
              aria-expanded={showRecordings}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-xl bg-inverse-surface px-3 py-2 text-inverse-on-surface hover:bg-inverse-on-surface/10 sm:px-4",
                showRecordings && "bg-inverse-on-surface/10",
              )}
            >
              <ListVideo
                size={20}
                className="text-inverse-on-surface"
                aria-hidden
              />
              <span className="hidden text-body-md text-inverse-on-surface sm:inline">
                Recordings
              </span>
            </Button>
          )}

          {/* Reactions: tokened control opening an emoji picker that sends via
              call.sendReaction. Reuses Stream's defaultEmojiReactionMap for the
              canonical :code: set; each participant's tile renders the floating
              glyph natively via Stream's ParticipantView <Reaction> overlay. */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setReactionsOpen((prev) => !prev)}
              aria-label="Send a reaction"
              aria-expanded={reactionsOpen}
              className="flex cursor-pointer items-center gap-2 rounded-xl bg-inverse-surface px-3 py-2 text-inverse-on-surface hover:bg-inverse-on-surface/10 sm:px-4"
            >
              <Smile size={20} className="text-inverse-on-surface" aria-hidden />
              <span className="hidden text-body-md text-inverse-on-surface sm:inline">
                Reactions
              </span>
            </button>
            {reactionsOpen && (
              <div className="absolute bottom-full left-1/2 z-50 mb-3 flex w-max max-w-[280px] flex-wrap justify-center gap-1 rounded-2xl border border-outline-variant bg-inverse-surface p-2 shadow-lg">
                {reactionEmojis.map(([code, emoji]) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => {
                      call?.sendReaction({ type: "emoji", emoji_code: code });
                      setReactionsOpen(false);
                    }}
                    className="rounded-lg p-2 text-2xl leading-none hover:bg-inverse-on-surface/10"
                    aria-label={`React ${code}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger className="flex cursor-pointer items-center gap-2 rounded-xl bg-inverse-surface px-3 py-2 text-inverse-on-surface hover:bg-inverse-on-surface/10 sm:px-4">
              <LayoutList size={20} className="text-inverse-on-surface" aria-hidden />
              <span className="hidden text-body-md text-inverse-on-surface sm:inline">
                Layout
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="border-outline-variant bg-inverse-surface text-inverse-on-surface">
              {["grid", "speaker-left", "speaker-right"].map((item, index) => {
                return (
                  <div key={index}>
                    <DropdownMenuItem
                      onClick={() => setLayout(item as callTypesLayout)}
                    >
                      {item}
                    </DropdownMenuItem>
                  </div>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* CallStatsButton is a self contained Stream popover trigger; it
              must render standalone, not nested inside another popover
              (a Radix DropdownMenu), or the nested popovers conflict and the
              stats panel opens empty/broken. */}
          <CallStatsButton />
        </div>
      </div>
    </section>
  );
};

export default MeetingRoom;
