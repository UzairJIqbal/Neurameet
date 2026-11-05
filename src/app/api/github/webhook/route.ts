import { after, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { verifySignature } from "@/lib/github";
import { handleGitHubEvent, type WebhookPayload } from "@/lib/github-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY_BYTES = 1024 * 1024;
const RECLAIM_AFTER_MS = 5 * 60 * 1000;
const ERROR_MAX_CHARS = 500;

type Supabase = ReturnType<typeof supabaseServer>;

const TOO_LARGE = () =>
  NextResponse.json({ error: "Payload too large" }, { status: 413 });
const ACCEPTED = () => NextResponse.json({ ok: true }, { status: 202 });

/** True when this run owns the delivery: a new id, or one it reclaimed (AC-45). */
async function claimDelivery(
  supabase: Supabase,
  deliveryId: string,
  event: string,
  action: string | null,
): Promise<boolean> {
  const { error } = await supabase
    .from("github_deliveries")
    .insert({ delivery_id: deliveryId, event, action });
  if (!error) return true;
  if (error.code !== "23505") throw error;

  const now = Date.now();
  const staleBefore = new Date(now - RECLAIM_AFTER_MS).toISOString();
  const { data, error: reclaimError } = await supabase
    .from("github_deliveries")
    .update({
      status: "received",
      received_at: new Date(now).toISOString(),
      error: null,
    })
    .eq("delivery_id", deliveryId)
    .or(
      `status.eq.failed,and(status.eq.received,received_at.lt."${staleBefore}")`,
    )
    .select("delivery_id");
  if (reclaimError) throw reclaimError;
  return (data ?? []).length > 0;
}

async function processDelivery(
  supabase: Supabase,
  deliveryId: string,
  event: string,
  payload: WebhookPayload,
): Promise<void> {
  let status: "processed" | "ignored" | "failed";
  let failure: string | null = null;
  try {
    status = await handleGitHubEvent(supabase, event, payload);
  } catch (err) {
    status = "failed";
    failure = (err instanceof Error ? err.message : String(err)).slice(
      0,
      ERROR_MAX_CHARS,
    );
    console.error("[github] delivery failed", { deliveryId, event, err });
  }
  const { error } = await supabase
    .from("github_deliveries")
    .update({
      status,
      error: failure,
      processed_at: new Date().toISOString(),
    })
    .eq("delivery_id", deliveryId);
  if (error) {
    console.error("[github] delivery status not saved", { deliveryId, error });
  }
}

// Public, so nothing is trusted until the signature over the raw body checks out.
export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return TOO_LARGE();

  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return TOO_LARGE();

  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }

  const deliveryId = request.headers.get("x-github-delivery");
  const event = request.headers.get("x-github-event");
  if (!deliveryId || !event) {
    return NextResponse.json(
      { error: "Missing delivery headers" },
      { status: 400 },
    );
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(raw) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const supabase = supabaseServer();
    const won = await claimDelivery(
      supabase,
      deliveryId,
      event,
      payload.action ?? null,
    );
    if (!won) return ACCEPTED();

    after(() => processDelivery(supabase, deliveryId, event, payload));
    return ACCEPTED();
  } catch (err) {
    // A 500 shows up as a failed delivery in GitHub, so it can be redelivered.
    console.error("[github] delivery not stored", { deliveryId, err });
    return NextResponse.json(
      { error: "Failed to store the delivery" },
      { status: 500 },
    );
  }
}
