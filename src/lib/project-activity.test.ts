import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: vi.fn() }));

import { toActivityRow, type ActivitySourceRow } from "./project-activity";
import { activityDetail, activitySentence } from "./activity-text";

const lookups = {
  names: new Map([
    ["u1", "Sara"],
    ["u2", "Ali"],
  ]),
  tasks: new Map([["t1", { key: "NM-3", title: "Ship the survey" }]]),
  statements: new Map([["i1", "Ali sends the survey"]]),
  meetings: new Map([["m1", "Standup"]]),
};

const row = (over: Partial<ActivitySourceRow>): ActivitySourceRow => ({
  row_id: "te:1",
  occurred_at: "2026-11-01T00:00:00Z",
  actor_id: "u1",
  kind: "task.created",
  subject_type: "task",
  subject_id: "t1",
  detail: {},
  ...over,
});

const sentence = (over: Partial<ActivitySourceRow>) =>
  activitySentence(toActivityRow(row(over), lookups));

describe("Activity rows are built from the allowlist (AC-61a, AC-61b)", () => {
  it("strips the quote and title from a merged proposal", () => {
    const built = toActivityRow(
      row({
        kind: "task.proposal_merged",
        detail: {
          quote: "secret quote",
          title: "secret title",
          actionItemId: "a1",
        },
      }),
      lookups,
    );
    expect(JSON.stringify(built)).not.toMatch(/secret|a1/);
    expect(activitySentence(built)).toBe("A promise was merged into NM-3");
  });

  it("carries no ref or email on a joined member", () => {
    const built = toActivityRow(
      row({
        kind: "member.joined",
        subject_type: "member",
        subject_id: "u2",
        detail: { ref: "invite-ref", email: "ali@example.com" },
      }),
      lookups,
    );
    expect(JSON.stringify(built)).not.toMatch(/invite-ref|example\.com/);
    expect(activitySentence(built)).toBe("Ali joined");
  });

  it("carries nothing on an unknown kind", () => {
    const built = toActivityRow(
      row({ kind: "invite.created", detail: { email: "ali@example.com" } }),
      lookups,
    );
    expect(activitySentence(built)).toBe("Something changed");
    expect(JSON.stringify(built)).not.toContain("example.com");
    expect(built.actorName).toBeNull();
  });

  it("never returns a task description", () => {
    const built = toActivityRow(
      row({
        kind: "task.edited",
        detail: { field: "description", from: "secret old", to: "secret new" },
      }),
      lookups,
    );
    expect(JSON.stringify(built)).not.toContain("secret");
    expect(activitySentence(built)).toBe(
      "Sara changed the description on NM-3",
    );
  });
});

describe("Activity names", () => {
  it("names GitHub when the source says so", () => {
    expect(
      toActivityRow(
        row({ actor_id: null, detail: { source: "github" } }),
        lookups,
      ).actorName,
    ).toBe("GitHub");
  });

  it("says Someone with no actor, and Unknown member with no Clerk match", () => {
    expect(
      sentence({
        actor_id: null,
        kind: "project.created",
        subject_type: "project",
      }),
    ).toBe("Someone created the project");
    expect(
      sentence({
        actor_id: "gone",
        kind: "project.created",
        subject_type: "project",
      }),
    ).toMatch(/^Unknown member created/);
  });

  it("turns an assignee id into a name", () => {
    expect(
      sentence({ kind: "task.assigned", detail: { from: null, to: "u2" } }),
    ).toBe("Sara assigned NM-3 to Ali");
  });

  it("uses status labels on a move", () => {
    expect(
      sentence({
        kind: "task.status_changed",
        detail: { from: "todo", to: "completed" },
      }),
    ).toBe("Sara moved NM-3 from To do to Completed");
  });

  it("shows the promise under a confirmation", () => {
    const built = toActivityRow(
      row({
        kind: "ledger.kept_confirmed",
        subject_type: "ledger_item",
        subject_id: "i1",
      }),
      lookups,
    );
    expect(activitySentence(built)).toBe("Sara confirmed a promise as kept");
    expect(activityDetail(built)).toBe("Ali sends the survey");
  });
});
