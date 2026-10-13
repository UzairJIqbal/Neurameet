// Server-only: verifies a Stream user token (e.g. a guest's createGuestUser
// access_token) by asking Stream itself, so we never trust a client-supplied
// user id. Guest tokens are minted by Stream, not by our secret, so a local
// HMAC check is not reliable; Stream rejects forged or expired tokens with 401.

const STREAM_VIDEO_BASE = "https://video.stream-io-api.com/video";

// Reads the user_id claim without verifying the signature. Only used after
// Stream has accepted the token.
function readUserIdClaim(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    ) as { user_id?: unknown };
    return typeof payload.user_id === "string" && payload.user_id
      ? payload.user_id
      : null;
  } catch {
    return null;
  }
}

// Returns the token's Stream user id when Stream accepts it for reading this
// call (any participant can), otherwise null.
export async function verifyStreamUserToken(
  token: string,
  callId: string,
): Promise<string | null> {
  const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
  const userId = readUserIdClaim(token);
  if (!apiKey || !userId) return null;

  try {
    const url = `${STREAM_VIDEO_BASE}/call/default/${encodeURIComponent(callId)}?api_key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      headers: { Authorization: token, "stream-auth-type": "jwt" },
      cache: "no-store",
    });
    return res.ok ? userId : null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("verifyStreamUserToken failed:", msg);
    return null;
  }
}
