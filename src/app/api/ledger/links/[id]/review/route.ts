import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseServer } from "@/lib/supabase-server";
import { recomputeLedgerItemStatus } from "@/agent/ledger";
import type {
  LedgerLinkState,
  LedgerReviewDecision,
} from "@/lib/meeting-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DECISIONS: LedgerReviewDecision[] = ["confirm", "reject", "reset"];
const NOT_FOUND = { error: "Link not found" };

function nextState(decision: LedgerReviewDecision): {
  state: LedgerLinkState;
  decided_at: string | null;
} {
  if (decision === "reset") return { state: "suggested", decided_at: null };
  const decidedAt = new Date().toISOString();
  return decision === "confirm"
    ? { state: "confirmed", decided_at: decidedAt }
    : { state: "rejected", decided_at: decidedAt };
}

async function readDecision(
  request: Request,
): Promise<LedgerReviewDecision | null> {
  try {
    const body = (await request.json()) as { decision?: unknown };
    const decision = body?.decision;
    return DECISIONS.find((d) => d === decision) ?? null;
  } catch {
    return null;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const decision = await readDecision(request);
  if (!decision) {
    return NextResponse.json(
      { error: "decision must be confirm, reject, or reset" },
      { status: 400 },
    );
  }
  if (!UUID_RE.test(id)) {
    return NextResponse.json(NOT_FOUND, { status: 404 });
  }

  try {
    const supabase = supabaseServer();

    const { data: link, error: linkErr } = await supabase
      .from("ledger_links")
      .select("id, item_id")
      .eq("id", id)
      .maybeSingle();
    if (linkErr) throw linkErr;
    if (!link) return NextResponse.json(NOT_FOUND, { status: 404 });
    const itemId = (link as { item_id: string }).item_id;

    const { data: item, error: itemErr } = await supabase
      .from("ledger_items")
      .select("meeting_id")
      .eq("id", itemId)
      .maybeSingle();
    if (itemErr) throw itemErr;
    if (!item) return NextResponse.json(NOT_FOUND, { status: 404 });

    const { data: meeting, error: meetingErr } = await supabase
      .from("meetings")
      .select("id")
      .eq("id", (item as { meeting_id: string }).meeting_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (meetingErr) throw meetingErr;
    if (!meeting) return NextResponse.json(NOT_FOUND, { status: 404 });

    const update = nextState(decision);
    const { error: updateErr } = await supabase
      .from("ledger_links")
      .update(update)
      .eq("id", id);
    if (updateErr) throw updateErr;

    await recomputeLedgerItemStatus(supabase, itemId);
    return NextResponse.json({ id, state: update.state });
  } catch (err) {
    console.error("[ledger] review failed", { linkId: id, err });
    return NextResponse.json(
      { error: "Failed to save review" },
      { status: 500 },
    );
  }
}
