import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  clerkClient: async () => ({ users: { getUserList: vi.fn() } }),
}));

import {
  taskSelectFor,
  toTask,
  toTaskEvent,
  type TaskRow,
} from "./project-select";

const row: TaskRow = {
  id: "t1",
  project_id: "p1",
  number: 12,
  title: "Fix login",
  description: null,
  status: "todo",
  priority: "high",
  position: 1,
  assignee_id: "u1",
  due_date: null,
  source_meeting_id: "m1",
  completion_kind: null,
  completed_at: null,
  version: 3,
  created_at: "2026-11-03",
  updated_at: "2026-11-03",
  quote: "I will fix login",
  quote_speaker: "Ali",
  quote_line: 4,
  completion_evidence: "PR 9",
};
const names = new Map([["u1", { name: "Ali Khan" }]]);

describe("task redaction (AC-37)", () => {
  it("never selects the quote, evidence, or embedding for a Viewer", () => {
    expect(taskSelectFor("viewer")).not.toMatch(/quote|evidence|embedding/);
    expect(taskSelectFor("developer")).toMatch(/quote/);
    expect(taskSelectFor("developer")).not.toMatch(/embedding/);
  });

  it("drops quote fields from a Viewer's task even if the row has them", () => {
    const task = toTask(row, "NM", "viewer", names);
    expect(task.key).toBe("NM-12");
    expect(task.assigneeName).toBe("Ali Khan");
    expect(task).not.toHaveProperty("quote");
    expect(task).not.toHaveProperty("completionEvidence");
    expect(toTask(row, "NM", "developer", names).quote).toBe(
      "I will fix login",
    );
  });

  it("drops the quote and evidence from a Viewer's event detail", () => {
    const event = {
      id: "e1",
      kind: "created",
      actor_id: "u1",
      from_value: null,
      to_value: null,
      detail: { quote: "secret", evidence: "PR 9", source: "proposal" },
      created_at: "2026-11-03",
    };
    expect(toTaskEvent(event, "viewer", names).detail).toEqual({
      source: "proposal",
    });
    expect(toTaskEvent(event, "admin", names).detail).toMatchObject({
      quote: "secret",
    });
  });
});
