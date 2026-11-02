import { z } from "zod";

// Schema for AI-generated meeting insights (used with generateObject)
export const meetingInsightsSchema = z.object({
  summary: z.string().describe("A comprehensive summary of the meeting"),
  keyPoints: z
    .array(z.string())
    .describe("Key points discussed in the meeting"),
  decisions: z.array(z.string()).describe("Decisions made during the meeting"),
  category: z
    .string()
    .describe(
      "The meeting category, e.g. 'Product', 'Engineering', 'Sales', 'Design', 'Operations', 'General'",
    ),
  detectedTopics: z
    .array(z.string())
    .describe("Specific topics discussed in the meeting"),
});

export type MeetingInsights = z.infer<typeof meetingInsightsSchema>;

// Schema for a single action item extracted from a meeting
export const actionItemSchema = z.object({
  title: z.string().describe("A clear, actionable task title"),
  assignee: z
    .string()
    .nullable()
    .describe("The person responsible, or null if not mentioned"),
  dueDate: z
    .string()
    .nullable()
    .describe("Due date in ISO format (YYYY-MM-DD), or null if not mentioned"),
});

export type ActionItem = z.infer<typeof actionItemSchema>;

// Schema for a single Promise Ledger item (spec 0001): a decision or promise
// with the verbatim quote it came from. `.nullable()` (never `.optional()`) so
// the Groq json_schema fallback accepts it.
export const ledgerItemSchema = z.object({
  kind: z.enum(["decision", "promise"]),
  statement: z.string().describe("Plain English restatement"),
  quote: z
    .string()
    .describe("Verbatim from the transcript, original language and script"),
  quoteLanguage: z.enum(["en", "ur", "mixed"]),
  speaker: z.string().nullable(),
  assignee: z.string().nullable(),
  dueDate: z.string().nullable(),
  actionItemIndex: z.number().int().nullable(),
});

export type LedgerItemExtraction = z.infer<typeof ledgerItemSchema>;

// Tasdeeq (spec 0003): one minutes line with the model's speaker hint and the
// verbatim quotes behind it. The server locates every quote; the caps
// (MINUTES_MAX_* in src/lib/minutes-types.ts) are enforced server side, not
// with `.max()`, for the same reason as the ledger cap.
export const minutesPointSchema = z.object({
  text: z.string(),
  speakers: z
    .array(z.string())
    .nullable()
    .describe("Who said this point, used only to pick among repeated quotes"),
  quotes: z
    .array(z.string())
    .nullable()
    .describe(
      "Verbatim quotes, each from ONE transcript line, no speaker name",
    ),
});

export const minutesSchema = z.object({
  summaryPoints: z.array(minutesPointSchema),
  keyPoints: z.array(minutesPointSchema),
  decisions: z.array(minutesPointSchema),
});

export const dissentSuggestionSchema = z.object({
  speakerLabel: z.string(),
  topic: z.string(),
  position: z.string(),
  quote: z.string(),
  relatedDecisionIndex: z.number().int().nullable(),
});

export type MinutesExtraction = z.infer<typeof minutesSchema>;
export type DissentSuggestionExtraction = z.infer<
  typeof dissentSuggestionSchema
>;

// Full extraction result combining insights + minutes + action items + ledger
// items. Key points and decisions now come from `minutes`; the route fills the
// existing meeting_insights columns from their `text` values.
// The 15 item cap (LEDGER_MAX_ITEMS) is asked for in the prompt and enforced
// server side, not with `.max()`: a 16th item must never fail the whole
// extraction (and strict json_schema providers may reject maxItems).
export const extractionResultSchema = z.object({
  insights: meetingInsightsSchema.omit({ keyPoints: true, decisions: true }),
  minutes: minutesSchema,
  actionItems: z.array(
    actionItemSchema.extend({
      quotes: z
        .array(z.string())
        .nullable()
        .describe("Verbatim quotes behind this task, no speaker name"),
    }),
  ),
  ledgerItems: z.array(ledgerItemSchema),
  dissentSuggestions: z.array(dissentSuggestionSchema).nullable(),
});

export type ExtractionResult = z.infer<typeof extractionResultSchema>;
