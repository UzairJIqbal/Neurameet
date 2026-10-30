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
import {
  render,
  screen,
  fireEvent,
  act,
  cleanup,
} from "@testing-library/react";
import { toast } from "react-hot-toast";
import UploadTranscriptModal from "./UploadTranscriptModal";

// The component only uses these for UI wiring; mock them so no server-only
// (Supabase/Clerk/Stream) code enters the jsdom runtime.
vi.mock("@/components/ui/animated-modal", () => ({
  ModalBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
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

    fireEvent.change(screen.getByPlaceholderText("e.g. Q3 Planning Review"), {
      target: { value: "Test Meeting" },
    });
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

    fireEvent.change(screen.getByPlaceholderText("e.g. Q3 Planning Review"), {
      target: { value: "Test Meeting" },
    });
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

// Promise Ledger wiring (spec 0001): the meeting date field and the match step.
const ok = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
});

// Answers each route in turn, so a test can fail one step at a time.
function routeFetch(match: () => unknown) {
  const fn = vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>(
    async (url) => {
      if (url === "/api/transcript/upload") return ok({ meetingId: "new-1" });
      if (url === "/api/ai/process") return ok({ success: true });
      if (url === "/api/ai/embed") return ok({ success: true });
      if (url === "/api/ledger/match") return match();
      throw new Error(`unexpected ${url}`);
    },
  );
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

const urls = (fn: ReturnType<typeof routeFetch>) =>
  fn.mock.calls.map(([u]) => u);
const bodyOf = (fn: ReturnType<typeof routeFetch>, url: string) =>
  JSON.parse(
    String((fn.mock.calls.find(([u]) => u === url)?.[1] as RequestInit).body),
  );

async function fillAndUpload() {
  fireEvent.change(screen.getByPlaceholderText("e.g. Q3 Planning Review"), {
    target: { value: "Launch planning" },
  });
  fireEvent.change(
    screen.getByPlaceholderText("Paste your transcript here..."),
    {
      target: { value: "Ali: main Friday tak survey bhej dunga" },
    },
  );
  await act(async () => {
    fireEvent.click(screen.getByText("Upload & Process"));
  });
}

describe("UploadTranscriptModal meeting date (AC-5)", () => {
  it("shows the date field for a new meeting, capped at today", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 30, 10, 0));
    render(<UploadTranscriptModal onClose={vi.fn()} />);

    const input = screen.getByLabelText(
      "Meeting date (optional)",
    ) as HTMLInputElement;
    expect(input.type).toBe("date");
    expect(input.max).toBe("2026-10-30");
  });

  it("hides the date field when attaching to an existing meeting", () => {
    render(<UploadTranscriptModal onClose={vi.fn()} meetingId="m1" />);
    expect(screen.queryByLabelText("Meeting date (optional)")).toBeNull();
  });

  it("sends the chosen date with a new meeting's upload", async () => {
    const fn = routeFetch(() => ok({ matched: 0 }));
    render(<UploadTranscriptModal onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Meeting date (optional)"), {
      target: { value: "2026-10-01" },
    });

    await fillAndUpload();

    expect(bodyOf(fn, "/api/transcript/upload").meetingDate).toBe("2026-10-01");
  });

  it("leaves the date out when none was chosen", async () => {
    const fn = routeFetch(() => ok({ matched: 0 }));
    render(<UploadTranscriptModal onClose={vi.fn()} />);

    await fillAndUpload();

    expect(bodyOf(fn, "/api/transcript/upload")).not.toHaveProperty(
      "meetingDate",
    );
  });
});

describe("UploadTranscriptModal ledger match (AC-6, AC-14)", () => {
  it("runs matching for the new meeting after embedding", async () => {
    const fn = routeFetch(() => ok({ matched: 2 }));
    render(<UploadTranscriptModal onClose={vi.fn()} />);

    await fillAndUpload();

    expect(urls(fn)).toEqual([
      "/api/transcript/upload",
      "/api/ai/process",
      "/api/ai/embed",
      "/api/ledger/match",
    ]);
    expect(bodyOf(fn, "/api/ledger/match")).toEqual({ meetingId: "new-1" });
    expect(toast.success).toHaveBeenCalledWith(
      "Transcript processed successfully!",
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("still finishes the upload and toasts when matching fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    routeFetch(() => ({ ok: false, status: 502, json: async () => ({}) }));
    const onClose = vi.fn();
    render(<UploadTranscriptModal onClose={onClose} />);

    await fillAndUpload();

    expect(onClose).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith(
      "Transcript processed successfully!",
    );
    const { LEDGER_MATCH_FAILED_MESSAGE } =
      await import("@/lib/ledger-match-client");
    expect(toast.error).toHaveBeenCalledWith(LEDGER_MATCH_FAILED_MESSAGE);
  });
});
