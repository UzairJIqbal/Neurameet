// Supabase-backed store for pending guest join requests.
// Replaces G0 §4.4.2/§4.4.5 in-memory Map — Vercel serverless instances do
// NOT share module-level Map state across invocations, which caused 403
// when instance A created a guest and instance B served the admit route.
//
// Persistence rules:
//   TTL (10 min) -> expires_at column.
//   Dedup nonce  -> INSERT ... ON CONFLICT DO NOTHING (atomic single source of truth).
//   Mint race    -> Promise stays in the route closure, not the store. The store
//                   writes to DB; the route resolves locally (see §4.1 rationale).

import { supabaseServer } from "@/lib/supabase-server";

type GuestStatus = "pending" | "minting" | "admitted" | "denied" | "expired";

// GuestInfo: the full row returned by createPending. Mirrors the DB shape so
// the route has everything it needs without a second read.
type GuestInfo = {
  guest_token: string;
  meeting_id: string;
  request_nonce: string;
  name: string;
  email?: string | null;
  status: GuestStatus;
  stream_user_id: string | null; // null until resolveMint
  access_token: string | null; // null until resolveMint
  minted_at: string | null;
  created_at: string;
  expires_at: string;
};

// Mint output returned by createGuestUser — written by resolveMint, read via
// the mintPromise. The reuse-path caller gets Promise.resolve(null) as a
// sentinel because it polls GET /api/guest/status instead.
type GuestMint = { stream_user_id: string; access_token: string };

const TTL_MS = 10 * 60 * 1000; // 10-minute TTL, matches G0

function nowISO(): string {
  return new Date().toISOString();
}

function expiresAtISO(): string {
  return new Date(Date.now() + TTL_MS).toISOString();
}

// createPending: idempotency-first. The isNew caller owns the mint; all others
// share the same nonce via INSERT ... ON CONFLICT DO NOTHING.
//
// Returns { guest, isNew, mintPromise }:
//   - isNew=true  : this caller won the INSERT (must call createGuestUser).
//                   mintPromise resolves once resolveMint is called by the
//                   route's createGuestUser-then-resolve sequence.
//   - isNew=false : a concurrent caller owns this nonce. mintPromise is a
//                   sentinel Promise.resolve(null) — the reuse-path caller
//                   awaits it (no-op) then polls GET /api/guest/status to
//                   learn when minting completed. The Promise never crosses
//                   instance boundaries because it stays in the route closure.
export async function createPending(g: {
  meeting_id: string;
  request_nonce: string;
  name: string;
  email?: string;
}): Promise<{ guest: GuestInfo; isNew: boolean; mintPromise: Promise<GuestMint | null> }> {
  const supabase = supabaseServer();

  // Atomic INSERT ... ON CONFLICT DO NOTHING on the partial unique index
  // (meeting_id, request_nonce) WHERE status IN ('pending','minting').
  // Only one INSERT succeeds -> only that caller is isNew.
  const { data: inserted, error: insertError } = await supabase
    .from("guest_requests")
    .insert({
      guest_token: `gt_${crypto.randomUUID()}`,
      meeting_id: g.meeting_id,
      request_nonce: g.request_nonce,
      name: g.name,
      email: g.email ?? null,
      status: "pending",
      expires_at: expiresAtISO(),
    })
    .select()
    .single();

  if (inserted) {
    // This caller is the isNew owner — create a promise that the route will
    // settle via resolveMint/rejectMint. The promise itself lives in the route
    // closure; the store just writes the credentials to DB.
    let resolveMint!: (v: GuestMint) => void;
    let rejectMintInner!: (e: unknown) => void;
    const mintPromise = new Promise<GuestMint>((resolve, reject) => {
      resolveMint = resolve;
      rejectMintInner = reject;
    });

    // Stash settle fns as non-enumerable so they don't leak into responses.
    Object.defineProperties(mintPromise, {
      __resolve: { value: resolveMint, enumerable: false },
      __reject: { value: rejectMintInner, enumerable: false },
    });

    // Attach a typed handle so resolveMint/rejectMint can settle by token.
    (mintPromise as Promise<GuestMint> & {
      __token?: string;
    }).__token = inserted.guest_token;

    return {
      guest: mapRowToGuestInfo(inserted),
      isNew: true,
      mintPromise: mintPromise as Promise<GuestMint | null>,
    };
  }

  // INSERT failed — either a concurrent insert owns this nonce (the common
  // case) or there's a real error. Distinguish via a lookup by nonce.
  if (insertError) {
    // If the conflict is on the unique index, a concurrent caller owns this nonce.
    // Check if it was a 23505 unique violation (conflict on the partial index).
    const isConflict = (insertError as { code?: string })?.code === "23505";
    if (isConflict) {
      // Reuse path: fetch the existing pending/minting row owned by another caller.
      const { data: existing, error: findError } = await supabase
        .from("guest_requests")
        .select()
        .eq("meeting_id", g.meeting_id)
        .eq("request_nonce", g.request_nonce)
        .in("status", ["pending", "minting"])
        .maybeSingle();

      if (existing && !findError) {
        // Sentinel: the reuse-path caller polls GET /api/guest/status instead.
        return {
          guest: mapRowToGuestInfo(existing),
          isNew: false,
          mintPromise: Promise.resolve(null),
        };
      }
    }
    // For non-conflict errors, throw so the route surfaces a 500.
    throw insertError;
  }

  // Fallback (shouldn't reach here — INSERT either returns data or error).
  throw new Error("createPending: INSERT returned no data and no error");
}

