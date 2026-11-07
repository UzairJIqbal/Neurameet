"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import toast from "react-hot-toast";
import { Chrome, Github } from "lucide-react";
import { LoaderOne } from "@/components/ui/loader";
import { LoadError } from "@/components/ui/load-error";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";

type GitHubAccount = {
  connected: boolean;
  login: string | null;
  authorizeUrl: string | null;
};

type Outcome = { kind: "success" | "error"; text: string };

// What the callback's ?github= code means for the person reading it (AC-77g).
const OUTCOMES: Record<string, Outcome> = {
  connected: { kind: "success", text: "Your GitHub account is connected." },
  already_linked: {
    kind: "error",
    text: "That GitHub account is already linked to another NeuraMeet account.",
  },
  expired: {
    kind: "error",
    text: "That link expired. Please connect again.",
  },
  failed: {
    kind: "error",
    text: "We couldn't connect GitHub. Please try again.",
  },
};

const CARD =
  "rounded-xl border border-surface-variant bg-surface-container-lowest p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]";
const ROW =
  "mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-surface-variant px-4 py-3";
const OUTLINE_BUTTON =
  "inline-flex h-9 items-center rounded-lg border border-outline-variant px-3 text-body-md font-medium text-on-surface transition-colors hover:bg-surface-container-low disabled:opacity-50";

const ConnectedChip = () => (
  <span className="rounded-full bg-success-container px-2 py-0.5 text-xs font-medium text-on-success-container">
    Connected
  </span>
);

const GitHubCard = ({
  account,
  busy,
  onDisconnect,
}: {
  account: GitHubAccount;
  busy: boolean;
  onDisconnect: () => void;
}) => (
  <div className={CARD}>
    <h2 className="text-headline-sm font-semibold text-on-surface">GitHub</h2>
    <p className="mt-1 text-body-md text-on-surface-variant">
      Used to tell you when your review is requested on a linked repository.
    </p>
    <div className={ROW}>
      <div className="flex min-w-0 items-center gap-3">
        <Github className="h-5 w-5 shrink-0 text-on-surface" aria-hidden />
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium text-on-surface">
            GitHub
            {account.connected && <ConnectedChip />}
          </p>
          <p className="truncate text-body-md text-on-surface-variant">
            {account.connected
              ? `Signed in as @${account.login}`
              : "Not connected"}
          </p>
        </div>
      </div>
      {account.connected ? (
        <button
          type="button"
          disabled={busy}
          onClick={onDisconnect}
          className={OUTLINE_BUTTON}
        >
          {busy ? "Disconnecting..." : "Disconnect"}
        </button>
      ) : account.authorizeUrl ? (
        <a href={account.authorizeUrl} className={OUTLINE_BUTTON}>
          Connect
        </a>
      ) : (
        <p className="text-body-md text-on-surface-variant">
          GitHub isn&apos;t set up on this server.
        </p>
      )}
    </div>
  </div>
);

const GoogleCard = () => {
  const { user } = useUser();
  const [busy, setBusy] = useState(false);
  const google = user?.externalAccounts?.find((a) => a.provider === "google");

  const connect = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const created = await user.createExternalAccount({
        strategy: "oauth_google",
        redirectUrl: `${window.location.origin}/settings?tab=connected`,
      });
      const next = created.verification?.externalVerificationRedirectURL?.href;
      if (!next) throw new Error("no redirect");
      window.location.assign(next);
    } catch {
      toast.error("We couldn't connect Google. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div className={CARD}>
      <h2 className="text-headline-sm font-semibold text-on-surface">Google</h2>
      <p className="mt-1 text-body-md text-on-surface-variant">
        Used for Sign in with Google.
      </p>
      <div className={ROW}>
        <div className="flex min-w-0 items-center gap-3">
          <Chrome className="h-5 w-5 shrink-0 text-on-surface" aria-hidden />
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-medium text-on-surface">
              Google
              {google && <ConnectedChip />}
            </p>
            <p className="truncate text-body-md text-on-surface-variant">
              {google ? google.emailAddress : "Not connected"}
            </p>
          </div>
        </div>
        {!google && (
          <button
            type="button"
            disabled={busy || !user}
            onClick={() => void connect()}
            className={OUTLINE_BUTTON}
          >
            Connect
          </button>
        )}
      </div>
    </div>
  );
};

/** AC-77f: the Connected Accounts tab. */
const ConnectedAccounts = () => {
  const router = useRouter();
  const params = useSearchParams();
  const code = params.get("github");
  const shownCode = useRef<string | null>(null);

  const [account, setAccount] = useState<GitHubAccount | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);
  const loading = account === null && !failed;
  const { timedOut } = useLoadingTimeout(loading, {
    timeoutMs: 12000,
    retryNonce: nonce,
  });

  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const res = await fetch("/api/settings/github", { signal });
      if (!res.ok) throw new Error("load failed");
      setAccount((await res.json()) as GitHubAccount);
    } catch {
      if (!signal.aborted) setFailed(true);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, nonce]);

  useEffect(() => {
    if (!code || shownCode.current === code) return;
    shownCode.current = code;
    const outcome = OUTCOMES[code];
    if (outcome?.kind === "success") toast.success(outcome.text);
    else if (outcome) toast.error(outcome.text);
    router.replace("/settings?tab=connected", { scroll: false });
  }, [code, router]);

  const retry = () => {
    setFailed(false);
    setAccount(null);
    setNonce((n) => n + 1);
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/settings/github", { method: "DELETE" });
      if (!res.ok) throw new Error("disconnect failed");
      setAccount((prev) =>
        prev ? { ...prev, connected: false, login: null } : prev,
      );
      toast.success("GitHub is disconnected.");
    } catch {
      toast.error("We couldn't disconnect GitHub. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {failed || timedOut ? (
        <LoadError
          message="We couldn't load your GitHub account."
          onRetry={retry}
        />
      ) : account ? (
        <GitHubCard
          account={account}
          busy={busy}
          onDisconnect={() => void disconnect()}
        />
      ) : (
        <div className={`${CARD} flex justify-center`}>
          <LoaderOne />
        </div>
      )}
      <GoogleCard />
    </div>
  );
};

export default ConnectedAccounts;
