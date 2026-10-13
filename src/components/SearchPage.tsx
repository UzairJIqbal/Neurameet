/* eslint-disable prettier/prettier */
"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Search, Loader2 } from "lucide-react";
import { LoaderOne } from "@/components/ui/loader";
import { LoadError } from "@/components/ui/load-error";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { CrossMeetingHit } from "@/agent/rag";

const SNIPPET_CHARS = 280;
const MAX_HITS_PER_MEETING = 3;

type GroupedResult = {
  meetingId: string;
  meetingTitle: string;
  hits: CrossMeetingHit[];
};

function groupByMeeting(hits: CrossMeetingHit[]): GroupedResult[] {
  const byMeeting = new Map<string, GroupedResult>();
  for (const hit of hits) {
    const existing = byMeeting.get(hit.meetingId);
    if (existing) {
      existing.hits.push(hit);
    } else {
      byMeeting.set(hit.meetingId, {
        meetingId: hit.meetingId,
        meetingTitle: hit.meetingTitle,
        hits: [hit],
      });
    }
  }
  // Highest-similarity hit first within each meeting group.
  return Array.from(byMeeting.values()).map((group) => ({
    ...group,
    hits: [...group.hits].sort((a, b) => b.similarity - a.similarity),
  }));
}

const SearchPage = () => {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [results, setResults] = useState<CrossMeetingHit[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  // A never-settling /api/search leaves isLoading true forever. Reuse P0's
  // bounded timeout so a hung request falls back to Retry instead of spinning.
  const { timedOut } = useLoadingTimeout(isLoading, {
    timeoutMs: 12000,
    retryNonce,
  });

  const runSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setIsLoading(true);
    setSearched(true);
    setSubmitted(trimmed);
    setError(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? `Search failed: ${res.status}`);
      }

      const data = (await res.json()) as { results: CrossMeetingHit[] };
      setResults(data.results ?? []);
    } catch (err) {
      console.error("Cross-meeting search failed:", err);
      setResults([]);
      setError(
        err instanceof Error ? err.message : "Search failed unexpectedly",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch();
  };

  const groups = groupByMeeting(results);

  return (
    <section className="flex w-full flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg">
          Search
        </h1>
        <p className="text-body-md text-on-surface-variant">
          Find anything across your meetings by meaning, not just keywords.
        </p>
      </header>

      <form
        onSubmit={handleSearch}
        className="flex w-full max-w-2xl items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-3"
      >
        <Search className="h-5 w-5 shrink-0 text-on-surface-variant" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search meetings…"
          // min-w-0 lets the input shrink inside the single-row flex search bar
          // on the smallest phones instead of forcing the row to overflow. The
          // placeholder is kept short so it is never clipped in the narrow input
          // (a text input clips its placeholder instead of wrapping).
          className="min-w-0 w-full bg-transparent text-body-lg text-on-surface outline-none placeholder:text-on-surface-variant"
          aria-label="Search across your meetings"
        />
        <button
          type="submit"
          disabled={isLoading || !query.trim()}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary-container px-4 py-2 text-body-md font-body-md font-semibold text-on-primary transition-colors hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          Search
        </button>
      </form>

      {isLoading &&
        (timedOut ? (
          <LoadError
            message="Search couldn't run. The request took too long."
            onRetry={() => {
              setRetryNonce((k) => k + 1);
              runSearch();
            }}
          />
        ) : (
          <LoaderOne />
        ))}

      {!isLoading && !searched && (
        <p className="text-body-md text-on-surface-variant">
          Type a question or topic above to search every meeting you have
          uploaded.
        </p>
      )}

      {!isLoading && error && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-error-container bg-error-container/40 px-6 py-16 text-center">
          <Search className="h-10 w-10 text-error" />
          <p className="text-body-lg text-on-error-container">
            Search could not run.
          </p>
          <p className="text-body-md text-on-surface-variant">
            {error.includes("match_meeting_chunks_user")
              ? "The search function may not be set up in the database yet. Run the match_meeting_chunks_user function in the Supabase SQL Editor."
              : error}
          </p>
        </div>
      )}

      {!isLoading && !error && searched && groups.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-surface-variant bg-surface-container-lowest px-6 py-16 text-center">
          <Search className="h-10 w-10 text-on-surface-variant" />
          <p className="text-body-lg text-on-surface-variant">
            No matches across your meetings.
          </p>
          <p className="text-body-md text-on-surface-variant">
            Try different words, or upload a transcript to enable search for a
            meeting.
          </p>
        </div>
      )}

      {!isLoading &&
        groups.map((group) => (
          <div
            key={group.meetingId}
            className="overflow-hidden rounded-xl border border-surface-variant bg-surface-container-lowest shadow-[0_4px_20px_rgba(0,0,0,0.04)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-variant bg-surface-container-low/50 px-6 py-4">
              <Link
                href={`/meeting-intelligence/${group.meetingId}`}
                className="break-words font-body-md font-semibold text-primary-container hover:underline"
              >
                {group.meetingTitle}
              </Link>
              <span className="text-label-caps uppercase tracking-wider text-on-surface-variant">
                {group.hits.length} match
                {group.hits.length === 1 ? "" : "es"}
              </span>
            </div>
            <div className="divide-y divide-surface-variant">
              {group.hits.slice(0, MAX_HITS_PER_MEETING).map((hit) => (
                <div key={hit.id} className="px-6 py-4">
                  <p className="text-body-md text-on-surface">
                    {hit.chunkText.length > SNIPPET_CHARS
                      ? `${hit.chunkText.slice(0, SNIPPET_CHARS)}…`
                      : hit.chunkText}
                  </p>
                  <span className="mt-2 inline-flex items-center rounded-full bg-primary-container/15 px-2 py-0.5 text-xs font-medium text-primary-container">
                    {Math.round(hit.similarity * 100)}% match
                  </span>
                </div>
              ))}
              {group.hits.length > MAX_HITS_PER_MEETING && (
                <div className="px-6 py-3">
                  <Link
                    href={`/meeting-intelligence/${group.meetingId}`}
                    className="text-body-md font-medium text-primary-container hover:underline"
                  >
                    +{group.hits.length - MAX_HITS_PER_MEETING} more from this
                    meeting
                  </Link>
                </div>
              )}
            </div>
          </div>
        ))}
    </section>
  );
};

export default SearchPage;
