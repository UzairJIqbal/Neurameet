import "server-only";

// Server-only email delivery via Resend's free-tier REST API.
// Approved zero-cost tool (Step A2 precedent in AGENTS.md): no payment method
// required, free tier only. API key is a server env var — never reaches the browser.

const RESEND_API_URL = "https://api.resend.com/emails";

export type MeetingReadyEmailInput = {
  to: string;
  meetingTitle: string;
  meetingId: string;
};

function buildHtml({
  meetingTitle,
  meetingId,
}: MeetingReadyEmailInput): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const link = base
    ? `${base}/meeting-intelligence/${meetingId}`
    : `/meeting-intelligence/${meetingId}`;
  const safeTitle = meetingTitle.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #1a1a1a;">Your NeuraMeet summary is ready</h2>
      <p style="color: #444;">
        The meeting <strong>${safeTitle}</strong> has finished processing.
        Your AI-generated summary, action items, and category are ready to review.
      </p>
      <p>
        <a href="${link}"
           style="display: inline-block; padding: 10px 16px; background: #4f46e5; color: #ffffff; border-radius: 8px; text-decoration: none;">
          View summary
        </a>
      </p>
      <p style="color: #888; font-size: 12px;">Or open: ${link}</p>
    </div>
  `;
}

/**
 * Send the "summary ready" notification email. Non-fatal: any failure is logged
 * and returns false without throwing, so it never blocks the caller's flow.
 */
export async function sendMeetingReadyEmail(
  input: MeetingReadyEmailInput,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      "[email] RESEND_API_KEY is not set — skipping meeting-ready email.",
    );
    return false;
  }

  const from = process.env.RESEND_FROM ?? "onboarding@resend.dev";

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: "Your NeuraMeet summary is ready",
        html: buildHtml(input),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[email] Resend request failed (${res.status}): ${detail}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(
      "[email] Failed to send meeting-ready email:",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

// ---------------------------------------------------------------------------
// HTML escaping for the email bodies.

export const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Workspace event emails (W8 notifications, digest) need a verified sender.
// Project invites are never emailed: the owner copies the link.

export const workspaceEmailConfigured = (): boolean =>
  Boolean(process.env.RESEND_API_KEY && process.env.RESEND_WORKSPACE_FROM);

// ---------------------------------------------------------------------------
// W8 event and digest emails (spec 0004-workspace-shell, AC-74). Same verified
// sender and no fallback, as for project invites.

/** One workspace email. Never throws; false when not sent. */
export async function sendWorkspaceEmail(
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_WORKSPACE_FROM;
  if (!apiKey || !from) return false;
  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      console.error(`[notifications] email failed (${res.status})`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(
      "[notifications] email failed:",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
