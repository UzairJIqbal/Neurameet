/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Send, Square } from "lucide-react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, UIMessage } from "ai";
import toast from "react-hot-toast";

const STORAGE_PREFIX = "neurameet:chat:";

const loadMessages = (id: string): UIMessage[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_PREFIX + id);
    return raw ? (JSON.parse(raw) as UIMessage[]) : [];
  } catch {
    return [];
  }
};

const saveMessages = (id: string, messages: UIMessage[]): void => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(messages));
  } catch {
    // quota / serialization failure — non-fatal, chat still works in-memory
  }
};

const ChatPanel = ({ meetingId }: { meetingId?: string }) => {
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

  const { messages, sendMessage, status, stop, error } = useChat({
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

  return (
    <div className="flex h-[60vh] flex-col rounded-xl border border-outline-variant bg-surface-container-lowest shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {messages.length === 0 && (
          <p className="text-body-md text-on-surface-variant">
            {meetingId
              ? "Ask anything about this meeting — decisions, action items, key points."
              : "Ask about meetings, productivity, or how to use NeuraMeet."}
          </p>
        )}

        {messages.map((message: UIMessage) => {
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
                className={`max-w-[80%] rounded-lg px-4 py-3 text-body-md leading-relaxed ${
                  isUser
                    ? "bg-primary-container text-on-primary"
                    : "bg-surface-container text-on-surface"
                }`}
              >
                <p className="whitespace-pre-line">{text}</p>
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSend}
        className="flex items-center gap-2 border-t border-outline-variant p-4"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={meetingId ? "Ask about this meeting…" : "Ask anything…"}
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

export default ChatPanel;
