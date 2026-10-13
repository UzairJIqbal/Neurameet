// @vitest-environment jsdom
//
// Component regression test for the Upload Transcript hang fix (2026-08-27).
// Before the fix, the Cancel button was `disabled` during processing and only
// closed the modal without aborting the in-flight fetch, so a slow or
// rate-limited AI provider (Gemini/Groq free tier) made /api/ai/process hang
// for minutes with no escape. Now:
//   - Cancel stays enabled during processing and actually aborts the request.
//   - A 120s timeout aborts the request so the UI never spins forever.
// These tests lock those two behaviours in.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { toast } from "react-hot-toast";
import UploadTranscriptModal from "./UploadTranscriptModal";

// The component only uses these for UI wiring; mock them so no server-only
// (Supabase/Clerk/Stream) code enters the jsdom runtime.
vi.mock("@/components/ui/animated-modal", () => ({
  ModalBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ModalFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  useModal: () => ({ setOpen: vi.fn() }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("react-hot-toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/lib/user-prefs", () => ({
  readUserPrefs: () => ({ aiAutoSummary: true, emailNotifications: false }),
}));

// A fetch that never resolves until its AbortSignal fires, so we can simulate
// the stuck AI provider. On abort it rejects with a real AbortError, exactly
// like the browser does, so the component's catch branch sees an abort.
function makeHangFetch() {
  let signal: AbortSignal | null = null;
  const fn = vi.fn((_url: string, opts?: RequestInit) => {
    signal = (opts?.signal as AbortSignal) ?? null;
    return new Promise<Response>((_resolve, reject) => {
      if (signal) {
        signal.addEventListener("abort", () =>
          reject(new DOMException("The operation was aborted.", "AbortError")),
        );
      }
    });
  });
  return { fn, getSignal: () => signal };
}

let hangFetch: ReturnType<typeof makeHangFetch>;

beforeEach(() => {
  hangFetch = makeHangFetch();
  globalThis.fetch = hangFetch.fn as unknown as typeof fetch;
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("UploadTranscriptModal (hang fix regression)", () => {
  it("keeps Cancel enabled during processing and aborts the in-flight upload", async () => {
    const onClose = vi.fn();
    render(<UploadTranscriptModal onClose={onClose} />);

    fireEvent.change(
      screen.getByPlaceholderText("e.g. Q3 Planning Review"),
      { target: { value: "Test Meeting" } },
    );
    fireEvent.change(
      screen.getByPlaceholderText("Paste your transcript here..."),
      { target: { value: "Alice: hello everyone" } },
    );

    await act(async () => {
      fireEvent.click(screen.getByText("Upload & Process"));
    });

    // The spinner is showing — we are "processing".
    expect(screen.getByText("Processing transcript with AI...")).toBeTruthy();

    // THE FIX: Cancel must NOT be disabled while processing.
    const cancel = screen.getByText("Cancel") as HTMLButtonElement;
    expect(cancel.disabled).toBe(false);

    await act(async () => {
      fireEvent.click(cancel);
    });

    // Cancel must close the modal...
    expect(onClose).toHaveBeenCalled();
    // ...and abort the in-flight request (the prior bug left it running).
    expect(hangFetch.fn.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it("aborts the in-flight request after 120s instead of hanging forever", async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<UploadTranscriptModal onClose={onClose} />);

    fireEvent.change(
      screen.getByPlaceholderText("e.g. Q3 Planning Review"),
      { target: { value: "Test Meeting" } },
    );
    fireEvent.change(
      screen.getByPlaceholderText("Paste your transcript here..."),
      { target: { value: "Alice: hello everyone" } },
    );

    await act(async () => {
      fireEvent.click(screen.getByText("Upload & Process"));
    });

    // Advance past the 120s timeout. The controller should abort, the stuck
    // fetch should reject, and the catch should report a timeout (not spin).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120000);
    });

    expect(hangFetch.fn.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("timed out"),
    );
    // A timeout is an abort, not a user click, so it must NOT close silently.
    expect(onClose).not.toHaveBeenCalled();
  });
});
