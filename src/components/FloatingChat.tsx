/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import {
  ExternalLink,
  Home,
  MessageCircle,
  MessageSquare,
  MessagesSquare,
  X,
} from "lucide-react";
import ChatPanel from "./meeting-intelligence/ChatPanel";
import { listConversations, relativeTime, type ConversationMeta } from "@/lib/chatHistory";

type View = "home" | "messages" | "chat";

const TABS = [
  { key: "home", label: "Home", icon: Home },
  { key: "messages", label: "Messages", icon: MessagesSquare },
] as const;

const AvatarCluster = ({ userImage }: { userImage?: string }) => (
  <div className="flex -space-x-2">
    {userImage ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={userImage}
        alt=""
        className="h-7 w-7 rounded-full object-cover ring-2 ring-inverse-surface"
      />
    ) : (
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-inverse-primary text-[11px] font-semibold text-inverse-surface ring-2 ring-inverse-surface">
        U
      </div>
    )}
  </div>
);

const FloatingChat = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser();

  // The dedicated /ai-chat page is the same general chat in full screen form.
  // Do not stack a floating copy on top of it.
  if (pathname === "/ai-chat") return null;

  // Auto scope to the current meeting when on a meeting detail route, so the
  // bubble answers meeting aware questions from anywhere.
  const meetingMatch = pathname.match(/^\/(?:meeting-intelligence|meeting)\/([^/]+)/);
  const meetingId = meetingMatch ? meetingMatch[1] : undefined;
  const effectiveId = meetingId ? `meeting:${meetingId}` : "general";

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("home");
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Refresh the conversation list whenever the panel opens or the user returns
  // to a list view, so new chats show up without a reload.
  useEffect(() => {
    if (!open) return;
    setConversations(listConversations());
  }, [open, view]);

  const openConversation = (conv: ConversationMeta) => {
    // Stored ids are the raw meeting id (ChatPanel's key); map back to the
    // "meeting:<id>" form this widget uses for scoping.
    setActiveChatId(conv.meetingId ? `meeting:${conv.meetingId}` : "general");
    setView("chat");
  };

  const askQuestion = () => {
    setActiveChatId(effectiveId);
    setView("chat");
  };

  const activeMeetingId = activeChatId?.startsWith("meeting:")
    ? activeChatId.slice("meeting:".length)
    : undefined;

  const userName = user?.firstName ?? user?.username ?? "Guest";

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setView("home");
          setOpen(true);
        }}
        aria-label="Open support chat"
        aria-expanded={false}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary-container text-on-primary shadow-lg transition-transform hover:scale-105"
      >
        <MessageCircle className="h-6 w-6" />
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Support chat"
      className="fixed bottom-6 right-6 z-50 flex max-h-[min(820px,92vh)] sm:max-h-[min(720px,88vh)] min-h-[60vh] sm:min-h-[52vh] w-[380px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl bg-inverse-surface text-inverse-on-surface shadow-2xl"
    >
      {/* Header: brand + team avatars + close */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-container text-on-primary">
            <MessagesSquare className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold text-inverse-on-surface">NeuraMeet</span>
        </div>
        <div className="flex items-center gap-3">
          <AvatarCluster userImage={user?.imageUrl} />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close support chat"
            className="text-inverse-on-surface/70 transition-colors hover:text-inverse-on-surface"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Greeting (fixed top, shared by Home + Messages) */}
      {(view === "home" || view === "messages") && (
        <div className="shrink-0 px-4 pt-4">
          <h2 className="text-xl font-bold text-inverse-on-surface">Hi {userName} 👋</h2>
          <p className="text-sm text-inverse-on-surface/70">How can we help?</p>
        </div>
      )}

      {/* Home view */}
      {view === "home" && (
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          <button
            type="button"
            onClick={() => (conversations[0] ? openConversation(conversations[0]) : askQuestion())}
            className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-left transition-colors hover:bg-white/10"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary">
                <MessageSquare className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-inverse-on-surface">
                    Recent message
                  </span>
                  <span className="shrink-0 text-xs text-inverse-on-surface/50">
                    {conversations[0] ? relativeTime(conversations[0].updatedAt) : ""}
                  </span>
                </div>
                <p className="truncate text-xs text-inverse-on-surface/60">
                  {conversations[0]
                    ? conversations[0].preview || conversations[0].title
                    : "No recent messages yet"}
                </p>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={askQuestion}
            className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-left transition-colors hover:bg-white/10"
          >
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-inverse-on-surface">Ask a question</div>
                <div className="text-xs text-inverse-on-surface/60">AI Agent and team can help</div>
              </div>
              <AvatarCluster userImage={user?.imageUrl} />
            </div>
          </button>

          <button
            type="button"
            onClick={() => router.push("/ai-chat")}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-inverse-on-surface/70 transition-colors hover:text-inverse-on-surface"
          >
            <ExternalLink className="h-4 w-4" />
            <span>Open full AI Chat page</span>
          </button>
        </div>
      )}

      {/* Messages view */}
      {view === "messages" && (
        <div className="relative flex-1 overflow-y-auto px-4 py-4 pb-16">
          {conversations.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-inverse-on-surface/50">
              No conversations yet.
            </p>
          ) : (
            <div className="space-y-2">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => openConversation(conv)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-left transition-colors hover:bg-white/10"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary">
                      <MessageSquare className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-inverse-on-surface">
                          {conv.title}
                        </span>
                        <span className="shrink-0 text-xs text-inverse-on-surface/50">
                          {relativeTime(conv.updatedAt)}
                        </span>
                      </div>
                      <p className="truncate text-xs text-inverse-on-surface/60">{conv.preview}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={askQuestion}
            className="absolute bottom-4 right-4 z-10 inline-flex items-center gap-2 rounded-full bg-primary-container px-4 py-2.5 text-sm font-semibold text-on-primary shadow-lg transition-transform hover:scale-105"
          >
            <MessageCircle className="h-4 w-4" /> Ask a question
          </button>
        </div>
      )}

      {/* Chat view — ChatPanel is a direct flex-1 child so its height comes
          from flex-grow (cross-browser safe), not height:100% on a flex parent. */}
      {view === "chat" && (
        <ChatPanel
          meetingId={activeMeetingId}
          variant="embedded"
          className="min-h-0 flex-1"
        />
      )}

      {/* Footer: Home / Messages tabs */}
      <footer className="flex shrink-0 items-stretch border-t border-white/10">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = view === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setView(tab.key)}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-3 text-xs transition-colors",
                active
                  ? "font-semibold text-inverse-primary"
                  : "text-inverse-on-surface/60 hover:text-inverse-on-surface",
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </footer>
    </div>
  );
};

export default FloatingChat;
