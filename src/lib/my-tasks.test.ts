import { describe, it, expect } from "vitest";
import {
  dueLabel,
  inMyTaskTab,
  isDueThisWeek,
  isOverdue,
  matchesMyTaskSearch,
  sortMyTasks,
} from "./my-tasks";
import type { MyTask } from "./task-types";

const TODAY = "2026-11-08";

const task = (over: Partial<MyTask>): MyTask => ({
  id: "t",
  key: "APO-1",
  number: 1,
  title: "Write the spec",
  description: null,
  status: "todo",
  priority: "medium",
  position: 0,
  assigneeId: null,
  assigneeName: null,
  dueDate: null,
  sourceMeetingId: null,
  completionKind: null,
  completedAt: null,
  version: 1,
  createdAt: "2026-11-01T00:00:00Z",
  updatedAt: "2026-11-01T00:00:00Z",
  projectId: "p1",
  projectName: "Apollo",
  ...over,
});

describe("my task helpers", () => {
  it("overdue means open and due before today", () => {
    expect(isOverdue(task({ dueDate: "2026-11-07" }), TODAY)).toBe(true);
    expect(isOverdue(task({ dueDate: TODAY }), TODAY)).toBe(false);
    expect(
      isOverdue(task({ dueDate: "2026-11-01", status: "completed" }), TODAY),
    ).toBe(false);
    expect(isOverdue(task({}), TODAY)).toBe(false);
  });

  it("due this week runs from today through the next 6 days", () => {
    expect(isDueThisWeek(task({ dueDate: TODAY }), TODAY)).toBe(true);
    expect(isDueThisWeek(task({ dueDate: "2026-11-14" }), TODAY)).toBe(true);
    expect(isDueThisWeek(task({ dueDate: "2026-11-15" }), TODAY)).toBe(false);
    expect(isDueThisWeek(task({ dueDate: "2026-11-07" }), TODAY)).toBe(false);
    expect(
      isDueThisWeek(task({ dueDate: TODAY, status: "completed" }), TODAY),
    ).toBe(false);
  });

  it("tabs filter by status, and Overdue by date", () => {
    expect(inMyTaskTab(task({ status: "in_review" }), "in_review", TODAY)).toBe(
      true,
    );
    expect(inMyTaskTab(task({ status: "in_review" }), "todo", TODAY)).toBe(
      false,
    );
    expect(inMyTaskTab(task({ dueDate: "2026-11-01" }), "overdue", TODAY)).toBe(
      true,
    );
    expect(inMyTaskTab(task({}), "all", TODAY)).toBe(true);
  });

  it("labels due dates", () => {
    expect(dueLabel(task({ status: "completed" }), TODAY)).toBe("Done");
    expect(dueLabel(task({}), TODAY)).toBe("No due date");
    expect(dueLabel(task({ dueDate: "2026-11-05" }), TODAY)).toBe("3d overdue");
    expect(dueLabel(task({ dueDate: "2026-11-10" }), TODAY)).toMatch(/^Due /);
  });

  it("sorts by due date with done and undated last", () => {
    const rows = [
      task({ key: "A-1", dueDate: null }),
      task({ key: "A-2", dueDate: "2026-11-12" }),
      task({ key: "A-3", dueDate: "2026-11-09", status: "completed" }),
      task({ key: "A-4", dueDate: "2026-11-10" }),
    ];
    expect(sortMyTasks(rows, "due").map((t) => t.key)).toEqual([
      "A-4",
      "A-2",
      "A-1",
      "A-3",
    ]);
  });

  it("sorts by priority (urgent first) and by updated (newest first)", () => {
    const rows = [
      task({ key: "A-1", priority: "low", updatedAt: "2026-11-03T00:00:00Z" }),
      task({
        key: "A-2",
        priority: "urgent",
        updatedAt: "2026-11-01T00:00:00Z",
      }),
    ];
    expect(sortMyTasks(rows, "priority").map((t) => t.key)).toEqual([
      "A-2",
      "A-1",
    ]);
    expect(sortMyTasks(rows, "updated").map((t) => t.key)).toEqual([
      "A-1",
      "A-2",
    ]);
  });

  it("search matches title, key, and project name", () => {
    const row = task({
      key: "APO-12",
      title: "Ship login",
      projectName: "Apollo",
    });
    expect(matchesMyTaskSearch(row, "login")).toBe(true);
    expect(matchesMyTaskSearch(row, "apo-12")).toBe(true);
    expect(matchesMyTaskSearch(row, "APOLLO")).toBe(true);
    expect(matchesMyTaskSearch(row, "nope")).toBe(false);
    expect(matchesMyTaskSearch(row, "  ")).toBe(true);
  });
});
