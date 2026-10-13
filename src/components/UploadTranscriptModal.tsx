"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  ModalBody,
  ModalContent,
  ModalFooter,
  useModal,
} from "@/components/ui/animated-modal";
import { toast } from "react-hot-toast";
import { useRouter } from "next/navigation";
import { readUserPrefs } from "@/lib/user-prefs";

// A transcript generated from a real call is downloaded as
// `meeting-<meetingId>-transcript.txt` (AfterMeetingRecap stamps the call's
// Supabase meeting id into the filename). When the same file is later uploaded
// from the Dashboard, we recover that id here so the upload attaches to the
// EXISTING call (attendance + recordings intact) instead of orphaning a new row.
// This is what makes the recap-page and Dashboard upload paths behave identically.
const MEETING_ID_FILENAME = /meeting-([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})-transcript\.txt$/i;

function extractMeetingIdFromFilename(name: string): string | null {
  const match = MEETING_ID_FILENAME.exec(name);
  return match ? match[1] : null;
}

const UploadTranscriptModal = ({
  onClose,
  meetingId,
  defaultTitle,
}: {
  onClose: () => void;
  meetingId?: string;
  defaultTitle?: string;
}) => {
  const router = useRouter();
  const { setOpen } = useModal();

  // Open the modal on mount — `ModalBody` only renders while
  // `ModalContext.open` is true, and nothing else flips it on in this flow.
  useEffect(() => {
    setOpen(true);
  }, [setOpen]);
  const [title, setTitle] = useState(defaultTitle ?? "");
  const [pasteText, setPasteText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [parsedMeetingId, setParsedMeetingId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Lives across the async upload so Cancel can abort the in-flight request.
  const abortRef = useRef<AbortController | null>(null);
  // Tells the catch handler that an abort came from a user click, not the
  // timeout, so we can stay quiet instead of showing a "timed out" toast.
  const cancelledRef = useRef(false);

  // An explicit meetingId (recap page) wins; otherwise fall back to one we
  // recovered from the uploaded filename so both entry points resolve the same
  // meeting.
  const effectiveMeetingId = meetingId ?? parsedMeetingId;

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.name.endsWith(".txt")) {
        toast.error("Only .txt files are supported");
        setParsedMeetingId(null);
        return;
      }

      setFileName(file.name);
      setParsedMeetingId(extractMeetingIdFromFilename(file.name));
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result;
        if (typeof text === "string") {
          setFileContent(text);
        }
      };
      reader.readAsText(file);
    },
    [],
  );

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".txt")) {
      toast.error("Only .txt files are supported");
      setParsedMeetingId(null);
      return;
    }

    setFileName(file.name);
    setParsedMeetingId(extractMeetingIdFromFilename(file.name));
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === "string") {
        setFileContent(text);
      }
    };
    reader.readAsText(file);
  }, []);

  const rawText = fileContent || pasteText;

  const handleUpload = async () => {
    if (!title.trim()) {
      toast.error("Please enter a meeting title");
      return;
    }

    if (!rawText || rawText.trim().length === 0) {
      toast.error("Please paste a transcript or upload a .txt file");
      return;
    }

    // Allow cancellation + a hard ceiling on wait time. A slow or rate-limited
    // AI provider (Gemini/Groq free tier) can make /api/ai/process hang for
    // minutes with no escape; the AbortController lets Cancel stop it, and the
    // timer guarantees the UI never spins forever (the prior 5-minute hang).
    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    setIsProcessing(true);

    try {
      // Step 1: Upload transcript. When a meetingId is supplied (recap flow for
      // a real call) the server attaches the transcript to that EXISTING meeting
      // instead of creating a duplicate — keeping it linked to the call's
      // attendance + recording (P11 fix).
      const uploadRes = await fetch("/api/transcript/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          rawText: rawText.trim(),
          ...(effectiveMeetingId ? { meetingId: effectiveMeetingId } : {}),
        }),
        signal: controller.signal,
      });

      if (!uploadRes.ok) {
        const uploadData = await uploadRes.json();
        throw new Error(uploadData.error || "Upload failed");
      }

      const { meetingId: returnedMeetingId } = (await uploadRes.json()) as {
        meetingId: string;
      };

      // Respect the "AI auto-summary on upload" preference. When OFF, store the
      // transcript only and skip AI processing + embedding (no insights/chunks).
      const { aiAutoSummary, emailNotifications } = readUserPrefs();
      if (!aiAutoSummary) {
        toast.success("Transcript uploaded");
        onClose();
        router.push(`/meeting-intelligence/${returnedMeetingId}`);
        return;
      }

      // Step 2: Process with AI. Pass the email-notifications preference so the
      // server knows whether to send the "summary ready" email on success.
      const processRes = await fetch("/api/ai/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId: returnedMeetingId, emailNotifications }),
        signal: controller.signal,
      });

      if (!processRes.ok) {
        const processData = await processRes.json();
        throw new Error(processData.error || "Processing failed");
      }

      // Step 3: Embed transcript chunks for RAG (non-fatal — chat handles
      // missing chunks later, so a failure here must not block the redirect).
      // Track the outcome so we can warn the user instead of silently leaving
      // them in a "no transcript context" chat loop.
      let embedFailed = false;
      try {
        const embedRes = await fetch("/api/ai/embed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ meetingId: returnedMeetingId }),
          signal: controller.signal,
        });
        if (!embedRes.ok) {
          embedFailed = true;
          const embedData = await embedRes.json().catch(() => ({}));
          console.error("Embedding failed:", embedData.error || "unknown");
        }
      } catch (embedErr) {
        embedFailed = true;
        console.error("Embedding request failed:", embedErr);
      }

      onClose();
      router.push(`/meeting-intelligence/${returnedMeetingId}`);

      if (embedFailed) {
        toast.error(
          "Meeting processed, but AI chat indexing failed. Re-upload the transcript to enable AI chat.",
        );
      } else {
        toast.success("Transcript processed successfully!");
      }
    } catch (err) {
      // An aborted request (user Cancel, or the 2-minute timeout) is not a
      // generic failure. A user click stays quiet; an unexpected abort reads as
      // a timeout so the message stays honest.
      if (controller.signal.aborted) {
        if (!cancelledRef.current) {
          toast.error("Processing timed out. Please try your upload again.");
        }
      } else {
        const message =
          err instanceof Error ? err.message : "Something went wrong";
        toast.error(message);
      }
    } finally {
      clearTimeout(timeoutId);
      abortRef.current = null;
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    if (isProcessing && abortRef.current) {
      cancelledRef.current = true;
      abortRef.current.abort();
    }
    onClose();
  };

  return (
    <div className="flex w-full items-center justify-center">
      <ModalBody onClose={onClose}>
        <ModalContent>
          <h4 className="mb-6 text-center text-lg font-bold text-on-surface md:text-2xl">
            Upload Transcript
          </h4>

          {isProcessing ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-outline-variant border-t-primary-container" />
              <p className="text-sm text-on-surface-variant">
                Processing transcript with AI...
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Title input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-on-surface-variant">
                  Meeting Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Q3 Planning Review"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3 text-on-surface placeholder:text-on-surface-variant focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>

              {/* Paste text area */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-on-surface-variant">
                  Paste Transcript
                </label>
                <textarea
                  placeholder="Paste your transcript here..."
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  className="min-h-28 resize-y rounded-xl border border-outline-variant bg-surface-container-lowest p-3 text-on-surface placeholder:text-on-surface-variant focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>

              {/* File drop zone */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-outline-variant bg-surface-container-lowest p-6 text-center transition-colors hover:border-primary-container"
              >
                <p className="text-sm text-on-surface-variant">
                  {fileName
                    ? `Selected: ${fileName}`
                    : "Drop a .txt file here or click to browse"}
                </p>
                <p className="text-xs text-on-surface-variant">
                  .txt files only
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {parsedMeetingId && !meetingId ? (
                <p className="text-xs text-on-surface-variant">
                  Recognized as a transcript from one of your meetings — it will be
                  added to that meeting&apos;s attendance and recordings.
                </p>
              ) : null}
            </div>
          )}
        </ModalContent>

        <ModalFooter className="bg-surface-container-low">
          <button
            className="w-full rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-2 text-sm text-on-surface hover:bg-surface-container-low sm:w-28"
            onClick={handleCancel}
          >
            Cancel
          </button>
          <button
            className="w-full rounded-xl bg-primary-container px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary sm:w-28 disabled:opacity-50"
            onClick={handleUpload}
            disabled={isProcessing}
          >
            Upload & Process
          </button>
        </ModalFooter>
      </ModalBody>
    </div>
  );
};

export default UploadTranscriptModal;