// resolveMint: called by the isNew route caller AFTER createGuestUser resolves.
// Writes the Stream credentials to the DB row. The mintPromise is settled
// locally in the route closure (see request-join/route.ts).
export async function resolveMint(
  guest_token: string,
  mint: GuestMint,
): Promise<void> {
  const supabase = supabaseServer();
  await supabase
    .from("guest_requests")
    .update({
      stream_user_id: mint.stream_user_id,
      access_token: mint.access_token,
      minted_at: nowISO(),
    })
    .eq("guest_token", guest_token);
}

// rejectMint: called by the isNew route caller when createGuestUser fails.
// Deletes the row so a retry can INSERT fresh (the partial unique index only
// covers pending/minting, so deletion releases the nonce for reuse).
export async function rejectMint(guest_token: string): Promise<void> {
  const supabase = supabaseServer();
  await supabase.from("guest_requests").delete().eq("guest_token", guest_token);
}

// getStatus: returns the current status, checking expiry server-side.
// 'expired' is computed via expires_at < now(); 'not_found' means no row.
export async function getStatus(
  guest_token: string,
): Promise<GuestStatus | "not_found"> {
  await cleanup();
  const supabase = supabaseServer();
  const { data: row, error } = await supabase
    .from("guest_requests")
    .select("status, expires_at")
    .eq("guest_token", guest_token)
    .maybeSingle();

  if (error || !row) return "not_found";

  // Server-side expiry check: a pending row past its TTL is expired.
  if (row.status === "pending" && new Date(row.expires_at) < new Date()) {
    return "expired";
  }

  return row.status as GuestStatus;
}

// getGuest: returns a sanitized snapshot for admit/deny route cross-checks.
// Only exposes meeting_id, name, status, stream_user_id — NEVER access_token.
export async function getGuest(
  guest_token: string,
): Promise<{
  meeting_id: string;
  name: string;
  status: GuestStatus;
  stream_user_id: string | null;
} | undefined> {
  await cleanup();
  const supabase = supabaseServer();
  const { data: row, error } = await supabase
    .from("guest_requests")
    .select("meeting_id, name, status, stream_user_id")
    .eq("guest_token", guest_token)
    .maybeSingle();

  if (error || !row) return undefined;

  return {
    meeting_id: row.meeting_id,
    name: row.name,
    status: row.status as GuestStatus,
    stream_user_id: row.stream_user_id,
  };
}

