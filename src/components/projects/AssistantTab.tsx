/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Plus, Send, Square } from "lucide-react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import {
  clearChatStorage,
  loadMessages,
  saveMessages,
} from "@/components/meeting-intelligence/ChatPanel";
import { applyCitations, readSources } from "@/lib/project-citations";

const mdClass =
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_code]:rounded [&_code]:bg-surface-container-high [&_code]:px-1 [&_strong]:font-semibold";

// AC-66a: injected text can't produce an outside link, or an image that sends
// data away. A link keeps its words, an image renders nothing.
const safeMarkdown: Components = {
  a: ({ children }) => <>{children}</>,
  img: () => null,
};

const textOf = (message: UIMessage): string =>
  message.parts
    .filter(
      (part): part is { type: "text"; text: string } => part.type === "text",
    )
    .map((part) => part.text)
    .join("");

// The transport throws the raw response body, which is { error } on this route.
const errorText = (err: Error): string => {
  try {
    const parsed = JSON.parse(err.message) as { error?: unknown };
    if (typeof parsed.error === "string") return parsed.error;
  } catch {
    // not JSON, use the message as it is
  }
  return err.message || "Chat failed";
};

const AssistantMessage = ({ message }: { message: UIMessage }) => {
  const { text, cited } = applyCitations(
    textOf(message),
    readSources(message.metadata),
  );
  return (
    <div className="flex max-w-[80%] flex-col gap-2">
      <div className="rounded-lg bg-surface-container px-4 py-3 text-on-surface">
        <div className={cn("text-body-md leading-relaxed", mdClass)}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={safeMarkdown}>
            {text}
          </ReactMarkdown>
        </div>
      </div>
      {cited.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Sources">
          {cited.map((source) => (
            <li key={source.marker}>
              <Link
                href={source.href}
                className="inline-flex items-center gap-2 rounded-full border border-outline-variant bg-surface-container-lowest px-3 py-1 text-body-md text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
              >
                <span className="font-mono text-label-mono text-primary">{source.marker}</span>
                {source.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

type Props = {
  projectId: string;
  heading?: string;
  /** Fills the input. The nonce lets the same text fill it twice. */
  prefill?: { text: string; nonce: number } | null;
  aboveInput?: React.ReactNode;
};

// The project assistant (spec 0004, W7). History stays in this browser tab,
// per project. `ProjectAssistant` adds the suggestions and Project Memory panel.
const AssistantTab = ({ projectId, heading, prefill, aboveInput }: Props) => {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatId = `project:${projectId}`;

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/ai/chat", body: { projectId } }),
    [projectId],
  );
  const initialMessages = useMemo(() => loadMessages(chatId), [chatId]);

  const { messages, sendMessage, status, stop, setMessages, error } = useChat({
    id: chatId,
    messages: initialMessages,
    transport,
  });

  useEffect(() => {
    saveMessages(chatId, messages);
  }, [chatId, messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (error) toast.error(errorText(error));
  }, [error]);

  useEffect(() => {
    if (!prefill) return;
    setInput(prefill.text);
    inputRef.current?.focus();
  }, [prefill]);

  const isStreaming = status === "streaming" || status === "submitted";

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;
    sendMessage({ text });
    setInput("");
  };

  const handleClear = () => {
    if (isStreaming) stop();
    clearChatStorage(chatId);
    setMessages([]);
  };

  return (
    <div className="flex h-[60vh] min-w-0 flex-1 flex-col rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between gap-3 border-b border-outline-variant px-4 py-3">
        {heading ? (
          <h2 className="min-w-0 break-words text-headline-sm text-on-surface">{heading}</h2>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={handleClear}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-outline-variant px-3 py-1.5 text-body-md text-on-surface transition-colors hover:bg-surface-container-high"
        >
          <Plus className="h-4 w-4" /> New chat
        </button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {messages.length === 0 && (
          <p className="text-body-md text-on-surface-variant">
            Ask about this project&apos;s meetings, tasks, decisions, and promises.
          </p>
        )}

        {messages
          // Same guard as ChatPanel: hydration can leave two entries with one id.
          .filter((message, index, all) => all.findIndex((m) => m.id === message.id) === index)
          .map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {message.role === "user" ? (
                <div className="max-w-[80%] rounded-lg bg-primary-container px-4 py-3 text-on-primary">
                  <div className={cn("text-body-md leading-relaxed", mdClass)}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={safeMarkdown}>
                      {textOf(message)}
                    </ReactMarkdown>
                  </div>
                </div>
              ) : (
                <AssistantMessage message={message} />
              )}
            </div>
          ))}

        {status === "submitted" && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1.5 rounded-lg bg-surface-container px-4 py-3 text-on-surface">
              <span className="h-2 w-2 animate-bounce rounded-full bg-primary-container [animation-delay:-0.3s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-primary-container [animation-delay:-0.15s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-primary-container" />
              <span className="ml-2 text-body-md">NeuraMeet is thinking</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {aboveInput && <div className="border-t border-outline-variant px-4 pt-3">{aboveInput}</div>}

      <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-outline-variant p-4">
        <input
          ref={inputRef}
          aria-label="Ask about this project"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this project…"
          className="flex-1 rounded-md border border-outline-variant bg-surface px-4 py-2.5 text-body-md text-on-surface placeholder:text-on-surface-variant focus:border-primary-container focus:outline-none"
        />
        {isStreaming ? (
          <button
            type="button"
            onClick={() => stop()}
            className="inline-flex items-center gap-2 rounded-md bg-surface-container px-4 py-2.5 text-body-md text-on-surface transition-colors hover:bg-surface-container-high"
          >
            <Square className="h-4 w-4" /> Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="inline-flex items-center gap-2 rounded-md bg-primary-container px-4 py-2.5 text-body-md text-on-primary transition-colors hover:bg-primary disabled:opacity-50"
          >
            <Send className="h-4 w-4" /> Send
          </button>
        )}
      </form>
    </div>
  );
};

export default AssistantTab;
