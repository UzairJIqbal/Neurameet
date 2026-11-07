import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import { accessErrorResponse, checkMeetingAccess } from "@/lib/project-auth";
import { deriveLedgerStatus } from "@/agent/ledger";
import {
  ledgerItemSelectFor,
  ledgerLinkSelectFor,
  meetingsInProject,
  toLedgerItem,
  toLedgerLink,
  type LedgerItemRow,
  type LedgerLinkRow,
} from "@/lib/project-select";
import { outcomesForItems } from "@/lib/proof-chain";
import type { ProjectRole } from "@/lib/project-types";
import type {
  LedgerIncomingLink,
  LedgerLink,
  LedgerLiveMark,
  LedgerLiveOnlyMark,
  LedgerResponse,
} from "@/lib/meeting-types";
import type { Outcome } from "@/lib/proof-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LiveMarkRow {
  meeting_id: string;
  item_id: string;
  mark: LedgerLiveMark;
  marked_at: string | null;
}

interface TaskLinkRow {
  id: string;
  repo_full_name: string;
  pr_number: number;
  pr_url: string;
  reverted_at: string | null;
}

interface SourceMeetingRow {
  id: string;
  title: string;
  started_at: string;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

// Code links read their PR in one batch. A Viewer's copy has no PR title, repo
// name, or link, and the task_links query is never run for them (AC-55, AC-62a).
async function toOutgoingLinks(
  supabase: ReturnType<typeof supabaseServer>,
  rows: LedgerLinkRow[],
  role: ProjectRole | null,
): Promise<LedgerLink[]> {
  const links = rows.map((row) => toLedgerLink(row, role));
  const taskLinkIds = rows
    .map((r) => r.evidence_task_link_id)
    .filter((id): id is string => !!id);
  if (taskLinkIds.length === 0 || role === "viewer") return links;

  const { data, error } = await supabase
    .from("task_links")
    .select("id, repo_full_name, pr_number, pr_url, reverted_at")
    .in("id", taskLinkIds);
  if (error) throw error;
  const prs = new Map(
    ((data ?? []) as TaskLinkRow[]).map((row) => [row.id, row]),
  );
  return links.map((link, index) => {
    const pr = prs.get(rows[index].evidence_task_link_id ?? "");
    if (!pr) return link;
    return {
      ...link,
      pr: {
        repoFullName: pr.repo_full_name,
        prNumber: pr.pr_number,
        prUrl: pr.pr_url,
        reverted: pr.reverted_at !== null,
      },
    };
  });
}

// AC-62b: evidence from outside the project keeps no quote or meeting link. A
// confirmed one still counts toward status, and a suggested one is not shown.
async function hideOutsideEvidence(
  supabase: ReturnType<typeof supabaseServer>,
  links: LedgerLink[],
  projectId: string | null,
): Promise<LedgerLink[]> {
  if (!projectId) return links;
  const evidenceIds = links
    .filter((l) => l.evidenceKind === "meeting" && l.evidenceMeetingId)
    .map((l) => l.evidenceMeetingId as string);
  const inside = await meetingsInProject(supabase, evidenceIds, projectId);
  return links.flatMap((link) => {
    if (link.evidenceKind !== "meeting" || !link.evidenceMeetingId) return [link];
    if (inside.has(link.evidenceMeetingId)) return [link];
    if (link.state === "suggested") return [];
    return [
      {
        ...link,
        evidenceMeetingId: null,
        quote: null,
        speaker: null,
        lineNumber: null,
        outsideProject: true,
      },
    ];
  });
}

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const meetingId = params.get("meetingId");
  const today = params.get("today");
  if (!meetingId || !today || !isIsoDate(today)) {
    return NextResponse.json(
      { error: "meetingId and today (YYYY-MM-DD) are required" },
      { status: 400 },
    );
  }

  try {
    const supabase = supabaseServer();

    const { data: meeting, error: meetingErr } = await supabase
      .from("meetings")
      .select("id, user_id, project_id, title")
      .eq("id", meetingId)
      .maybeSingle();
    if (meetingErr) throw meetingErr;
    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }
    // Personal meeting: the creator only. Project meeting: any member.
    const { projectId, role } = await checkMeetingAccess(
      supabase,
      userId,
      meeting,
      "read",
    );

    // Items said in this meeting, plus the links later meetings suggested.
    const { data: itemRows, error: itemsErr } = await supabase
      .from("ledger_items")
      .select(ledgerItemSelectFor(role))
      .eq("meeting_id", meetingId)
      .order("line_number", { ascending: true });
    if (itemsErr) throw itemsErr;
    const items = ((itemRows ?? []) as unknown as LedgerItemRow[]).map((row) =>
      toLedgerItem(row, role),
    );

    let outgoing: LedgerLink[] = [];
    const itemMarks = new Map<string, LedgerLiveMark>();
    if (items.length > 0) {
      const { data: outRows, error: outErr } = await supabase
        .from("ledger_links")
        .select(ledgerLinkSelectFor(role))
        .in(
          "item_id",
          items.map((i) => i.id),
        );
      if (outErr) throw outErr;
      outgoing = await toOutgoingLinks(
        supabase,
        (outRows ?? []) as unknown as LedgerLinkRow[],
        role,
      );

      // Live marks later calls made on these items (spec 0002 AC-15).
      const { data: markRows, error: markErr } = await supabase
        .from("ledger_live_marks")
        .select("meeting_id, item_id, mark, marked_at")
        .in(
          "item_id",
          items.map((i) => i.id),
        )
        .not("mark", "is", null)
        .order("marked_at", { ascending: true });
      if (markErr) throw markErr;
      // Ascending, so the latest mark per item wins.
      for (const row of (markRows ?? []) as LiveMarkRow[]) {
        itemMarks.set(row.item_id, row.mark);
      }
    }

