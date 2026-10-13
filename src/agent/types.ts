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

// Full extraction result combining insights + action items
export const extractionResultSchema = z.object({
  insights: meetingInsightsSchema,
  actionItems: z.array(actionItemSchema),
});

export type ExtractionResult = z.infer<typeof extractionResultSchema>;
