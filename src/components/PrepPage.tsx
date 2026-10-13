/* eslint-disable prettier/prettier */
"use client";

import React, { useState } from "react";
import { ListChecks, Loader2 } from "lucide-react";
import { LoaderOne } from "@/components/ui/loader";
import { LoadError } from "@/components/ui/load-error";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";

type PrepSuggestions = {
  context: string[];
  openActionItems: string[];
  discussionPoints: string[];
  questionsToAsk: string[];
};

const SECTIONS: { key: keyof PrepSuggestions; label: string }[] = [
  { key: "context", label: "Context to know" },
  { key: "openActionItems", label: "Open action items to follow up" },
  { key: "discussionPoints", label: "Discussion points" },
  { key: "questionsToAsk", label: "Questions to ask" },
];

const PrepPage = () => {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [suggestions, setSuggestions] = useState<PrepSuggestions | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  // A never-settling /api/prep leaves isLoading true forever. Reuse P0's
  // bounded timeout so a hung request falls back to Retry instead of spinning.
  const { timedOut } = useLoadingTimeout(isLoading, {
    timeoutMs: 12000,
    retryNonce,
  });

  const generate = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;

    setIsLoading(true);
    setGenerated(true);
    setError(null);
    try {
      const res = await fetch("/api/prep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed, notes: notes.trim() }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Prep failed: ${res.status}`);
      }

      const data = (await res.json()) as { suggestions: PrepSuggestions };
      setSuggestions(data.suggestions ?? null);
    } catch (err) {
      console.error("Meeting prep failed:", err);
      setSuggestions(null);
      setError(
        err instanceof Error ? err.message : "Prep failed unexpectedly",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    generate();
  };

  const hasAny =
    suggestions != null &&
    SECTIONS.some((s) => (suggestions[s.key]?.length ?? 0) > 0);

  return (
    <section className="flex w-full flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg">
          Meeting Prep
        </h1>
        <p className="text-body-md text-on-surface-variant">
          Get grounded prep notes from your past related meetings before you
          join.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-2xl flex-col gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-4"
      >
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Meeting title (e.g. Q3 Roadmap Sync)"
          className="w-full rounded-lg bg-surface-container px-3 py-2 text-body-lg text-on-surface outline-none placeholder:text-on-surface-variant"
          aria-label="Upcoming meeting title"
        />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What's this meeting about? (optional notes, agenda, attendees)"
          rows={3}
          className="w-full resize-y rounded-lg bg-surface-container px-3 py-2 text-body-lg text-on-surface outline-none placeholder:text-on-surface-variant"
          aria-label="Prep notes"
        />
        <button
          type="submit"
          disabled={isLoading || !title.trim()}
          className="inline-flex w-fit items-center gap-2 rounded-lg bg-primary-container px-4 py-2 text-body-md font-body-md font-semibold text-on-primary transition-colors hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ListChecks className="h-4 w-4" />
          )}
          Generate prep
        </button>
      </form>

      {isLoading &&
        (timedOut ? (
          <LoadError
            message="Prep couldn't be generated. The request took too long."
            onRetry={() => {
              setRetryNonce((k) => k + 1);
              generate();
            }}
          />
        ) : (
          <LoaderOne />
        ))}

      {!isLoading && !generated && (
        <p className="text-body-md text-on-surface-variant">
          Enter the upcoming meeting title above to surface context, open action
          items, and questions from meetings like it.
        </p>
      )}

      {!isLoading && error && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-error-container bg-error-container/40 px-6 py-16 text-center">
          <ListChecks className="h-10 w-10 text-error" />
          <p className="text-body-lg text-on-error-container">
            Prep could not be generated.
          </p>
          <p className="text-body-md text-on-surface-variant">
            {error.includes("match_meeting_chunks_user")
              ? "The search function may not be set up in the database yet. Run the match_meeting_chunks_user function in the Supabase SQL Editor."
              : error}
          </p>
        </div>
      )}

      {!isLoading && !error && generated && !hasAny && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-surface-variant bg-surface-container-lowest px-6 py-16 text-center">
          <ListChecks className="h-10 w-10 text-on-surface-variant" />
          <p className="text-body-lg text-on-surface-variant">
            No prep suggestions yet.
          </p>
          <p className="text-body-md text-on-surface-variant">
            Try a different title, or add notes about the meeting. If you have no
            related past meetings, try a broader topic.
          </p>
        </div>
      )}

      {!isLoading && !error && suggestions && hasAny && (
        <div className="flex w-full max-w-2xl flex-col gap-4">
          {SECTIONS.map((section) => {
            const items = suggestions[section.key] ?? [];
            if (items.length === 0) return null;
            return (
              <div
                key={section.key}
                className="overflow-hidden rounded-xl border border-surface-variant bg-surface-container-lowest shadow-[0_4px_20px_rgba(0,0,0,0.04)]"
              >
                <div className="border-b border-surface-variant bg-surface-container-low/50 px-6 py-4">
                  <h2 className="font-body-md font-semibold text-primary-container">
                    {section.label}
                  </h2>
                </div>
                <ul className="flex flex-col divide-y divide-surface-variant">
                  {items.map((item, idx) => (
                    <li
                      key={idx}
                      className="flex gap-2 px-6 py-3 text-body-md text-on-surface"
                    >
                      <span className="text-primary-container">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default PrepPage;