// admit: atomic check-and-set. UPDATE ... WHERE status='pending'.
// No rows affected => the guest was already admitted/denied/expired OR is still
// minting (shouldn't happen in approval mode — mint is synchronous in the route
// before admit is callable). Returns false → route returns 409.
export async function admit(guest_token: string): Promise<boolean> {
  const supabase = supabaseServer();
  const { data: rows } = await supabase
    .from("guest_requests")
    .update({ status: "admitted", minted_at: nowISO() })
    .eq("guest_token", guest_token)
    .eq("status", "pending")
    .select();

  // select() returns an array; empty array means no row matched the WHERE.
  return !!(rows && rows.length > 0);
}

// deny: same atomic pattern as admit. Returns false if already resolved.
export async function deny(guest_token: string): Promise<boolean> {
  const supabase = supabaseServer();
  const { data: rows } = await supabase
    .from("guest_requests")
    .update({ status: "denied" })
    .eq("guest_token", guest_token)
    .eq("status", "pending")
    .select();

  return !!(rows && rows.length > 0);
}

// cleanup: evict expired pending rows AND stale admitted rows (guests who were
// admitted by the owner but never actually joined the call — e.g. page refresh
// in the lobby, abandoned browser tab). For admitted rows we use minted_at (the
// timestamp set when admit() ran) as the staleness marker, since expires_at only
// gates the pending→expired transition. A 2× TTL window gives enough headroom for
// slow networks / browser wake-from-sleep while keeping the table tidy.
export async function cleanup(): Promise<void> {
  const supabase = supabaseServer();
  const now = nowISO();
  const staleAdmitted = new Date(Date.now() - 2 * TTL_MS).toISOString();

  // Evict expired pending rows (TTL on expires_at).
  await supabase
    .from("guest_requests")
    .delete()
    .lt("expires_at", now)
    .eq("status", "pending");

  // Evict admitted rows that never resulted in a call.join() (stale ghost entries).
  await supabase
    .from("guest_requests")
    .delete()
    .lt("minted_at", staleAdmitted)
    .eq("status", "admitted");
}

// expireByMeetingId: bulk-expire all pending guests for a meeting.
// Called when the call ends (owner leaves) so that any still-pending
// guests are marked expired and their polling loop transitions to
// "expired" instead of waiting forever. Returns the count of rows
// affected. Pure Supabase UPDATE — no in-memory component (the
// store is fully DB-backed across Vercel serverless instances).
export async function expireByMeetingId(meetingId: string): Promise<number> {
  const supabase = supabaseServer();
  const { data: rows } = await supabase
    .from("guest_requests")
    .update({ status: "expired" })
    .eq("meeting_id", meetingId)
    .eq("status", "pending")
    .select();

  return rows?.length ?? 0;
}

// getAllPending: returns all non-expired pending guests for a meeting_id.
// Queries the DB directly — no instance masking (the G0 in-memory store
// returned 200 with an empty array because getAllPending only saw its
// own instance's Map; the DB-backed version sees all rows).
export async function getAllPending(meetingId: string): Promise<
  Array<{
    guest_token: string;
    name: string;
    email?: string | null;
    created_at: string;
  }>
> {
  await cleanup();
  const supabase = supabaseServer();
  const { data: rows } = await supabase
    .from("guest_requests")
    .select("guest_token, name, email, created_at")
    .eq("meeting_id", meetingId)
    .eq("status", "pending")
    .gt("expires_at", nowISO());

  return rows ?? [];
}

// Testing-only: clears all guest_requests rows so tests start clean.
export async function _reset(): Promise<void> {
  const supabase = supabaseServer();
  await supabase.from("guest_requests").delete().neq("guest_token", "__sentinel__");
}

// Internal: map a DB row to the GuestInfo type returned by createPending.
function mapRowToGuestInfo(row: Record<string, unknown>): GuestInfo {
  return {
    guest_token: row.guest_token as string,
    meeting_id: row.meeting_id as string,
    request_nonce: row.request_nonce as string,
    name: row.name as string,
    email: row.email as string | null,
    status: row.status as GuestStatus,
    stream_user_id: row.stream_user_id as string | null,
    access_token: row.access_token as string | null,
    minted_at: row.minted_at as string | null,
    created_at: row.created_at as string,
    expires_at: row.expires_at as string,
  };
}
