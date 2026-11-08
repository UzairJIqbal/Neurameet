// Test helper for the W9 route matrix (spec 0004, AC-80): the single table every
// project, task, proposal, and project meeting route is checked from, and a small
// stateful Supabase fake that honours filters, so a removed member really is
// filtered out by `removed_at is null` instead of by whatever a queue holds.

import type { ProjectRole } from "@/lib/project-types";
import { CONSENT_NOTICE_VERSION } from "@/lib/consent";

export type Need = "member" | "content" | "manage" | "owner";
export type Actor = ProjectRole | "removed" | "outsider";
type Row = Record<string, unknown>;
export type Seed = Record<string, Row[]>;
export type Method = "GET" | "POST" | "PATCH" | "DELETE";

export type MatrixRow = {
  /** Folder of the route under src/app/api, e.g. "projects/[id]/tasks". */
  route: string;
  method: Method;
  /** The least role the route's project gate lets through. */
  need: Need;
  body?: Record<string, unknown>;
  query?: string;
  /** A Viewer reaches the route, so its response is walked for hidden keys. */
  viewerReadable?: boolean;
  /** The gate lets the role in, then the handler refines and may answer 403. */
  downstream403?: boolean;
  /** Path param values that differ from the defaults. */
  params?: Record<string, string>;
  /** Reshapes the seed for one actor, for a route that loads rows by caller. */
  setup?: (tables: Seed, userId: string) => void;
};

// Routes that take no project id; each one names why it is not in the table.
export const EXEMPT_ROUTES: Record<string, string> = {
  projects: "list and create, no project id; scoped to the caller's own rows",
  "projects/search": "no project id; scopes itself to the caller's projects",
  "meetings/by-call/[callId]": "looks up by call id, covered by its own tests",
  meetings: "list, scoped to the caller's own and project meetings",
};

export const IDS = {
  project: "00000000-0000-4000-8000-000000000001",
  task: "00000000-0000-4000-8000-000000000002",
  proposal: "00000000-0000-4000-8000-000000000003",
  meeting: "00000000-0000-4000-8000-000000000004",
  comment: "00000000-0000-4000-8000-000000000005",
  other: "00000000-0000-4000-8000-000000000006",
} as const;

export const USERS: Record<Actor, string> = {
  owner: "user_owner",
  admin: "user_admin",
  developer: "user_developer",
  viewer: "user_viewer",
  removed: "user_removed",
  outsider: "user_outsider",
};

const NEED_ALLOWED: Record<Need, readonly Actor[]> = {
  member: ["owner", "admin", "developer", "viewer"],
  content: ["owner", "admin", "developer"],
  manage: ["owner", "admin"],
  owner: ["owner"],
};

export const allowedFor = (need: Need, actor: Actor): boolean =>
  NEED_ALLOWED[need].includes(actor);

// Id of each [param] in a route path, by the first segment's resource.
const FIRST_ID: Record<string, string> = {
  projects: IDS.project,
  tasks: IDS.task,
  proposals: IDS.proposal,
  meetings: IDS.meeting,
};

export function paramsFor(
  route: string,
  override: Record<string, string> = {},
): Record<string, string> {
  const resource = route.split("/")[0];
  const params: Record<string, string> = {
    id: FIRST_ID[resource] ?? IDS.other,
    userId: USERS.developer,
    repoId: "1",
    invitationId: IDS.other,
    requestId: IDS.other,
    commentId: IDS.comment,
    callId: "call-1",
    ...override,
  };
  return params;
}

export const urlFor = (row: MatrixRow): string => {
  const params = paramsFor(row.route, row.params);
  const path = row.route.replace(
    /\[(\w+)\]/g,
    (_m, name: string) => params[name] ?? IDS.other,
  );
  return `http://localhost/api/${path}${row.query ?? ""}`;
};

const P = IDS.project;
const M = IDS.meeting;

