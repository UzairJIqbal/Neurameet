import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveLiveCaller } from "@/lib/live-ledger-auth";
import { sendLiveLedgerEvent } from "@/lib/live-ledger-events";
import { tallyVotes } from "@/lib/live-ledger-state";
import {
  isAgreementVote,
  type AgreementVote,
  type VoteResponse,
} from "@/lib/live-ledger-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface VoteBody {
  callId: string;
  agreementId: string;
  vote: AgreementVote;
  guestStreamToken: string | null;
}

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status });

function parseBody(raw: unknown): VoteBody | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.callId !== "string" || !b.callId) return null;
  if (typeof b.agreementId !== "string" || !b.agreementId) return null;
  if (!isAgreementVote(b.vote)) return null;
  return {
    callId: b.callId,
    agreementId: b.agreementId,
    vote: b.vote,
    guestStreamToken:
      typeof b.guestStreamToken === "string" ? b.guestStreamToken : null,
  };
}

/**
 * Any participant: one vote per voter on the open agreement, changeable while
 * it is open (spec 0002 AC-10). The voter id comes from Clerk or a verified
 * Stream guest token, never the body.
 */
export async function POST(request: Request) {
  let body: VoteBody | null;
  try {
    body = parseBody(await request.json());
  } catch {
    body = null;
  }
  if (!body) {
    return json(
      { error: "callId, agreementId and vote (agree or not_yet) are required" },
      400,
    );
  }

  const { userId } = await auth();
  try {
    const supabase = supabaseServer();
    const caller = await resolveLiveCaller(supabase, {
      callId: body.callId,
      authUserId: userId,
      guestStreamToken: body.guestStreamToken,
    });
    if (!caller) return json({ error: "Not a participant" }, 403);

    const { data: rowData, error: rowErr } = await supabase
      .from("ledger_agreements")
      .select("id, status")
      .eq("id", body.agreementId)
      .eq("meeting_id", caller.meeting.id)
      .maybeSingle();
    if (rowErr) throw rowErr;
    const row = rowData as { id: string; status: "open" | "closed" } | null;
    if (!row) return json({ error: "Agreement not found" }, 404);
    if (row.status !== "open") {
      return json({ error: "Voting has closed" }, 409);
    }

    const { error: voteErr } = await supabase
      .from("ledger_agreement_votes")
      .upsert(
        {
          agreement_id: body.agreementId,
          voter_id: caller.callerId,
          vote: body.vote,
          voted_at: new Date().toISOString(),
        },
        { onConflict: "agreement_id,voter_id" },
      );
    if (voteErr) throw voteErr;

    const { tally } = await tallyVotes(supabase, body.agreementId);
    // Best effort: the vote is stored either way, and the next tally or a
    // late join read brings everyone up to date.
    await sendLiveLedgerEvent(body.callId, caller.meeting.ownerId, {
      event: "ledger.agreement_tally",
      agreementId: body.agreementId,
      agree: tally.agree,
      notYet: tally.notYet,
    });
    return json({ ...tally, myVote: body.vote } satisfies VoteResponse);
  } catch (err) {
    console.error("[live-ledger] vote failed", {
      callId: body.callId,
      err,
    });
    return json({ error: "Could not save your vote" }, 500);
  }
}
