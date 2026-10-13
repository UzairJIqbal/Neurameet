/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Send, Square, Trash2 } from "lucide-react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import toast from "react-hot-toast";

const STORAGE_PREFIX = "neurameet:chat:";

type StoredChat = { messages: UIMessage[]; updatedAt: number };

const loadMessages = (id: string): UIMessage[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_PREFIX + id);
    if (!raw) return [];
    // Older builds stored the bare message array; keep that history readable.
    const parsed = JSON.parse(raw) as StoredChat | UIMessage[];
    if (Array.isArray(parsed)) return parsed;
    return parsed.messages ?? [];
  } catch {
    return [];
  }
};

const saveMessages = (id: string, messages: UIMessage[]): void => {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredChat = { messages, updatedAt: Date.now() };
    window.sessionStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(payload));
  } catch {
    // quota / serialization failure — non-fatal, chat still works in-memory
  }
};

// Drop a chat's persisted history (used by the widget's clear button).
export const clearChatStorage = (id: string): void => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_PREFIX + id);
  } catch {
    // storage unavailable — clearing is best-effort
  }
};

const ChatPanel = ({
  meetingId,
  className,
  variant = "standalone",
}: {
  meetingId?: string;
  className?: string;
  variant?: "standalone" | "embedded";
}) => {
  const isEmbedded = variant === "embedded";
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatId = meetingId ?? "general";

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/ai/chat",
        body: meetingId ? { meetingId } : {},
      }),
    [meetingId],
  );

  // Hydrate from sessionStorage per chat so history survives navigation within
  // the tab. useChat only uses this at construction / when `id` changes.
  const initialMessages = useMemo(() => loadMessages(chatId), [chatId]);

  const { messages, sendMessage, status, stop, setMessages, error } = useChat({
    id: chatId,
    messages: initialMessages,
    transport,
  });

  useEffect(() => {
    saveMessages(chatId, messages);
  }, [meetingId, messages]);

  const isStreaming = status === "streaming" || status === "submitted";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (error) toast.error(error.message || "Chat failed");
  }, [error]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;
    sendMessage({ text });
    setInput("");
  };

  // Wipe the current conversation: drop it from sessionStorage and reset the
  // in-memory message list so the empty state renders immediately. Used by the
  // dustbin button next to the input on every chat surface (general page,
  // meeting tab, floating widget).
  const handleClear = () => {
    if (isStreaming) stop();
    clearChatStorage(chatId);
    setMessages([]);
  };

  // Standalone (real chat pages): a self contained light card.
  // Embedded (inside the dark floating widget): blend into the dark surface,
  // no border or own background, inverse-token bubbles.
  const rootClass = cn(
    isEmbedded
      ? "flex flex-col min-h-0"
      : "flex h-[60vh] flex-col rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0_4px_20px_rgba(0,0,0,0.04)]",
    className,
  );
  const scrollClass = isEmbedded
    ? "flex-1 overflow-y-auto p-4 space-y-4"
    : "flex-1 space-y-4 overflow-y-auto p-6";
  const emptyTextClass = isEmbedded
    ? "text-body-md text-inverse-on-surface/70"
    : "text-body-md text-on-surface-variant";
  const aiBubbleClass = isEmbedded
    ? "bg-white/10 text-inverse-on-surface"
    : "bg-surface-container text-on-surface";
  const mdClass = isEmbedded
    ? "[&_a]:text-inverse-primary [&_a]:underline [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1 [&_strong]:font-semibold"
    : "[&_a]:text-primary-container [&_a]:underline [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_code]:rounded [&_code]:bg-surface-container-high [&_code]:px-1 [&_strong]:font-semibold";
  const thinkingBubbleClass = isEmbedded
    ? "flex items-center gap-1.5 rounded-lg bg-white/10 px-4 py-3 text-inverse-on-surface"
    : "flex items-center gap-1.5 rounded-lg bg-surface-container px-4 py-3 text-on-surface";
  const formClass = isEmbedded
    ? "flex items-center gap-2 border-t border-white/10 p-4"
    : "flex items-center gap-2 border-t border-outline-variant p-4";
  const inputClass = isEmbedded
    ? "flex-1 rounded-md border border-white/10 bg-white/5 px-4 py-2.5 text-body-md text-inverse-on-surface placeholder:text-inverse-on-surface/50 focus:border-primary-container focus:outline-none"
    : "flex-1 rounded-md border border-outline-variant bg-surface px-4 py-2.5 text-body-md text-on-surface placeholder:text-on-surface-variant focus:border-primary-container focus:outline-none";
  const stopClass = isEmbedded
    ? "inline-flex items-center gap-2 rounded-md bg-white/10 px-4 py-2.5 text-body-md text-inverse-on-surface transition-colors hover:bg-white/20"
    : "inline-flex items-center gap-2 rounded-md bg-surface-container px-4 py-2.5 text-body-md text-on-surface transition-colors hover:bg-surface-container-high";

  const clearButtonClass = isEmbedded
    ? "inline-flex items-center justify-center rounded-md p-2 text-inverse-on-surface/70 transition-colors hover:text-inverse-on-surface"
    : "inline-flex items-center justify-center rounded-md border border-outline-variant p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface";

  return (
    <div className={rootClass}>
      <div className={scrollClass}>
        {messages.length === 0 && (
          <p className={emptyTextClass}>
            {meetingId
              ? "Ask anything about this meeting — decisions, action items, key points."
              : "Ask about meetings, productivity, or how to use NeuraMeet."}
          </p>
        )}

        {messages
          // useChat plus the sessionStorage hydration above can, on remount
          // mid-stream, leave two entries with the same id in the array. Dedupe
          // so the React key (message.id) stays unique and no message renders
          // twice.
          .filter((message, index, all) => {
            if (index === 0) return true;
            return all.slice(0, index).every((m) => m.id !== message.id);
          })
          .map((message: UIMessage) => {
          const text = message.parts
            .filter(
              (part): part is { type: "text"; text: string } =>
                part.type === "text",
            )
            .map((part) => part.text)
            .join("");

          const isUser = message.role === "user";

          return (
            <div
              key={message.id}
              className={`flex ${isUser ? "justify-end" : "justify-start"}`}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-lg px-4 py-3",
                  isUser ? "bg-primary-container text-on-primary" : aiBubbleClass,
                )}
              >
                <div className={cn("text-body-md leading-relaxed", mdClass)}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {text}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          );
        })}

        {status === "submitted" && (
          <div className="flex justify-start">
            <div className={thinkingBubbleClass}>
              <span className="h-2 w-2 animate-bounce rounded-full bg-primary-container [animation-delay:-0.3s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-primary-container [animation-delay:-0.15s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-primary-container" />
              <span className="ml-2 text-body-md">NeuraMeet is thinking</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className={formClass}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={meetingId ? "Ask about this meeting…" : "Ask anything…"}
          className={inputClass}
        />
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear conversation"
          title="Clear conversation"
          className={clearButtonClass}
        >
          <Trash2 className="h-4 w-4" />
        </button>
        {isStreaming ? (
          <button
            type="button"
            onClick={() => stop()}
            className={stopClass}
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

export default ChatPanel;