export const MATRIX: MatrixRow[] = [
  // projects/[id]
  {
    route: "projects/[id]",
    method: "GET",
    need: "member",
    viewerReadable: true,
  },
  {
    route: "projects/[id]",
    method: "PATCH",
    need: "owner",
    body: { name: "New" },
  },
  {
    route: "projects/[id]",
    method: "DELETE",
    need: "owner",
    body: { confirmName: "Matrix" },
  },
  {
    route: "projects/[id]/transfer",
    method: "POST",
    need: "owner",
    body: { userId: USERS.admin },
  },
  {
    route: "projects/[id]/members",
    method: "GET",
    need: "member",
    viewerReadable: true,
  },
  {
    route: "projects/[id]/members/[userId]",
    method: "PATCH",
    need: "manage",
    body: { role: "viewer" },
  },
  // Leaving yourself needs only membership; removing someone else needs manage.
  // The gate here depends on the target, so this row checks the member path.
  {
    route: "projects/[id]/members/[userId]",
    method: "DELETE",
    need: "manage",
    params: { userId: "user_target" },
  },
  {
    route: "projects/[id]/invitations",
    method: "POST",
    need: "manage",
    body: { kind: "link", role: "viewer" },
  },
  { route: "projects/[id]/invitations", method: "GET", need: "manage" },
  {
    route: "projects/[id]/invitations/[invitationId]",
    method: "DELETE",
    need: "manage",
  },
  {
    route: "projects/[id]/invitations/[invitationId]/resend",
    method: "POST",
    need: "manage",
  },
  { route: "projects/[id]/join-requests", method: "GET", need: "manage" },
  {
    route: "projects/[id]/join-requests/[requestId]",
    method: "POST",
    need: "manage",
    body: { decision: "deny" },
  },
  { route: "projects/[id]/proposals", method: "GET", need: "content" },
  {
    route: "projects/[id]/tasks",
    method: "GET",
    need: "member",
    viewerReadable: true,
  },
  {
    route: "projects/[id]/tasks",
    method: "POST",
    need: "content",
    body: { title: "A task" },
  },
  {
    route: "projects/[id]/ledger",
    method: "GET",
    need: "member",
    viewerReadable: true,
  },
  {
    route: "projects/[id]/activity",
    method: "GET",
    need: "member",
    viewerReadable: true,
  },
  { route: "projects/[id]/github/summary", method: "GET", need: "content" },
  { route: "projects/[id]/github/sync", method: "POST", need: "manage" },
  { route: "projects/[id]/github/repos", method: "GET", need: "owner" },
  {
    route: "projects/[id]/github/repos",
    method: "POST",
    need: "owner",
    body: { repoId: 1 },
  },
  {
    route: "projects/[id]/github/repos/[repoId]",
    method: "DELETE",
    need: "owner",
  },
  // tasks/[id]: the project comes from the task row.
  { route: "tasks/[id]", method: "GET", need: "member", viewerReadable: true },
  {
    route: "tasks/[id]",
    method: "PATCH",
    need: "member",
    body: { status: "in_progress", ifVersion: 1 },
    downstream403: true,
  },
  {
    route: "tasks/[id]/comments",
    method: "POST",
    need: "content",
    body: { body: "Hello" },
  },
  {
    route: "tasks/[id]/comments/[commentId]",
    method: "DELETE",
    need: "member",
    downstream403: true,
  },
  { route: "tasks/[id]/commits", method: "GET", need: "content" },
  // proposals/[id]: the project comes from the item's meeting.
  {
    route: "proposals/[id]/review",
    method: "POST",
    need: "manage",
    body: { decision: "reject" },
  },
  // project meetings: the project comes from the meeting row.
  {
    route: "meetings/[id]",
    method: "GET",
    need: "member",
    viewerReadable: true,
  },
  { route: "meetings/[id]", method: "DELETE", need: "owner" },
  // The consent and member routes take the Stream call id, not the meeting id.
  {
    route: "meetings/[id]/consent",
    method: "POST",
    need: "member",
    body: { noticeVersion: CONSENT_NOTICE_VERSION },
    params: { id: "call-1" },
  },
  {
    route: "meetings/[id]/members",
    method: "POST",
    need: "member",
    params: { id: "call-1" },
  },
  // Only the meeting's creator reaches the role check, so each actor is made
  // the creator of a personal meeting, and the target project is the gate.
  {
    route: "meetings/[id]/project",
    method: "POST",
    need: "content",
    body: { projectId: P },
    setup: (tables, userId) => {
      tables.meetings = [
        { id: M, user_id: userId, project_id: null, title: "Personal" },
      ];
    },
  },
];

// ---------------------------------------------------------------------------
// A stateful fake of the Supabase client.

type Filter = (row: Row) => boolean;

