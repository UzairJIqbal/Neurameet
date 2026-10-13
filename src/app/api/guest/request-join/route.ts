import { NextRequest, NextResponse } from "next/server";
// Imports `@stream-io/video-client` (not `@stream-io/node-sdk`) because
// `createGuestUser` is a `StreamVideoClient` method; this differs from
// src/actions/stream.actions.ts intentionally (G0 §4.5.1).
import { StreamVideoClient } from "@stream-io/video-client";
import { StreamClient } from "@stream-io/node-sdk"; // only for the call-event emit
import { createPending, resolveMint, rejectMint, admit } from "@/lib/guest-store";
import { supabaseServer } from "@/lib/supabase-server";
import { v4 as uuidv4 } from "uuid"; // request_nonce from the lobby; route validates/replaces if missing

const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY!;
const secret = process.env.STREAM_SECRET_KEY!;

export async function POST(req: NextRequest) {
  const { meetingId, name, email, request_nonce } = await req.json();

  // validation
  if (!meetingId || !name || name.length < 2 || name.length > 100) {
    return NextResponse.json({ error: "meetingId and a 2–100 char name are required" }, { status: 400 });
  }
  if (email && !/^[^\s@]+@[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "invalid email" }, { status: 400 });
  }
  // request_nonce is the dedup key (bug #2 fix): a missing/malformed nonce is
  // treated as a brand-new request so the lobby always gets a deterministic
  // token back to reuse on retry.
  const nonce = typeof request_nonce === "string" && request_nonce.length > 0 ? request_nonce : uuidv4();

  // G3: read the per-meeting admission mode to decide short-circuit vs poll.
  // Fail-safe: if the meetings row doesn't exist yet (lazy creation per B2 — the
  // row is only created at first attendance event or transcript upload), the route
  // defaults to 'approval' (safe/closed). Never fail-open.
  const supabase = supabaseServer();
  const { data: meetingRow } = await supabase
    .from("meetings")
    .select("guest_admission_mode")
    .eq("stream_call_id", meetingId)
    .maybeSingle();
  const mode = meetingRow?.guest_admission_mode ?? "approval";

  // 1. Idempotency check FIRST (G0 §4.4.3 / bug #2 / concurrency fix):
  //    createPending returns the SAME `mintPromise` for concurrent POSTs with the
  //    same meeting_id + request_nonce. The promise cache lives in the route closure.
  //    isNew === true  => this caller is the FIRST for this nonce (must mint).
  //    isNew === false => a concurrent or prior POST owns the mint; await its promise.
  const { guest, isNew, mintPromise } = await createPending({
    meeting_id: meetingId,
    request_nonce: nonce,
    name,
    email,
  });

  if (isNew) {
    // 2. Mint a NEW Stream guest token (server-only; apiKey/secret never reach the browser).
    //    This is the ONLY createGuestUser call for this nonce — concurrent awaiters
    //    of mintPromise block here until it settles (resolve or reject).
    const videoClient = new StreamVideoClient({ apiKey });
    let created;
    try {
      created = await videoClient.createGuestUser({
        user: { name, id: `guest-${crypto.randomUUID().slice(0, 8)}` },
      });
    } catch (e) {
      // On mint failure: reject the shared promise so reuse-path awaiters surface the
      // error instead of hanging forever, then clean up the DB entry so a retry
      // can start fresh with a new mint.
      await rejectMint(guest.guest_token);
      console.error("[guest/request-join] createGuestUser failed:", e);
      return NextResponse.json({ error: "failed to mint guest token" }, { status: 502 });
    }

    // Settle the shared promise + write credentials to DB (visible to all awaiters
    // via GET /api/guest/status polling).
    const mint = { stream_user_id: created.user.id, access_token: created.access_token };
    await resolveMint(guest.guest_token, mint);

    // G3: open-mode short-circuit — admit the guest immediately in the store so
    // getStatus returns 'admitted' on the first poll. Skip the sendCallEvent emit
    // (no owner notification needed — the guest joins directly). The guest still
    // needs the minted Stream credentials to connect, so we still mint above.
    // In approval mode (default): emit guest.request_join to an online owner so
    // they get the G2 toast. Best-effort — no-op if owner not in-call.
    if (mode === "approval") {
      try {
        const nodeClient = new StreamClient(apiKey, secret);
        await nodeClient.video.sendCallEvent({
          type: "default",
          id: meetingId,
          user_id: created.user.id, // required for server-side auth — attributes the event sender
          custom: {
            event: "guest.request_join",
            guest_token: guest.guest_token,
            guest_name: name,
            guest_email: email ?? null,
            stream_user_id: created.user.id,
          },
        });
      } catch (e) {
        // owner not present / call unknown — guest falls back to polling. Log, don't crash.
        console.error("[guest/request-join] emit failed (poll-only fallback):", e);
      }
    } else {
      // open mode: admit immediately so the guest's poll sees 'admitted' on first check.
      // No updateCallMembers here — the guest's Stream token (from createGuestUser)
      // already grants authenticated join access. Membership roster changes would
      // leave stale rows in the members collection when the guest abandons before
      // actually calling call.join() (e.g. page refresh in the lobby). The guest's
      // own call.join({ create: false }) in the guest page is what registers them
      // as a real SFU participant — not a server-side membership grant.
      await admit(guest.guest_token);
    }

    return NextResponse.json({
      access_token: created.access_token,
      user: created.user,
      guest_token: guest.guest_token,
      waiting: mode === "approval",
    });
  }

  // Reuse path: isNew === false means another request owns the mint for this nonce.
  // AWAIT the shared mintPromise — this is the concurrency fix. We do NOT read
  // guest.mint directly (it may still be null if the first request is mid-await on
  // createGuestUser). mintPromise resolves to { stream_user_id, access_token } once
  // the first request calls resolveMint after createGuestUser completes. Two rapid
  // duplicate POSTs with the same nonce therefore both resolve to the SAME non-empty
  // access_token — they share exactly one createGuestUser call and one Stream guest.
  // TIMEOUT GUARD: if the first-caller's createGuestUser stalls (e.g. Stream API
  // hiccup), we don't hang the duplicate request forever — race against 8s and
  // return 504. We do NOT touch the store on timeout: the original mint may still
  // complete and resolveMint will settle the promise for any future callers with
  // the same nonce.
  const MINT_TIMEOUT_MS = 8000;
  try {
    const mint = await Promise.race([
      mintPromise,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("mint timeout")), MINT_TIMEOUT_MS)),
    ]);
    // mint may be null (sentinel for reuse-path callers that don't own the mint).
    // In that case the route caller should poll GET /api/guest/status instead.
    if (!mint) {
      return NextResponse.json(
        { error: "guest token not ready yet — please try again" },
        { status: 504 },
      );
    }
    return NextResponse.json({
      access_token: mint.access_token,
      user: { id: mint.stream_user_id, name: guest.name },
      guest_token: guest.guest_token,
      waiting: mode === "approval",
    });
  } catch {
    // Either a timeout or the first-caller's createGuestUser rejected (rejectMint).
    // Surface 504/502 so the lobby can show a retry prompt; the store entry + promise
    // are left intact (resolveMint/rejectMint already handled cleanup on rejection).
    return NextResponse.json(
      { error: "guest token not ready yet — please try again" },
      { status: 504 },
    );
  }
}
