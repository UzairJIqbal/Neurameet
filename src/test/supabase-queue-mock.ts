// Test helper: a Supabase client whose every awaited query on a table takes the
// next queued result for that table (default `{ data: null, error: null }`).
// Every chained call is recorded so a test can assert what was written.
//
//   vi.mock("@/lib/supabase-server", async () =>
//     (await import("@/test/supabase-queue-mock")).supabaseServerModule);

export interface QueryResult {
  data: unknown;
  error: unknown;
  count?: number | null;
}

export interface RecordedCall {
  table: string;
  method: string;
  args: unknown[];
}

export const queues: Record<string, QueryResult[]> = {};
export const calls: RecordedCall[] = [];

const CHAIN = [
  "select",
  "eq",
  "neq",
  "in",
  "is",
  "not",
  "gt",
  "gte",
  "lt",
  "lte",
  "ilike",
  "order",
  "limit",
  "range",
  "insert",
  "update",
  "delete",
  "upsert",
  "match",
  "or",
];

function makeBuilder(table: string): Record<string, unknown> {
  const next = () =>
    Promise.resolve(queues[table]?.shift() ?? { data: null, error: null });
  const builder: Record<string, unknown> = {};
  for (const method of CHAIN) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ table, method, args });
      return builder;
    };
  }
  builder.maybeSingle = next;
  builder.single = next;
  builder.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    next().then(res, rej);
  return builder;
}

export const client = {
  from: (table: string) => makeBuilder(table),
  // rpc results queue under "rpc:<name>"; the args are recorded like a chain call.
  rpc: (name: string, args?: unknown) => {
    calls.push({ table: `rpc:${name}`, method: "rpc", args: [args] });
    return Promise.resolve(
      queues[`rpc:${name}`]?.shift() ?? { data: null, error: null },
    );
  },
};

export const supabaseServerModule = { supabaseServer: () => client };

export function resetQueues(): void {
  for (const k of Object.keys(queues)) delete queues[k];
  calls.length = 0;
}

export function queue(table: string, ...results: QueryResult[]): void {
  queues[table] = [...(queues[table] ?? []), ...results];
}

export const ok = (data: unknown): QueryResult => ({ data, error: null });

/** Calls of one method on one table, e.g. every update on minutes_reviews. */
export const callsOf = (table: string, method: string): RecordedCall[] =>
  calls.filter((c) => c.table === table && c.method === method);