export function seedTables(): Seed {
  const member = (
    user_id: string,
    role: ProjectRole,
    removed_at: string | null,
  ) => ({
    project_id: P,
    user_id,
    role,
    removed_at,
  });
  return {
    project_members: [
      member(USERS.owner, "owner", null),
      member(USERS.admin, "admin", null),
      member(USERS.developer, "developer", null),
      member(USERS.viewer, "viewer", null),
      // A removed member keeps a row, so only `removed_at is null` keeps them out.
      member(USERS.removed, "admin", "2026-11-01T00:00:00Z"),
    ],
    projects: [{ id: P, name: "Matrix", task_prefix: "NM", status: "active" }],
    tasks: [
      {
        id: IDS.task,
        project_id: P,
        number: 1,
        title: "Fix login",
        status: "todo",
        assignee_id: null,
        version: 1,
        position: 1,
        completion_evidence: "secret evidence",
        quote: "I will fix login by Friday",
        quote_speaker: "Ayesha",
        quote_line: 12,
        source_meeting_id: M,
      },
    ],
    task_links: [
      {
        id: "link-1",
        task_id: IDS.task,
        project_id: P,
        pr_number: 7,
        pr_title: "Secret PR title",
        pr_url: "https://github.com/acme/secret/pull/7",
        repo_full_name: "acme/secret",
        state: "merged",
      },
    ],
    ledger_items: [
      {
        id: "ledger-1",
        meeting_id: M,
        kind: "promise",
        statement: "Fix login",
        quote: "I will fix login by Friday",
        speaker: "Ayesha",
        line_number: 12,
      },
    ],
    meetings: [
      {
        id: M,
        user_id: USERS.owner,
        project_id: P,
        title: "Matrix meeting",
        stream_call_id: "call-1",
      },
    ],
    action_items: [{ id: IDS.proposal, meeting_id: M, title: "Fix login" }],
    task_comments: [
      {
        id: IDS.comment,
        task_id: IDS.task,
        author_id: USERS.developer,
        project_id: P,
      },
    ],
  };
}

export type FakeDb = {
  from: (table: string) => unknown;
  rpc: (
    name: string,
    args?: unknown,
  ) => Promise<{ data: unknown; error: unknown }>;
  /** Every select column list asked of a table, for the hidden column check. */
  selects: { table: string; columns: string }[];
  /** Every project_members lookup: who asked and which role came back. */
  lookups: { userId: unknown; role: unknown }[];
};

// Top level column names of a select list, ignoring nested relation bodies.
function topColumns(columns: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of columns) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(current.trim());
      current = "";
    } else current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out.map((c) => {
    const noAlias = c.includes(":") ? c.split(":")[1] : c;
    return noAlias
      .replace(/\([\s\S]*$/, "")
      .replace(/!.*$/, "")
      .trim();
  });
}

function project(row: Row, columns: string | null): Row {
  if (!columns || columns.trim() === "*") return { ...row };
  const keep = new Set(topColumns(columns));
  return Object.fromEntries(Object.entries(row).filter(([k]) => keep.has(k)));
}

export function makeFakeDb(tables: Seed = seedTables()): FakeDb {
  const selects: FakeDb["selects"] = [];
  const lookups: FakeDb["lookups"] = [];

  const builder = (table: string) => {
    const filters: Filter[] = [];
    let columns: string | null = null;
    let wrote = false;
    const eqs: Record<string, unknown> = {};
    const run = (): Row[] => {
      const rows = (tables[table] ?? []).filter((r) =>
        filters.every((f) => f(r)),
      );
      return wrote ? [] : rows.map((r) => project(r, columns));
    };
    const single = () => {
      const [first] = run();
      if (table === "project_members") {
        lookups.push({
          userId: eqs.user_id,
          role: first?.role ?? null,
        });
      }
      return Promise.resolve({ data: first ?? null, error: null });
    };
    const b: Record<string, unknown> = {
      select: (cols?: string) => {
        columns = cols ?? "*";
        selects.push({ table, columns });
        return b;
      },
      eq: (col: string, val: unknown) => {
        eqs[col] = val;
        filters.push((r) => r[col] === val);
        return b;
      },
      neq: (col: string, val: unknown) => {
        filters.push((r) => r[col] !== val);
        return b;
      },
      is: (col: string, val: unknown) => {
        filters.push((r) => (r[col] ?? null) === val);
        return b;
      },
      in: (col: string, vals: unknown[]) => {
        filters.push((r) => vals.includes(r[col]));
        return b;
      },
      insert: () => ((wrote = true), b),
      update: () => ((wrote = true), b),
      delete: () => ((wrote = true), b),
      upsert: () => ((wrote = true), b),
      maybeSingle: single,
      single,
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve({ data: run(), error: null, count: run().length }).then(
          res,
          rej,
        ),
    };
    for (const name of [
      "not",
      "gt",
      "gte",
      "lt",
      "lte",
      "ilike",
      "like",
      "order",
      "limit",
      "range",
      "match",
      "or",
      "contains",
    ]) {
      b[name] = () => b;
    }
    return b;
  };

  return {
    from: builder,
    rpc: async () => ({ data: null, error: null }),
    selects,
    lookups,
  };
}
