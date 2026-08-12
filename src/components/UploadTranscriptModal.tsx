"use client";

import React, { useState, useRef, useCallback } from "react";
import {
  ModalBody,
  ModalContent,
  ModalFooter,
} from "@/components/ui/animated-modal";
import { toast } from "react-hot-toast";
import { useRouter } from "next/navigation";

const UploadTranscriptModal = ({ onClose }: { onClose: () => void }) => {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.name.endsWith(".txt")) {
        toast.error("Only .txt files are supported");
        return;
      }

      setFileName(file.name);
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
      return;
    }

    setFileName(file.name);
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

    setIsProcessing(true);

    try {
      // Step 1: Upload transcript
      const uploadRes = await fetch("/api/transcript/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), rawText: rawText.trim() }),
      });

      if (!uploadRes.ok) {
        const uploadData = await uploadRes.json();
        throw new Error(uploadData.error || "Upload failed");
      }

      const { meetingId } = (await uploadRes.json()) as { meetingId: string };

      // Step 2: Process with AI
      const processRes = await fetch("/api/ai/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId }),
      });

      if (!processRes.ok) {
        const processData = await processRes.json();
        throw new Error(processData.error || "Processing failed");
      }

      toast.success("Transcript processed successfully!");
      onClose();
      router.push(`/meeting-intelligence/${meetingId}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      toast.error(message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex w-full items-center justify-center">
      <ModalBody>
        <ModalContent>
          <h4 className="mb-6 text-center text-lg font-bold text-white dark:text-white md:text-2xl">
            Upload Transcript
          </h4>

          {isProcessing ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-dark-4 border-t-purple-1" />
              <p className="text-sm text-sky-1">
                Processing transcript with AI...
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Title input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-sky-1">
                  Meeting Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Q3 Planning Review"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="rounded-xl border-none bg-dark-3 p-3 text-white placeholder-sky-1 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>

              {/* Paste text area */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-sky-1">
                  Paste Transcript
                </label>
                <textarea
                  placeholder="Paste your transcript here..."
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  className="min-h-28 resize-y rounded-xl border-none bg-dark-3 p-3 text-white placeholder-sky-1 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>

              {/* File drop zone */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-dark-4 bg-dark-3 p-6 text-center transition-colors hover:border-sky-1"
              >
                <p className="text-sm text-sky-1">
                  {fileName
                    ? `Selected: ${fileName}`
                    : "Drop a .txt file here or click to browse"}
                </p>
                <p className="text-xs text-sky-1">.txt files only</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            </div>
          )}
        </ModalContent>

        <ModalFooter className="bg-dark-2">
          <button
            className="w-full rounded-xl border border-dark-4 bg-dark-3 px-4 py-2 text-sm text-white sm:w-28"
            onClick={() => onClose()}
            disabled={isProcessing}
          >
            Cancel
          </button>
          <button
            className="w-full rounded-xl bg-purple-1 px-4 py-2 text-sm font-medium text-white sm:w-28 disabled:opacity-50"
            onClick={handleUpload}
            disabled={isProcessing}
          >
            {isProcessing ? "Processing..." : "Upload & Process"}
          </button>
        </ModalFooter>
      </ModalBody>
    </div>
  );
};

export default UploadTranscriptModal;
