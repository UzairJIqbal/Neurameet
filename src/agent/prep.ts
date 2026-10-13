import "server-only";
import { embed } from "ai";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase-server";
import { QUESTION_EMBEDDING } from "./rag";
import { generateStructuredWithFallback } from "./models";

export const PrepSuggestionsSchema = z.object({
  context: z.array(z.string()),
  openActionItems: z.array(z.string()),
  discussionPoints: z.array(z.string()),
  questionsToAsk: z.array(z.string()),
});

export type PrepSuggestions = z.infer<typeof PrepSuggestionsSchema>;

type RelatedChunk = {
  meetingId: string;
  meetingTitle: string;
  chunkText: string;
};

/**
 * Generate grounded prep notes for an upcoming (future) meeting by retrieving
 * the user's PAST related meetings via embeddings, enriching with their
 * insights + open action items, then synthesizing a structured prep object.
 * Throws on a missing/throwing RPC so the failure surfaces visibly (C1 pattern).
 */
export async function generatePrepSuggestions(
  userId: string,
  title: string,
  notes?: string,
): Promise<PrepSuggestions> {
  const query = [title, notes].filter(Boolean).join("\n\n").trim();
  if (!query) {
    return {
      context: [],
      openActionItems: [],
      discussionPoints: [],
      questionsToAsk: [],
    };
  }

  // (a) embed the upcoming meeting's title + notes
  const { embedding } = await embed({
    model: QUESTION_EMBEDDING,
    value: query,
    // Pin to 768-dim to match the meeting_chunks.embedding vector(768) column.
    providerOptions: { google: { outputDimensionality: 768 } },
  });

  // (b) related past chunks (reuse the C1 user-scoped RPC)
  const { data: hits, error } = await supabaseServer().rpc(
    "match_meeting_chunks_user",
    {
      query_embedding: embedding,
      p_user_id: userId,
      match_count: 12,
      similarity_threshold: 0.1,
    },
  );

  if (error) {
    throw new Error(
      `match_meeting_chunks_user failed: ${
        typeof error === "object" ? JSON.stringify(error) : String(error)
      }`,
    );
  }

  const related: RelatedChunk[] = (hits ?? []).map(
    (row: {
      meeting_id: unknown;
      meeting_title: string | null;
      chunk_text: string | null;
    }) => ({
      meetingId: String(row.meeting_id),
      meetingTitle: row.meeting_title ?? "Untitled meeting",
      chunkText: row.chunk_text ?? "",
    }),
  );

  // (c) distinct related meeting ids (cap at 6 for the enrichment queries)
  const distinctIds = [...new Set(related.map((r) => r.meetingId))].slice(0, 6);

  // top 3 snippets per related meeting
  const snippetsByMeeting = new Map<string, string[]>();
  for (const r of related) {
    const arr = snippetsByMeeting.get(r.meetingId) ?? [];
    arr.push(r.chunkText);
    snippetsByMeeting.set(r.meetingId, arr.slice(0, 3));
  }

  // (d) related meetings' insights + open follow_ups (joined to action_items)
  let insightsText = "";
  let openItemsText = "";
  if (distinctIds.length) {
    const { data: insights } = await supabaseServer()
      .from("meeting_insights")
      .select("meeting_id, summary, decisions")
      .in("meeting_id", distinctIds);
    insightsText = (insights ?? [])
      .map((i: { summary?: string | null; decisions?: unknown }) => {
        const decisions = Array.isArray(i.decisions)
          ? ` Decisions: ${i.decisions.join("; ")}`
          : "";
        return `- ${(i.summary ?? "").slice(0, 400)}${decisions}`;
      })
      .join("\n");

    const { data: follows } = await supabaseServer()
      .from("follow_ups")
      .select("meeting_id, status, action_items(title)")
      .in("meeting_id", distinctIds)
      .neq("status", "completed");
    openItemsText = (follows ?? [])
      .map((f) => {
        // Supabase types the embedded to-one `action_items` as an array, but at
        // runtime a to-one relation returns a single object (AGENTS.md note).
        // Handle both defensively so we never read a missing title.
        const items = f.action_items as unknown;
        const itemTitle =
          items && typeof items === "object" && !Array.isArray(items)
            ? (items as { title?: string }).title
            : Array.isArray(items) && items.length > 0
              ? (items[0] as { title?: string }).title
              : undefined;
        return `- [${f.status ?? "open"}] ${itemTitle ?? "Untitled action item"}`;
      })
      .join("\n");
  }

  // (e) build the grounding prompt
  const relatedSnippetText = [...snippetsByMeeting.entries()]
    .map(
      ([mid, snips]) =>
        `Meeting ${mid}:\n${snips.map((s) => "  • " + s.slice(0, 300)).join("\n")}`,
    )
    .join("\n");

  const hasHistory = distinctIds.length > 0;
  const prompt = [
    "You are a meeting prep assistant for NeuraMeet.",
    `The user is about to join a meeting titled: "${title}".`,
    notes ? `Their prep notes: ${notes}` : "",
    "",
    hasHistory
      ? "Below is context from the user's PAST related meetings (transcript snippets, summaries and decisions, and open action items)."
      : "The user has no past related meetings in the system.",
    "",
    "Related past transcript snippets:",
    relatedSnippetText || "(none)",
    "",
    "Related past summaries and decisions:",
    insightsText || "(none)",
    "",
    "Open action items from related past meetings:",
    openItemsText || "(none)",
    "",
    "Produce prep suggestions as four arrays of short strings, using ONLY the context above:",
    "- context: 3 to 8 factual bullets the user should know before this meeting (statuses, dates, decisions, owners). Do not invent facts not in the context.",
    "- openActionItems: open items drawn from the 'Open action items from related past meetings' text above, worth following up in this meeting. If that text is '(none)', return an empty array.",
    "- discussionPoints: 2 to 4 items. These are topics to raise in THIS meeting, inferred FROM the context above (confirm a decision, align on a date, unblock a dependency). MUST NOT be empty when context is non empty. You MUST return at least 2 discussion points whenever any context is present.",
    "- questionsToAsk: 2 to 4 items. Questions to ask stakeholders, inferred FROM the context above (for example 'What is the current status of <item>?', 'Who owns <item>?', 'Is the <date or decision> still valid?'). MUST NOT be empty when context is non empty. You MUST return at least 2 questions whenever any context is present.",
    hasHistory
      ? "HARD REQUIREMENT: discussionPoints and questionsToAsk are inferences ABOUT the context, not facts copied from it. If the 'context' array has any content, BOTH discussionPoints and questionsToAsk MUST contain at least 2 items each. Returning an empty array for either is allowed ONLY when context is completely empty. Never state a fact that is not in the context."
      : "If there is no context, return concise general prep guidance in 'context' and note there is no related history; the other three arrays may be empty.",
    "WORKED EXAMPLE. Suppose the context array contains these facts: 'Mobile app redesign is top priority for Q3 with a September 30 deadline', 'Billing migration target end of August, Marcus to flag progress', 'SSO scoping doc due August 18, owned by Marcus'. Then return: context holds those three facts as bullets; openActionItems holds any open items from the related meetings text; discussionPoints holds at least 2 topics such as 'Confirm the September 30 date still holds for the mobile redesign', 'Align on whether a slipped billing migration blocks Q3', 'Unblock Marcus on the SSO scoping doc'; questionsToAsk holds at least 2 questions such as 'What is the current status of the billing migration?', 'Who owns the mobile app redesign now?', 'Is the September 30 deadline still valid for AI summaries?'. discussionPoints and questionsToAsk are INFERRED from the facts and are never empty while context has content.",
  ]
    .filter(Boolean)
    .join("\n");

  // (f) structured generation with Gemini -> Groq fallback
  const { object } = await generateStructuredWithFallback({
    schema: PrepSuggestionsSchema,
    prompt,
  });

  return object;
}
