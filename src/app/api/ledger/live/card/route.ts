import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase-server";
import {
  findLiveMeeting,
  liveManagerDenial,
  type LiveMeeting,
} from "@/lib/live-ledger-auth";
import { sendLiveLedgerEvent } from "@/lib/live-ledger-events";
import { buildCardEvent, type CardItemRow } from "@/lib/live-ledger-state";
import {
  RAISE_MIN_GAP_MS,
  isIsoDate,
  isLiveMark,
  type LiveCardState,
  type LiveLedgerCardEvent,
  type LiveMark,
} from "@/lib/live-ledger-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CardAction = "raise" | "mark" | "close";

interface CardBody {
  callId: string;
  itemId: string;
  action: CardAction;
  mark: LiveMark | null;
  today: string;
}

const SEND_FAILED = "Could not reach everyone, try again";

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status });

function parseBody(raw: unknown): CardBody | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.callId !== "string" || !b.callId) return null;
  if (typeof b.itemId !== "string" || !b.itemId) return null;
  if (b.action !== "raise" && b.action !== "mark" && b.action !== "close") {
    return null;
  }
  if (b.action === "mark" && !isLiveMark(b.mark)) return null;
  const today =
    typeof b.today === "string" && isIsoDate(b.today)
      ? b.today
      : new Date().toISOString().slice(0, 10);
  return {
    callId: b.callId,
    itemId: b.itemId,
    action: b.action,
    mark: isLiveMark(b.mark) ? b.mark : null,
    today,
  };
}

/**
 * The card payload for an item from another meeting of the same scope: the
 * owner's own meetings for a personal call, the project's meetings for a
 * project call.
 */
async function loadCard(
  supabase: SupabaseClient,
  meeting: LiveMeeting,
  itemId: string,
  today: string,
): Promise<LiveLedgerCardEvent | null> {
  const { data: itemData, error: itemErr } = await supabase
    .from("ledger_items")
    .select("id, meeting_id, statement, quote, assignee, due_date")
    .eq("id", itemId)
    .maybeSingle();
  if (itemErr) throw itemErr;
  const item = itemData as CardItemRow | null;
  if (!item || item.meeting_id === meeting.id) return null;

  const sourceQuery = supabase
    .from("meetings")
    .select("id, title")
    .eq("id", item.meeting_id);
  const { data: srcData, error: srcErr } = await (
    meeting.projectId
      ? sourceQuery.eq("project_id", meeting.projectId)
      : sourceQuery.eq("user_id", meeting.ownerId)
  ).maybeSingle();
  if (srcErr) throw srcErr;
  const source = srcData as { id: string; title: string | null } | null;
  if (!source) return null;

  return buildCardEvent(item, source.title, today);
}

async function raise(
  supabase: SupabaseClient,
  meeting: LiveMeeting,
  body: CardBody,
  callId: string,
) {
  const card = await loadCard(supabase, meeting, body.itemId, body.today);
  if (!card) return json({ error: "Promise not found" }, 404);

  const { data: latestData, error: latestErr } = await supabase
    .from("ledger_live_marks")
    .select("raised_at")
    .eq("meeting_id", meeting.id)
    .order("raised_at", { ascending: false })
    .limit(1);
  if (latestErr) throw latestErr;
  const latest = (latestData ?? []) as Array<{ raised_at: string }>;
  const now = new Date();
  if (
    latest.length > 0 &&
    now.getTime() - new Date(latest[0].raised_at).getTime() < RAISE_MIN_GAP_MS
  ) {
    return json({ error: "Slow down a moment, then try again" }, 429);
  }

  const nowIso = now.toISOString();
  // One open card per meeting: raising B closes A.
  const { error: closeErr } = await supabase
    .from("ledger_live_marks")
    .update({ closed_at: nowIso })
    .eq("meeting_id", meeting.id)
    .is("closed_at", null)
    .neq("item_id", body.itemId);
  if (closeErr) throw closeErr;

  // Reopening keeps an earlier mark; upsert only touches the listed columns.
  const { data: rowData, error: upsertErr } = await supabase
    .from("ledger_live_marks")
    .upsert(
      {
        meeting_id: meeting.id,
        item_id: body.itemId,
        raised_at: nowIso,
        closed_at: null,
      },
      { onConflict: "meeting_id,item_id" },
    )
    .select("mark")
    .single();
  if (upsertErr) throw upsertErr;
  const mark = (rowData as { mark: LiveMark | null } | null)?.mark ?? null;

  const sent = await sendLiveLedgerEvent(callId, meeting.ownerId, card);
  if (sent && mark) {
    await sendLiveLedgerEvent(callId, meeting.ownerId, {
      event: "ledger.card_mark",
      itemId: card.itemId,
      mark,
    });
  }
  if (!sent) return json({ error: SEND_FAILED }, 502);
  return json({ card, mark } satisfies LiveCardState);
}

