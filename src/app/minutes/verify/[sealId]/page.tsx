import type { ReactNode } from "react";
import type { Metadata } from "next";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { verifySeal, type VerifyResult } from "@/lib/minutes-seal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Check sealed minutes | NeuraMeet",
};

// Tasdeeq, Verified Minutes (spec 0003, AC-16). Public page: anyone holding a
// seal link can check it. It shows the result, hash, title, date, and status
// text, never the minutes text. Not in isPublicRoute (that would redirect a
// signed in visitor) and not in isProtectedRoute.

interface PageProps {
  params: Promise<{ sealId: string }>;
  searchParams: Promise<{ hash?: string | string[] }>;
}

const firstValue = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

async function check(
  sealId: string,
  hash: string | undefined,
): Promise<VerifyResult | null | "error"> {
  try {
    return await verifySeal(sealId, hash);
  } catch (err) {
    console.error("[tasdeeq] verify page failed", { sealId, err });
    return "error";
  }
}

const Shell = ({ children }: { children: ReactNode }) => (
  <main className="flex min-h-screen items-start justify-center bg-surface px-4 py-12">
    <div className="flex w-full max-w-xl flex-col gap-6 rounded-xl border border-surface-variant bg-surface-container-lowest p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      {children}
    </div>
  </main>
);

const Row = ({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) => (
  <div className="flex flex-col gap-1">
    <span className="text-label-caps font-medium uppercase tracking-wider text-on-surface-variant">
      {label}
    </span>
    <span
      className={`text-body-md text-on-surface ${mono ? "break-all font-mono" : ""}`}
    >
      {value || "Not recorded"}
    </span>
  </div>
);

export default async function VerifySealPage({
  params,
  searchParams,
}: PageProps) {
  const { sealId } = await params;
  const pasted = firstValue((await searchParams).hash)?.trim() || undefined;
  const result = await check(sealId, pasted);

  if (result === "error") {
    return (
      <Shell>
        <h1 className="text-headline-sm font-semibold text-on-surface">
          We couldn&apos;t check this seal
        </h1>
        <p className="text-body-md text-on-surface-variant">
          Please try again in a minute.
        </p>
      </Shell>
    );
  }

  if (!result) {
    return (
      <Shell>
        <h1 className="text-headline-sm font-semibold text-on-surface">
          Seal not found
        </h1>
        <p className="text-body-md text-on-surface-variant">
          No sealed minutes match this link. Check that you copied the whole
          link.
        </p>
      </Shell>
    );
  }

  const intact = result.result === "intact";
  return (
    <Shell>
      <div className="flex items-center gap-3">
        {intact ? (
          <ShieldCheck className="h-8 w-8 shrink-0 text-primary-container" />
        ) : (
          <ShieldAlert className="h-8 w-8 shrink-0 text-error" />
        )}
        <div className="flex flex-col">
          <h1 className="text-headline-sm font-semibold text-on-surface">
            {intact ? "These minutes are intact" : "These minutes were altered"}
          </h1>
          <p className="text-body-md text-on-surface-variant">
            {intact
              ? "Nothing changed since the owner sealed them."
              : "Something changed after the seal. Don't rely on this copy."}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <Row label="Meeting" value={result.title} />
        <Row label="Date" value={result.date} />
        <Row label="Status" value={result.statusText} />
        <Row label="Seal fingerprint (SHA-256)" value={result.hash} mono />
      </div>

      <form
        method="get"
        className="flex flex-col gap-3 rounded-lg bg-surface-container-low p-4"
      >
        <label
          htmlFor="hash"
          className="text-body-md font-medium text-on-surface"
        >
          Check it yourself
        </label>
        <p className="text-body-md text-on-surface-variant">
          The independent check compares this seal against the fingerprint you
          received by email or in the PDF. Paste it here.
        </p>
        <input
          id="hash"
          name="hash"
          defaultValue={pasted ?? ""}
          spellCheck={false}
          autoComplete="off"
          className="rounded-lg border border-surface-variant bg-surface-container-lowest px-3 py-2 font-mono text-body-md text-on-surface"
        />
        <button
          type="submit"
          className="inline-flex w-fit items-center rounded-lg bg-primary-container px-4 py-2 text-body-md font-semibold text-on-primary transition-colors hover:bg-primary"
        >
          Compare
        </button>
        {result.hashMatches !== null && (
          <p
            role="status"
            className={`text-body-md font-medium ${result.hashMatches ? "text-primary-container" : "text-error"}`}
          >
            {result.hashMatches
              ? "Match. Your fingerprint is the same as this seal."
              : "No match. Your fingerprint is different from this seal."}
          </p>
        )}
      </form>
    </Shell>
  );
}
