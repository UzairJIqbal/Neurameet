import "server-only";
import { z } from "zod";
import { generateStructuredWithFallback } from "./models";

export const SpeakerContributionSchema = z.object({
  overallSummary: z.string(),
  speakers: z.array(
    z.object({
      name: z.string(),
      contributions: z.array(z.string()),
      keyTopics: z.array(z.string()),
      lowEngagement: z.boolean(),
      lowEngagementReason: z.string().nullable(),
    }),
  ),
});

export type SpeakerContribution = z.infer<typeof SpeakerContributionSchema>;

export type KnownSpeaker = {
  name: string;
  talkTimeSeconds: number;
  durationSeconds: number;
};

/**
 * Attribute per-speaker contributions + key topics from a meeting transcript,
 * cross-checking against the participants known to have attended (their
 * measured talk-time/duration is passed in so the model can flag present
 * speakers who said little). Throws on failure so the route can surface it
 * visibly (C1/C2 "fail visible" pattern).
 */
export async function generateSpeakerContributions(params: {
  transcriptText: string;
  knownNames: KnownSpeaker[];
  meetingTitle?: string;
  category?: string | null;
}): Promise<SpeakerContribution> {
  const { transcriptText, knownNames, meetingTitle, category } = params;

  const knownList = knownNames
    .map(
      (n, i) =>
        `${i + 1}. ${n.name} — measured talk-time ${n.talkTimeSeconds}s, total presence ${n.durationSeconds}s`,
    )
    .join("\n");

  const prompt = [
    "You are a meeting engagement analyst for NeuraMeet.",
    `Meeting title: ${meetingTitle ?? "Untitled meeting"}${
      category ? ` · category: ${category}` : ""
    }.`,
    "",
    "The following participants are KNOWN to have attended (their presence and measured talk-time were captured from the call). Use their exact names to attribute contributions from the transcript:",
    knownList || "(none)",
    "",
    "Below is the meeting transcript:",
    transcriptText,
    "",
    "For every participant you can attribute content to from the transcript, return their contributions (short bullet-style strings), keyTopics (short topic labels), and a lowEngagement flag with a reason when they were present but contributed little or not at all.",
    "You may also surface additional speakers found in the transcript who are not in the known list, by the exact name as written.",
    "",
    "HARD REQUIREMENT: contributions and keyTopics MUST be drawn only from the transcript text. Do not invent facts, quotes, or topics that are not present. When a known name has no attributable content, set contributions and keyTopics to empty arrays and set lowEngagement=true with a reason such as 'Present but no attributable contributions found in the transcript'.",
    "For each speaker set lowEngagement=true when their contributions are thin or absent, or when they were present but added little. Prefer a transcript-grounded reason when one is available.",
  ].join("\n");

  const { object } = await generateStructuredWithFallback({
    schema: SpeakerContributionSchema,
    prompt,
  });

  return object;
}
