import { describe, it, expect } from "vitest";
import { patchDenial } from "./task-rules";

const open = (assignee_id: string | null) => ({ status: "todo", assignee_id });
const done = { status: "completed", assignee_id: "u1" };

describe("patchDenial", () => {
  it("refuses every change from a Viewer", () => {
    expect(patchDenial("viewer", "u1", open("u1"), { status: "blocked" })).toBe(
      "Viewers can't change tasks",
    );
  });

  it("lets only an Owner or Admin reopen a completed task", () => {
    expect(patchDenial("developer", "u1", done, { status: "todo" })).toBe(
      "Only an Owner or Admin can reopen a task",
    );
    expect(patchDenial("admin", "u2", done, { status: "todo" })).toBeNull();
    expect(patchDenial("owner", "u2", done, { status: "todo" })).toBeNull();
  });

  it("lets a Developer move their own or an unassigned task", () => {
    expect(
      patchDenial("developer", "u1", open("u1"), { status: "in_review" }),
    ).toBeNull();
    expect(
      patchDenial("developer", "u1", open(null), { status: "in_review" }),
    ).toBeNull();
    expect(
      patchDenial("developer", "u1", open("u2"), { status: "in_review" }),
    ).toBe("You can only change your own or unassigned tasks");
  });

  it("lets a Developer take or drop a task, never give it away", () => {
    expect(
      patchDenial("developer", "u1", open(null), { assigneeId: "u1" }),
    ).toBeNull();
    expect(
      patchDenial("developer", "u1", open("u1"), { assigneeId: null }),
    ).toBeNull();
    expect(
      patchDenial("developer", "u1", open(null), { assigneeId: "u2" }),
    ).toBe("You can only assign a task to yourself");
    expect(
      patchDenial("developer", "u1", open("u1"), { assigneeId: "u2" }),
    ).toBe("You can only assign a task to yourself");
  });

  it("lets a manager assign anyone", () => {
    expect(
      patchDenial("admin", "u1", open("u2"), { assigneeId: "u3" }),
    ).toBeNull();
  });
});
