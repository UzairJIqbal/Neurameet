import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase-server";
import {
  NEED_ROLES,
  accessErrorResponse,
  requireProjectRole,
} from "@/lib/project-auth";
import {
  PAGE_SIZE,
  cursorFilter,
  ledgerItemSelectFor,
  ledgerLinkSelectFor,
  meetingsInProject,
  pageOf,
  parseCursor,
  pktToday,
  toLedgerItem,
  type LedgerItemRow,
  type LedgerLinkRow,
} from "@/lib/project-select";
import { outcomesForItems } from "@/lib/proof-chain";
import { deriveLedgerStatus } from "@/agent/ledger";
import type { ProjectRole } from "@/lib/project-types";
import type {
  ProjectLedgerItem,
  ProjectLedgerLink,
  ProjectLedgerResponse,
  ReviewRow,
} from "@/lib/proof-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

type ItemWithMeeting = LedgerItemRow & {
  meetings: { id: string; title: string | null; started_at: string };
};

type ReviewLinkRow = {
  id: string;
  evidence_kind: "meeting" | "code";
  evidence_meeting_id: string | null;
  evidence_task_link_id: string | null;
  relation: ReviewRow["relation"];
  quote: string | null;
  speaker: string | null;
  line_number: number | null;
  confidence: number;
  created_at: string;
  ledger_items: {
    id: string;
    statement: string;
    meetings: { id: string; title: string | null };
  };
};

const KINDS = ["promise", "decision"];
const STATUSES = ["open", "overdue", "kept", "reversed"];
const REVIEW_SELECT =
  "id, evidence_kind, evidence_meeting_id, evidence_task_link_id, relation, quote, speaker, line_number, confidence, created_at, ledger_items!inner(id, statement, meetings!inner(id, title, project_id))";
const READ_BATCH = 1000;

const untitled = (title: string | null) => title || "Untitled meeting";

// Reads every suggested link, batch by batch, so the total stays exact past
// the database's row limit. Eligibility needs a second table, so it runs here.
async function loadNeedsReview(
  supabase: SupabaseClient,
  projectId: string,
): Promise<{ rows: ReviewRow[]; total: number }> {
  const all: ReviewLinkRow[] = [];
  for (let from = 0; ; from += READ_BATCH) {
    const { data, error } = await supabase
      .from("ledger_links")
      .select(REVIEW_SELECT)
      .eq("state", "suggested")
      .eq("ledger_items.meetings.project_id", projectId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + READ_BATCH - 1);
    if (error) throw error;
    const batch = (data ?? []) as unknown as ReviewLinkRow[];
    all.push(...batch);
    if (batch.length < READ_BATCH) break;
  }

  const inside = await meetingsInProject(
    supabase,
    all.map((r) => r.evidence_meeting_id).filter((id): id is string => !!id),
    projectId,
  );
  const eligible = all.filter(
    (r) =>
      r.evidence_kind === "code" ||
      (r.evidence_meeting_id !== null && inside.has(r.evidence_meeting_id)),
  );
  const shown = eligible.slice(0, PAGE_SIZE);

  const taskLinkIds = shown
    .map((r) => r.evidence_task_link_id)
    .filter((id): id is string => !!id);
  const prs = new Map<string, ReviewRow["pr"]>();
  if (taskLinkIds.length > 0) {
    const { data, error } = await supabase
      .from("task_links")
      .select("id, repo_full_name, pr_number, pr_url, reverted_at")
      .in("id", taskLinkIds);
    if (error) throw error;
    for (const pr of (data ?? []) as Array<{
      id: string;
      repo_full_name: string;
      pr_number: number;
      pr_url: string;
      reverted_at: string | null;
    }>) {
      prs.set(pr.id, {
        repoFullName: pr.repo_full_name,
        prNumber: pr.pr_number,
        prUrl: pr.pr_url,
        reverted: pr.reverted_at !== null,
      });
    }
  }

  return {
    total: eligible.length,
    rows: shown.map((r) => ({
      id: r.id,
      evidenceKind: r.evidence_kind,
      relation: r.relation,
      confidence: r.confidence,
      quote: r.quote,
      speaker: r.speaker,
      lineNumber: r.line_number,
      evidenceMeetingId: r.evidence_meeting_id,
      ...(r.evidence_task_link_id && prs.has(r.evidence_task_link_id)
        ? { pr: prs.get(r.evidence_task_link_id) }
        : {}),
      item: { id: r.ledger_items.id, statement: r.ledger_items.statement },
      meeting: {
        id: r.ledger_items.meetings.id,
        title: untitled(r.ledger_items.meetings.title),
      },
    })),
  };
}

