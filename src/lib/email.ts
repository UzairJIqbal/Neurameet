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
// Tasdeeq, Verified Minutes (spec 0003, AC-17). These emails carry only the
// title, deadline, status text, hash, and links, never the minutes text.

export const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const appLink = (path: string): string =>
  `${process.env.NEXT_PUBLIC_APP_URL ?? ""}${path}`;

async function sendTasdeeqEmail(
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[tasdeeq] RESEND_API_KEY is not set, skipping email");
    return false;
  }
  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM ?? "onboarding@resend.dev",
        to,
        subject,
        html,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[tasdeeq] email failed (${res.status}): ${detail}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(
      "[tasdeeq] email failed:",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

const button = (link: string, label: string): string => `
  <p>
    <a href="${link}"
       style="display: inline-block; padding: 10px 16px; background: #4f46e5; color: #ffffff; border-radius: 8px; text-decoration: none;">
      ${label}
    </a>
  </p>
  <p style="color: #888; font-size: 12px;">Or open: ${link}</p>`;

export type ReviewOpenEmailInput = {
  to: string;
  meetingTitle: string;
  meetingId: string;
  deadlineText: string;
};

/** "Review open" to an attester. Never throws. */
export function sendReviewOpenEmail(
  input: ReviewOpenEmailInput,
): Promise<boolean> {
  const link = appLink(`/meeting-intelligence/${input.meetingId}`);
  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #1a1a1a;">Please review the minutes</h2>
      <p style="color: #444;">
        The minutes of <strong>${escapeHtml(input.meetingTitle)}</strong> are open for review.
        Confirm the lines that are yours, correct them, or record your view.
      </p>
      <p style="color: #444;">Deadline: <strong>${escapeHtml(input.deadlineText)}</strong></p>
      ${button(link, "Open the Minutes tab")}
    </div>`;
  return sendTasdeeqEmail(input.to, "Minutes review open", html);
}

export type MinutesSealedEmailInput = {
  to: string;
  meetingTitle: string;
  statusText: string;
  hash: string;
  verifyUrl: string;
};

/** "Minutes sealed" to an attester, with the hash to keep. Never throws. */
export function sendMinutesSealedEmail(
  input: MinutesSealedEmailInput,
): Promise<boolean> {
  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #1a1a1a;">Minutes sealed</h2>
      <p style="color: #444;">
        The minutes of <strong>${escapeHtml(input.meetingTitle)}</strong> are sealed.
        ${escapeHtml(input.statusText)}
      </p>
      <p style="color: #444;">Keep this fingerprint. It lets you check later that nothing changed:</p>
      <p style="font-family: monospace; font-size: 12px; word-break: break-all; color: #1a1a1a;">${escapeHtml(input.hash)}</p>
      ${button(input.verifyUrl, "Verify the minutes")}
    </div>`;
  return sendTasdeeqEmail(input.to, "Minutes sealed", html);
}

/** The public verify page link for the emails and the PDF. */
export const verifyUrlFor = (sealId: string): string =>
  appLink(`/minutes/verify/${sealId}`);

// ---------------------------------------------------------------------------
// W2 project invites (spec 0004-invitations, AC-15). Sent only from a verified
// workspace sender; there is no fallback to the Resend test sender, which can
// only reach the account owner. The link is the secret: it is never logged.

export type ProjectInviteEmailInput = {
  to: string;
  projectName: string;
  inviterName: string;
  roleLabel: string;
  link: string;
};

export const workspaceEmailConfigured = (): boolean =>
  Boolean(process.env.RESEND_API_KEY && process.env.RESEND_WORKSPACE_FROM);

/** Invite email with the join link. Never throws; false when not sent. */
export async function sendProjectInviteEmail(
  input: ProjectInviteEmailInput,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_WORKSPACE_FROM;
  if (!apiKey || !from) return false;

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #1a1a1a;">You're invited to ${escapeHtml(input.projectName)}</h2>
      <p style="color: #444;">
        ${escapeHtml(input.inviterName)} invited you to join
        <strong>${escapeHtml(input.projectName)}</strong> on NeuraMeet as
        <strong>${escapeHtml(input.roleLabel)}</strong>.
      </p>
      <p style="color: #444;">The invite works for 7 days, only for this email address.</p>
      ${button(input.link, "Join the project")}
    </div>`;
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
        subject: `Invite to ${input.projectName} on NeuraMeet`,
        html,
      }),
    });
    if (!res.ok) {
      console.error(`[invitations] invite email failed (${res.status})`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(
      "[invitations] invite email failed:",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

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
