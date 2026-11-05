import "server-only";
import { createHmac, createSign, hkdfSync, timingSafeEqual } from "crypto";
import type {
  GitHubInstallationListing,
  GitHubPull,
  GitHubRepoListing,
} from "@/lib/github-types";

// GitHub calls with plain fetch and Node crypto, no Octokit (spec 0004, W5).

const API = "https://api.github.com";
const TIMEOUT_MS = 10_000;
const MAX_PAGES = 5;
const PAGE_SIZE = 100;
const STATE_TTL_MS = 10 * 60 * 1000;

const GITHUB_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

export class GitHubError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/** RS256 JWT that identifies the App itself, good for at most 10 minutes. */
export function appJwt(now: number = Date.now()): string {
  const seconds = Math.floor(now / 1000);
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const body = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    iat: seconds - 60,
    exp: seconds + 540,
    iss: requireEnv("GITHUB_APP_ID"),
  })}`;
  // Hosts often store the key's line breaks as the two characters \n.
  const key = requireEnv("GITHUB_APP_PRIVATE_KEY").replace(/\\n/g, "\n");
  const signature = createSign("RSA-SHA256")
    .update(body)
    .sign(key, "base64url");
  return `${body}.${signature}`;
}

async function ghFetch<T>(
  url: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { ...GITHUB_HEADERS, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new GitHubError(res.status, `GitHub answered ${res.status}`);
  }
  return (await res.json()) as T;
}

/** Kept in memory for the current request only. */
export async function installationToken(
  installationId: number,
): Promise<string> {
  const data = await ghFetch<{ token: string }>(
    `${API}/app/installations/${installationId}/access_tokens`,
    appJwt(),
    { method: "POST" },
  );
  return data.token;
}

/** Exchanges the callback `code`. The caller uses it once and never stores it. */
export async function userToken(code: string): Promise<string> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    cache: "no-store",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: requireEnv("GITHUB_APP_CLIENT_ID"),
      client_secret: requireEnv("GITHUB_APP_CLIENT_SECRET"),
      code,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
  };
  // A bad code still answers 200, with an error field in place of the token.
  if (!res.ok || !data.access_token) {
    throw new GitHubError(res.status, "GitHub refused the authorization code");
  }
  return data.access_token;
}

async function paged<T>(
  path: string,
  token: string,
  pick: (page: Record<string, unknown>) => T[],
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await ghFetch<Record<string, unknown>>(
      `${API}${path}?per_page=${PAGE_SIZE}&page=${page}`,
      token,
    );
    const items = pick(data);
    all.push(...items);
    if (items.length < PAGE_SIZE) break;
  }
  return all;
}

export function userInstallations(
  token: string,
): Promise<GitHubInstallationListing[]> {
  return paged(
    "/user/installations",
    token,
    (page) => (page.installations ?? []) as GitHubInstallationListing[],
  );
}

export async function installationRepos(
  installationId: number,
  token?: string,
): Promise<GitHubRepoListing[]> {
  return paged(
    "/installation/repositories",
    token ?? (await installationToken(installationId)),
    (page) => (page.repositories ?? []) as GitHubRepoListing[],
  );
}

export function recentPulls(
  fullName: string,
  token: string,
): Promise<GitHubPull[]> {
  return ghFetch<GitHubPull[]>(
    `${API}/repos/${fullName}/pulls?state=all&sort=updated&direction=desc&per_page=30`,
    token,
  );
}

export function pull(
  fullName: string,
  number: number,
  token: string,
): Promise<GitHubPull> {
  return ghFetch<GitHubPull>(`${API}/repos/${fullName}/pulls/${number}`, token);
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/** A missing secret is logged and counts as a bad signature, so it fails closed. */
export function verifySignature(
  rawBody: string,
  header: string | null,
): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[github] GITHUB_WEBHOOK_SECRET is not set");
    return false;
  }
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqual(Buffer.from(header.slice(7)), Buffer.from(expected));
}

export type InstallState = { projectId: string; userId: string; exp: number };

function stateKey(): Buffer {
  return Buffer.from(
    hkdfSync(
      "sha256",
      requireEnv("GITHUB_APP_CLIENT_SECRET"),
      "",
      "install-state",
      32,
    ),
  );
}

const signStatePayload = (payload: string): string =>
  createHmac("sha256", stateKey()).update(payload).digest("base64url");

export function signInstallState(
  projectId: string,
  userId: string,
  now: number = Date.now(),
): string {
  const state: InstallState = { projectId, userId, exp: now + STATE_TTL_MS };
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  return `${payload}.${signStatePayload(payload)}`;
}

/** Null when missing, tampered, expired, or the secret is not set. */
export function readInstallState(
  state: string | null,
  now: number = Date.now(),
): InstallState | null {
  if (!state) return null;
  const [payload, signature, extra] = state.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  try {
    const expected = Buffer.from(signStatePayload(payload));
    if (!safeEqual(Buffer.from(signature), expected)) return null;
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as InstallState;
    return parsed.exp > now ? parsed : null;
  } catch {
    return null;
  }
}

export function installUrls(
  projectId: string,
  userId: string,
): { installUrl: string; authorizeUrl: string } {
  const state = encodeURIComponent(signInstallState(projectId, userId));
  const slug = requireEnv("NEXT_PUBLIC_GITHUB_APP_SLUG");
  const clientId = requireEnv("GITHUB_APP_CLIENT_ID");
  return {
    installUrl: `https://github.com/apps/${slug}/installations/new?state=${state}`,
    authorizeUrl: `https://github.com/login/oauth/authorize?client_id=${clientId}&state=${state}`,
  };
}
