import type { UIMessage } from "ai";

const STORAGE_PREFIX = "neurameet:chat:";

export type ConversationMeta = {
  /** Stored key id: "general" or "meeting:<id>". */
  id: string;
  /** Meeting id when the conversation is meeting-scoped, else undefined. */
  meetingId?: string;
  /** Short title for the list row. */
  title: string;
  /** Last message text, truncated for preview. */
  preview: string;
  /** Epoch ms of the last saved message. */
  updatedAt: number;
};

const textOf = (message: UIMessage): string =>
  message.parts
    .filter(
      (part): part is { type: "text"; text: string } => part.type === "text",
    )
    .map((part) => part.text)
    .join("")
    .trim();

/**
 * Lists every chat session ChatPanel has persisted in sessionStorage, newest
 * first. Zero-cost, client-only, no backend. History is tab/session-scoped.
 */
export function listConversations(): ConversationMeta[] {
  if (typeof window === "undefined") return [];
  const result: ConversationMeta[] = [];

  for (let i = 0; i < window.sessionStorage.length; i++) {
    const key = window.sessionStorage.key(i);
    if (!key || !key.startsWith(STORAGE_PREFIX)) continue;

    try {
      const raw = window.sessionStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as {
        messages: UIMessage[];
        updatedAt: number;
      };
      const messages = parsed.messages;
      if (!Array.isArray(messages) || messages.length === 0) continue;

      const id = key.slice(STORAGE_PREFIX.length);
      const meetingMatch = id.match(/^meeting:(.+)$/);
      const meetingId = meetingMatch ? meetingMatch[1] : undefined;

      const last = messages[messages.length - 1];
      const firstUser = messages.find((m) => m.role === "user");
      const preview = textOf(last);
      const title = firstUser
        ? textOf(firstUser).slice(0, 40)
        : meetingId
          ? "Meeting chat"
          : "General chat";

      result.push({ id, meetingId, title, preview, updatedAt: parsed.updatedAt ?? 0 });
    } catch {
      continue;
    }
  }

  return result.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Compact relative time for list rows: "now", "3m", "2h", "6d", "2w". */
export function relativeTime(ts: number): string {
  if (!ts) return "";
  const minutes = Math.floor((Date.now() - ts) / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}