async function markCard(
  supabase: SupabaseClient,
  meeting: LiveMeeting,
  body: CardBody,
  callId: string,
  mark: LiveMark,
) {
  const { data, error } = await supabase
    .from("ledger_live_marks")
    .update({ mark, marked_at: new Date().toISOString() })
    .eq("meeting_id", meeting.id)
    .eq("item_id", body.itemId)
    .is("closed_at", null)
    .select("id");
  if (error) throw error;
  if ((data ?? []).length === 0) {
    return json({ error: "This card is not up right now" }, 409);
  }
  const sent = await sendLiveLedgerEvent(callId, meeting.ownerId, {
    event: "ledger.card_mark",
    itemId: body.itemId,
    mark,
  });
  if (!sent) return json({ error: SEND_FAILED }, 502);
  return json({ itemId: body.itemId, mark });
}

async function closeCard(
  supabase: SupabaseClient,
  meeting: LiveMeeting,
  body: CardBody,
  callId: string,
) {
  const { error } = await supabase
    .from("ledger_live_marks")
    .update({ closed_at: new Date().toISOString() })
    .eq("meeting_id", meeting.id)
    .eq("item_id", body.itemId)
    .is("closed_at", null);
  if (error) throw error;
  // Closing twice is harmless; the event still clears stale screens.
  const sent = await sendLiveLedgerEvent(callId, meeting.ownerId, {
    event: "ledger.card_close",
    itemId: body.itemId,
  });
  if (!sent) return json({ error: SEND_FAILED }, 502);
  return json({ itemId: body.itemId, closed: true });
}

/**
 * Manager only (personal: the creator; project: Owner or Admin): raise, mark, or close a Promise Check-in card (spec 0002 AC-4
 * to AC-8). The row is written first, then the server sends the event.
 */
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return json({ error: "Unauthorized" }, 401);

  let body: CardBody | null;
  try {
    body = parseBody(await request.json());
  } catch {
    body = null;
  }
  if (!body) {
    return json(
      { error: "callId, itemId and a valid action (and mark) are required" },
      400,
    );
  }

  try {
    const supabase = supabaseServer();
    // Manage rights come from the stored meeting, never the client's call state.
    const meeting = await findLiveMeeting(supabase, body.callId);
    if (!meeting) return json({ error: "Meeting not found" }, 404);
    const denied = await liveManagerDenial(supabase, userId, meeting);
    if (denied) return denied;
    if (body.action === "raise") {
      return await raise(supabase, meeting, body, body.callId);
    }
    if (body.action === "mark" && body.mark) {
      return await markCard(supabase, meeting, body, body.callId, body.mark);
    }
    return await closeCard(supabase, meeting, body, body.callId);
  } catch (err) {
    console.error("[live-ledger] card failed", {
      callId: body.callId,
      action: body.action,
      err,
    });
    return json({ error: "Could not update the card" }, 500);
  }
}
