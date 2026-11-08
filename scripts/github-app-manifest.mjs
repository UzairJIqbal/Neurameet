// One click GitHub App setup for local testing, using GitHub's manifest flow.
// Usage: node scripts/github-app-manifest.mjs [publicBaseUrl]
// Opens a local page, you press one button on GitHub, and the credentials are
// written to scripts/.github-app-credentials.env (git ignored). Copy them into
// .env.local yourself. No secret is printed to the terminal.
import http from "node:http";
import { writeFileSync, chmodSync } from "node:fs";
import { execFile } from "node:child_process";

const PORT = 3456;
const APP_URL = "http://localhost:3000";
const hookBase = process.argv[2] ?? APP_URL;
const OUT = new URL("./.github-app-credentials.env", import.meta.url);

const manifest = {
  name: `NeuraMeet local ${Math.random().toString(36).slice(2, 7)}`,
  url: APP_URL,
  redirect_url: `http://localhost:${PORT}/created`,
  callback_urls: [`${APP_URL}/api/github/callback`],
  setup_url: `${APP_URL}/api/github/callback`,
  request_oauth_on_install: true,
  public: false,
  default_permissions: { pull_requests: "read", contents: "read", metadata: "read" },
};
// GitHub rejects a localhost hook url, so the webhook is only declared with a public base url.
if (hookBase !== APP_URL) {
  manifest.hook_attributes = { url: `${hookBase}/api/github/webhook`, active: true };
  manifest.default_events = ["pull_request"];
}

const page = `<!doctype html><meta charset=utf-8><title>Create app</title>
<form id=f method=post action="https://github.com/settings/apps/new">
<input type=hidden name=manifest value='${JSON.stringify(manifest).replace(/'/g, "&#39;")}'>
<button>Continue to GitHub</button></form>
<script>document.getElementById("f").submit()</script>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === "/") {
    res.setHeader("content-type", "text/html").end(page);
    return;
  }
  if (url.pathname === "/created") {
    const r = await fetch(
      `https://api.github.com/app-manifests/${url.searchParams.get("code")}/conversions`,
      { method: "POST", headers: { accept: "application/vnd.github+json" } },
    );
    const app = await r.json();
    if (!r.ok) {
      res.end(`GitHub refused: ${r.status}`);
      return;
    }
    const lines = [
      `GITHUB_APP_ID=${app.id}`,
      `GITHUB_APP_SLUG=${app.slug}`,
      `NEXT_PUBLIC_GITHUB_APP_SLUG=${app.slug}`,
      `GITHUB_APP_CLIENT_ID=${app.client_id}`,
      `GITHUB_APP_CLIENT_SECRET=${app.client_secret}`,
      `GITHUB_WEBHOOK_SECRET=${app.webhook_secret}`,
      `GITHUB_APP_PRIVATE_KEY="${app.pem.replace(/\n/g, "\\n")}"`,
    ];
    writeFileSync(OUT, `${lines.join("\n")}\n`);
    chmodSync(OUT, 0o600);
    res.end("App created. Credentials saved. You can close this tab.");
    console.log(`Created ${app.slug}. Credentials in scripts/.github-app-credentials.env`);
    setTimeout(() => process.exit(0), 500);
  }
});
server.listen(PORT, () => {
  console.log(`Opening http://localhost:${PORT}`);
  execFile("open", [`http://localhost:${PORT}`]);
});
