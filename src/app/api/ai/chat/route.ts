/* eslint-disable prettier/prettier */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { streamText, convertToModelMessages, UIMessage } from "ai";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveChatModel } from "@/agent/models";
import { retrieveContext, buildSystemPrompt } from "@/agent/rag";

// Extract the text of the most recent user message (for RAG retrieval).
function lastUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role === "user") {
      return message.parts
        .filter(
          (part): part is { type: "text"; text: string } =>
            part.type === "text",
        )
        .map((part) => part.text)
        .join(" ");
    }
  }
  return "";
}

const GENERAL_SYSTEM_PROMPT =
  "You are NeuraMeet's AI assistant. You help users with meeting productivity, " +
  "best practices for running effective meetings, and how to use the NeuraMeet app " +
  "(creating or joining meetings, uploading transcripts, viewing AI summaries, action " +
  "items, categories, and the meeting chat). You do not have access to any specific " +
  "meeting's transcript. If a question is about the content of a specific past meeting, " +
  "tell the user to open that meeting and use its AI Chat tab.";

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { messages, meetingId } = (await request.json()) as {
      messages?: UIMessage[];
      meetingId?: string;
    };

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: "Messages are required" },
        { status: 400 },
      );
    }

    const supabase = supabaseServer();

    let systemPrompt: string;

    if (meetingId) {
      // Scope check: confirm the meeting belongs to this user (always-scope-by-user_id).
      const { data: meeting, error: meetingError } = await supabase
        .from("meetings")
        .select("id")
        .eq("id", meetingId)
        .eq("user_id", userId)
        .single();

      if (meetingError || !meeting) {
        console.error(
          "Meeting not found or not owned by user:",
          meetingError,
        );
        return NextResponse.json(
          { error: "Meeting not found" },
          { status: 404 },
        );
      }

      const question = lastUserText(messages);
      const context = await retrieveContext(meetingId, question);
      systemPrompt = buildSystemPrompt(context);
    } else {
      // General assistant: no meeting scope, no RAG context.
      systemPrompt = GENERAL_SYSTEM_PROMPT;
    }

    const model = await resolveChatModel();

    const result = streamText({
      model,
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Chat failed";
    console.error("AI chat error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