// AC-62b: a suggested link from outside the project is not shown, and a decided
// one keeps only the flag that says so.
async function loadItemLinks(
  supabase: SupabaseClient,
  itemIds: string[],
  projectId: string,
  role: ProjectRole,
): Promise<Map<string, ProjectLedgerLink[]>> {
  const byItem = new Map<string, ProjectLedgerLink[]>();
  if (itemIds.length === 0) return byItem;
  const { data, error } = await supabase
    .from("ledger_links")
    .select(ledgerLinkSelectFor(role))
    .in("item_id", itemIds);
  if (error) throw error;
  const rows = (data ?? []) as unknown as LedgerLinkRow[];
  const inside = await meetingsInProject(
    supabase,
    rows
      .filter((r) => r.evidence_kind === "meeting" && r.evidence_meeting_id)
      .map((r) => r.evidence_meeting_id as string),
    projectId,
  );
  for (const row of rows) {
    const outside =
      row.evidence_kind === "meeting" &&
      (row.evidence_meeting_id === null ||
        !inside.has(row.evidence_meeting_id));
    if (outside && row.state === "suggested") continue;
    const list = byItem.get(row.item_id) ?? [];
    list.push({
      id: row.id,
      evidenceKind: row.evidence_kind,
      relation: row.relation,
      state: row.state,
      ...(outside ? { outsideProject: true } : {}),
    });
    byItem.set(row.item_id, list);
  }
  return byItem;
}

// Member: Decisions and Promises across the project's meetings (AC-57).
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const search = new URL(request.url).searchParams;
  const kind = search.get("kind");
  const status = search.get("status");
  const rawCursor = search.get("cursor");
  if (kind && !KINDS.includes(kind)) {
    return NextResponse.json({ error: "Unknown kind" }, { status: 422 });
  }
  if (status && !STATUSES.includes(status)) {
    return NextResponse.json({ error: "Unknown status" }, { status: 422 });
  }
  const cursor = rawCursor ? parseCursor(rawCursor, "ledger") : null;
  if (rawCursor && !cursor) {
    return NextResponse.json({ error: "Invalid cursor" }, { status: 422 });
  }

  try {
    const supabase = supabaseServer();
    const { role } = await requireProjectRole(
      supabase,
      userId,
      id,
      NEED_ROLES.read,
    );
    const canReview = NEED_ROLES.manage.includes(role);
    const today = pktToday();

    let query = supabase
      .from("ledger_items")
      .select(
        `${ledgerItemSelectFor(role)}, meetings!inner(id, title, started_at, project_id)`,
      )
      .eq("meetings.project_id", id);
    if (kind) query = query.eq("kind", kind);
    if (status === "overdue") {
      query = query.eq("status", "open").lt("due_date", today);
    } else if (status === "open") {
      query = query
        .eq("status", "open")
        .or(`due_date.is.null,due_date.gte.${today}`);
    } else if (status) {
      query = query.eq("status", status);
    }
    if (cursor) query = query.or(cursorFilter("created_at", "id", cursor));

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PAGE_SIZE + 1);
    if (error) throw error;

    const { page, next } = pageOf(
      (data ?? []) as unknown as ItemWithMeeting[],
      (row) => `${row.created_at}|${row.id}`,
    );
    const links = await loadItemLinks(
      supabase,
      page.map((r) => r.id),
      id,
      role,
    );
    const outcomes = await outcomesForItems(
      supabase,
      page.map((row) => ({
        ...toLedgerItem(row, role),
        meetingTitle: untitled(row.meetings.title),
        projectId: id,
      })),
      role,
    );
    const review = canReview
      ? await loadNeedsReview(supabase, id)
      : { rows: [], total: 0 };

    const items: ProjectLedgerItem[] = page.map((row) => {
      const item = toLedgerItem(row, role);
      return {
        ...item,
        derivedStatus: deriveLedgerStatus(item.status, item.dueDate, today),
        meeting: {
          id: row.meetings.id,
          title: untitled(row.meetings.title),
          startedAt: row.meetings.started_at,
        },
        links: links.get(row.id) ?? [],
        outcome: outcomes.get(row.id) as ProjectLedgerItem["outcome"],
      };
    });

    return NextResponse.json({
      items,
      nextCursor: next,
      canReview,
      needsReview: review.rows,
      reviewCount: review.total,
    } satisfies ProjectLedgerResponse);
  } catch (err) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("[project-ledger] read failed:", err);
    return NextResponse.json(
      { error: "Failed to load decisions and promises" },
      { status: 500 },
    );
  }
}
