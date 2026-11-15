import { after, NextResponse } from "next/server";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";
import { StreamClient } from "@stream-io/node-sdk";
import { supabaseServer } from "@/lib/supabase-server";
import { runServerPipeline } from "@/agent/meeting-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The server pipeline runs after the 200 inside this function's lifetime.
export const maxDuration = 300;

let loggedFirstBody = false;

// HMAC is over the exact bytes Stream signed; a proxy may compress in transit.
function decodeBody(buf: Buffer, encoding: string | null): string {
  const raw =
    encoding === "gzip"
      ? gunzipSync(buf)
      : encoding === "br"
        ? brotliDecompressSync(buf)
        : encoding === "deflate"
          ? inflateSync(buf)
          : buf;
  return raw.toString("utf8");
}

type RecordingReadyBody = {
  type?: string;
  call_cid?: string;
  call_recording?: { filename?: string; session_id?: string };
};

/**
 * Stream webhook (spec 0005, AC-6). Public: the `x-signature` HMAC is the
 * authentication (the Stream skill says not to also gate on `x-api-key`).
 * Only `call.recording_ready` starts work, and only for a saved meeting.
 */
export async function POST(req: Request) {
  const startedAt = Date.now();
  const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
  const secret = process.env.STREAM_SECRET_KEY;
  if (!apiKey || !secret) {
    console.error("[stream/webhook] Stream credentials are missing");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  let raw: string;
  try {
    raw = decodeBody(
      Buffer.from(await req.arrayBuffer()),
      req.headers.get("content-encoding"),
    );
  } catch {
    return NextResponse.json({ error: "Bad body" }, { status: 400 });
  }

  const signature = req.headers.get("x-signature") ?? "";
  let valid = false;
  try {
    valid = new StreamClient(apiKey, secret).verifyWebhook(raw, signature);
  } catch {
    valid = false;
  }
  if (!valid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RecordingReadyBody;
  try {
    body = JSON.parse(raw) as RecordingReadyBody;
  } catch {
    return NextResponse.json({ error: "Bad body" }, { status: 400 });
  }
  if (body.type !== "call.recording_ready") {
    return NextResponse.json({ ok: true });
  }

  // The installed SDK types carry no recording type on this event, so the
  // first real body is logged once to confirm the shape (spec follow up).
  if (!loggedFirstBody) {
    loggedFirstBody = true;
    console.log("[stream/webhook] first recording_ready body:", raw);
  }

  // call_cid is "<type>:<id>".
  const callId = body.call_cid?.split(":").slice(1).join(":") ?? "";
  if (!callId) return NextResponse.json({ ok: true });

  const supabase = supabaseServer();
  const { data: meeting, error } = await supabase
    .from("meetings")
    .select("id")
    .eq("stream_call_id", callId)
    .maybeSingle();
  if (error) {
    console.error("[stream/webhook] meeting lookup failed:", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
  if (!meeting) return NextResponse.json({ ok: true });

  const meetingId = meeting.id as string;
  after(async () => {
    const outcome = await runServerPipeline(supabase, meetingId, {
      source: "webhook",
      startedAt,
    });
    console.log("[stream/webhook] server run", { meetingId, outcome });
  });
  return NextResponse.json({ ok: true });
}