    // Links found in this meeting that point back at earlier items.
    const { data: inRows, error: inErr } = await supabase
      .from("ledger_links")
      .select(ledgerLinkSelectFor(role))
      .eq("evidence_meeting_id", meetingId);
    if (inErr) throw inErr;
    const incomingLinks = ((inRows ?? []) as unknown as LedgerLinkRow[]).map(
      (row) => toLedgerLink(row, role),
    );

    // Marks the owner made live in this meeting on earlier items.
    const { data: hereMarkRows, error: hereMarkErr } = await supabase
      .from("ledger_live_marks")
      .select("meeting_id, item_id, mark, marked_at")
      .eq("meeting_id", meetingId)
      .not("mark", "is", null);
    if (hereMarkErr) throw hereMarkErr;
    const hereMarks = new Map(
      ((hereMarkRows ?? []) as LiveMarkRow[]).map((r) => [r.item_id, r.mark]),
    );

    const incoming: LedgerIncomingLink[] = [];
    const liveOnly: LedgerLiveOnlyMark[] = [];
    const srcItemIds = [
      ...new Set([...incomingLinks.map((l) => l.itemId), ...hereMarks.keys()]),
    ];
    if (srcItemIds.length > 0) {
      const { data: srcItemRows, error: srcItemsErr } = await supabase
        .from("ledger_items")
        .select(ledgerItemSelectFor(role))
        .in("id", srcItemIds);
      if (srcItemsErr) throw srcItemsErr;
      const srcItems = new Map(
        ((srcItemRows ?? []) as unknown as LedgerItemRow[]).map((r) => [
          r.id,
          toLedgerItem(r, role),
        ]),
      );

      // Scoped to the caller (or, on a project meeting, to the project), so a
      // link can never surface another user's or another project's meeting.
      const srcMeetingQuery = supabase
        .from("meetings")
        .select("id, title, started_at")
        .in(
          "id",
          [...srcItems.values()].map((i) => i.meetingId),
        );
      const { data: srcMeetingRows, error: srcMeetingsErr } = projectId
        ? await srcMeetingQuery.eq("project_id", projectId)
        : await srcMeetingQuery.eq("user_id", userId);
      if (srcMeetingsErr) throw srcMeetingsErr;
      const srcMeetings = new Map(
        ((srcMeetingRows ?? []) as SourceMeetingRow[]).map((m) => [m.id, m]),
      );

      for (const link of incomingLinks) {
        const item = srcItems.get(link.itemId);
        const source = item ? srcMeetings.get(item.meetingId) : undefined;
        if (!item || !source) continue;
        incoming.push({
          ...link,
          item,
          sourceMeeting: {
            id: source.id,
            title: source.title,
            startedAt: source.started_at,
          },
          liveMark: hereMarks.get(link.itemId) ?? null,
        });
      }

      // A live mark no transcript link backs (a rejected link backs nothing).
      const backed = new Set(
        incomingLinks
          .filter((l) => l.state !== "rejected")
          .map((l) => l.itemId),
      );
      for (const [itemId, mark] of hereMarks) {
        const item = srcItems.get(itemId);
        const source = item ? srcMeetings.get(item.meetingId) : undefined;
        if (!item || !source || backed.has(itemId)) continue;
        liveOnly.push({
          mark,
          item,
          sourceMeeting: {
            id: source.id,
            title: source.title,
            startedAt: source.started_at,
          },
        });
      }
    }

    const visibleOutgoing = await hideOutsideEvidence(
      supabase,
      outgoing,
      projectId,
    );
    // Last, on project meetings only. A personal meeting shows no card (AC-60).
    const outcomes = projectId
      ? await outcomesForItems(
          supabase,
          items.map((item) => ({
            ...item,
            meetingTitle: (meeting as { title?: string | null }).title ?? null,
            projectId,
          })),
          role,
        )
      : new Map<string, Outcome>();

    const body: LedgerResponse = {
      items: items.map((item) => ({
        ...item,
        derivedStatus: deriveLedgerStatus(item.status, item.dueDate, today),
        links: visibleOutgoing.filter((l) => l.itemId === item.id),
        liveMark: itemMarks.get(item.id) ?? null,
        ...(outcomes.has(item.id) ? { outcome: outcomes.get(item.id) } : {}),
      })),
      incoming,
      liveOnly,
      reversalCount: incoming.filter(
        (l) => l.relation === "reversed" && l.state !== "rejected",
      ).length,
    };
    return NextResponse.json(body);
  } catch (err) {
    const denied = accessErrorResponse(err);
    if (denied) return denied;
    console.error("[ledger] read failed", { meetingId, err });
    return NextResponse.json(
      { error: "Failed to load the ledger" },
      { status: 500 },
    );
  }
}
