import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase-server";
import { embedTexts } from "@/agent/embed";
import {
  findLiveMeeting,
  liveManagerDenial,
  type LiveMeeting,
} from "@/lib/live-ledger-auth";
import {
  countCallParticipants,
  sendLiveLedgerEvent,
} from "@/lib/live-ledger-events";
import { tallyVotes } from "@/lib/live-ledger-state";
import {
  AGREEMENT_STATEMENT_MAX,
  detectQuoteLanguage,
  type AgreementCloseResponse,
} from "@/lib/live-ledger-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AgreementBody =
  | { callId: string; action: "open"; statement: string }
  | { callId: string; action: "close"; agreementId: string };

const SEND_FAILED = "Could not reach everyone, try again";
// Postgres unique violation: the partial index allows one open agreement.
const UNIQUE_VIOLATION = "23505";

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status });

function parseBody(raw: unknown): AgreementBody | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.callId !== "string" || !b.callId) return null;
  if (b.action === "open") {
    const statement = typeof b.statement === "string" ? b.statement.trim() : "";
    if (!statement || statement.length > AGREEMENT_STATEMENT_MAX) return null;
    return { callId: b.callId, action: "open", statement };
  }
  if (b.action === "close") {
    if (typeof b.agreementId !== "string" || !b.agreementId) return null;
    return { callId: b.callId, action: "close", agreementId: b.agreementId };
  }
  return null;
}

async function openAgreement(
  supabase: SupabaseClient,
  meeting: LiveMeeting,
  callId: string,
  statement: string,
) {
  const { data, error } = await supabase
    .from("ledger_agreements")
    .insert({ meeting_id: meeting.id, statement })
    .select("id")
    .single();
  if (error) {
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
      return json({ error: "Close the open agreement first" }, 409);
    }
    throw error;
  }
  const agreementId = (data as { id: string }).id;
  const sent = await sendLiveLedgerEvent(callId, meeting.ownerId, {
    event: "ledger.agreement_open",
    agreementId,
    statement,
  });
  if (!sent) return json({ error: SEND_FAILED, agreementId }, 502);
  return json({ agreementId, statement });
}

/** One embedding for the saved decision; null on failure (logged, AC-11). */
async function embedStatement(statement: string): Promise<number[] | null> {
  try {
    const [vector] = await embedTexts([statement]);
    return vector ?? null;
  } catch (err) {
    console.error("[live-ledger] agreement embedding failed", { err });
    return null;
  }
}

async function closeAgreement(
  supabase: SupabaseClient,
  meeting: LiveMeeting,
  callId: string,
  agreementId: string,
) {
  const { data: rowData, error: rowErr } = await supabase
    .from("ledger_agreements")
    .select("id, statement, status")
    .eq("id", agreementId)
    .eq("meeting_id", meeting.id)
    .maybeSingle();
  if (rowErr) throw rowErr;
  const row = rowData as {
    id: string;
    statement: string;
    status: "open" | "closed";
  } | null;
  if (!row) return json({ error: "Agreement not found" }, 404);
  if (row.status !== "open") {
    return json({ error: "This agreement is already closed" }, 409);
  }

  const { tally, votes } = await tallyVotes(supabase, agreementId);
  const counted = await countCallParticipants(callId);
  const agreed = tally.agree;
  const total = Math.max(votes.length, counted ?? 0);

  // Conditional on status, so two closes cannot both write a ledger item.
  const { data: closedData, error: closeErr } = await supabase
    .from("ledger_agreements")
    .update({
      status: "closed",
      agreed_count: agreed,
      total_count: total,
      closed_at: new Date().toISOString(),
    })
    .eq("id", agreementId)
    .eq("status", "open")
    .select("id");
  if (closeErr) throw closeErr;
  if ((closedData ?? []).length === 0) {
    return json({ error: "This agreement is already closed" }, 409);
  }

  const embedding = await embedStatement(row.statement);
  const { data: itemData, error: itemErr } = await supabase
    .from("ledger_items")
    .insert({
      meeting_id: meeting.id,
      kind: "decision",
      statement: row.statement,
      quote: row.statement,
      quote_language: detectQuoteLanguage(row.statement),
      line_number: 0,
      source: "live_agreement",
      agreed_count: agreed,
      total_count: total,
      embedding,
    })
    .select("id")
    .single();
  let itemId: string | null = null;
  if (itemErr) {
    console.error("[live-ledger] agreement item write failed", {
      agreementId,
      err: itemErr,
    });
  } else {
    itemId = (itemData as { id: string }).id;
    const { error: linkErr } = await supabase
      .from("ledger_agreements")
      .update({ ledger_item_id: itemId })
      .eq("id", agreementId);
    if (linkErr) {
      console.error("[live-ledger] agreement item link failed", {
        agreementId,
        err: linkErr,
      });
    }
  }

  const sent = await sendLiveLedgerEvent(callId, meeting.ownerId, {
    event: "ledger.agreement_close",
    agreementId,
    agreed,
    total,
  });
  const result: AgreementCloseResponse = { agreed, total, itemId };
  if (!sent) return json({ error: SEND_FAILED, ...result }, 502);
  return json(result);
}

/**
 * Owner only Agreement Check (spec 0002 AC-9, AC-11): open a decision for a
 * quick vote, or close it and save "agreed by N of M" to the ledger.
 */
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return json({ error: "Unauthorized" }, 401);

  let body: AgreementBody | null;
  try {
    body = parseBody(await request.json());
  } catch {
    body = null;
  }
  if (!body) {
    return json(
      {
        error: `callId and an action are required; a decision is 1 to ${AGREEMENT_STATEMENT_MAX} characters`,
      },
      400,
    );
  }

  try {
    const supabase = supabaseServer();
    const meeting = await findLiveMeeting(supabase, body.callId);
    if (!meeting) return json({ error: "Meeting not found" }, 404);
    const denied = await liveManagerDenial(supabase, userId, meeting);
    if (denied) return denied;
    return body.action === "open"
      ? await openAgreement(supabase, meeting, body.callId, body.statement)
      : await closeAgreement(supabase, meeting, body.callId, body.agreementId);
  } catch (err) {
    console.error("[live-ledger] agreement failed", {
      callId: body.callId,
      action: body.action,
      err,
    });
    return json({ error: "Could not update the agreement" }, 500);
  }
}
