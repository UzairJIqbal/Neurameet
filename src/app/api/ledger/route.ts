import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import { deriveLedgerStatus } from "@/agent/ledger";
import type {
  LedgerIncomingLink,
  LedgerItem,
  LedgerLink,
  LedgerResponse,
} from "@/lib/meeting-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LedgerItemRow {
  id: string;
  meeting_id: string;
  action_item_id: string | null;
  kind: LedgerItem["kind"];
  statement: string;
  quote: string;
  quote_language: LedgerItem["quoteLanguage"];
  speaker: string | null;
  assignee: string | null;
  due_date: string | null;
  line_number: number;
  status: LedgerItem["status"];
  created_at: string;
}

interface LedgerLinkRow {
  id: string;
  item_id: string;
  evidence_meeting_id: string;
  relation: LedgerLink["relation"];
  quote: string;
  speaker: string | null;
  line_number: number;
  confidence: number;
  state: LedgerLink["state"];
  decided_at: string | null;
  created_at: string;
}

interface SourceMeetingRow {
  id: string;
  title: string;
  started_at: string;
}

const ITEM_COLUMNS =
  "id, meeting_id, action_item_id, kind, statement, quote, quote_language, speaker, assignee, due_date, line_number, status, created_at";
const LINK_COLUMNS =
  "id, item_id, evidence_meeting_id, relation, quote, speaker, line_number, confidence, state, decided_at, created_at";

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function toItem(row: LedgerItemRow): LedgerItem {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    actionItemId: row.action_item_id,
    kind: row.kind,
    statement: row.statement,
    quote: row.quote,
    quoteLanguage: row.quote_language,
    speaker: row.speaker,
    assignee: row.assignee,
    dueDate: row.due_date,
    lineNumber: row.line_number,
    status: row.status,
    createdAt: row.created_at,
  };
}

function toLink(row: LedgerLinkRow): LedgerLink {
  return {
    id: row.id,
    itemId: row.item_id,
    evidenceMeetingId: row.evidence_meeting_id,
    relation: row.relation,
    quote: row.quote,
    speaker: row.speaker,
    lineNumber: row.line_number,
    confidence: row.confidence,
    state: row.state,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
  };
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
      .select("id")
      .eq("id", meetingId)
      .eq("user_id", userId)
      .maybeSingle();
    if (meetingErr) throw meetingErr;
    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    // Items said in this meeting, plus the links later meetings suggested.
    const { data: itemRows, error: itemsErr } = await supabase
      .from("ledger_items")
      .select(ITEM_COLUMNS)
      .eq("meeting_id", meetingId)
      .order("line_number", { ascending: true });
    if (itemsErr) throw itemsErr;
    const items = ((itemRows ?? []) as LedgerItemRow[]).map(toItem);

    let outgoing: LedgerLink[] = [];
    if (items.length > 0) {
      const { data: outRows, error: outErr } = await supabase
        .from("ledger_links")
        .select(LINK_COLUMNS)
        .in(
          "item_id",
          items.map((i) => i.id),
        );
      if (outErr) throw outErr;
      outgoing = ((outRows ?? []) as LedgerLinkRow[]).map(toLink);
    }

    // Links found in this meeting that point back at earlier items.
    const { data: inRows, error: inErr } = await supabase
      .from("ledger_links")
      .select(LINK_COLUMNS)
      .eq("evidence_meeting_id", meetingId);
    if (inErr) throw inErr;
    const incomingLinks = ((inRows ?? []) as LedgerLinkRow[]).map(toLink);

    const incoming: LedgerIncomingLink[] = [];
    if (incomingLinks.length > 0) {
      const { data: srcItemRows, error: srcItemsErr } = await supabase
        .from("ledger_items")
        .select(ITEM_COLUMNS)
        .in(
          "id",
          incomingLinks.map((l) => l.itemId),
        );
      if (srcItemsErr) throw srcItemsErr;
      const srcItems = new Map(
        ((srcItemRows ?? []) as LedgerItemRow[]).map((r) => [r.id, toItem(r)]),
      );

      // Scoped to the caller, so a link can never surface another user's meeting.
      const { data: srcMeetingRows, error: srcMeetingsErr } = await supabase
        .from("meetings")
        .select("id, title, started_at")
        .in(
          "id",
          [...srcItems.values()].map((i) => i.meetingId),
        )
        .eq("user_id", userId);
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
        });
      }
    }

    const body: LedgerResponse = {
      items: items.map((item) => ({
        ...item,
        derivedStatus: deriveLedgerStatus(item.status, item.dueDate, today),
        links: outgoing.filter((l) => l.itemId === item.id),
      })),
      incoming,
      reversalCount: incoming.filter(
        (l) => l.relation === "reversed" && l.state !== "rejected",
      ).length,
    };
    return NextResponse.json(body);
  } catch (err) {
    console.error("[ledger] read failed", { meetingId, err });
    return NextResponse.json(
      { error: "Failed to load the ledger" },
      { status: 500 },
    );
  }
}
