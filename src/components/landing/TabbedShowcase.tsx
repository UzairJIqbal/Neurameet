"use client";

import React, { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  IconCircleCheck,
  IconFileText,
  IconListCheck,
  IconShieldCheck,
} from "@tabler/icons-react";
import Reveal from "./Reveal";

type Tab = {
  id: string;
  label: string;
  icon: typeof IconFileText;
  title: string;
  body: string;
  points: string[];
  card: { kind: string; line: string; meta: string };
};

const TABS: Tab[] = [
  {
    id: "summary",
    label: "Summary",
    icon: IconFileText,
    title: "A summary the moment the call ends",
    body: "Transcripts in English, Urdu, or both become a short summary, the key decisions, and a category.",
    points: [
      "English and Urdu",
      "Speaker labelled lines",
      "Searchable across meetings",
    ],
    card: {
      kind: "Summary",
      line: "Team agreed to ship the login API this sprint.",
      meta: "Sprint Planning · 24 min",
    },
  },
  {
    id: "actions",
    label: "Action Items",
    icon: IconListCheck,
    title: "Action items with an owner and a quote",
    body: "Every task is pulled from what was said, shown with the exact quote, and waits for a human to confirm it.",
    points: [
      "Quote verified",
      "Review before it becomes a task",
      "Duplicates flagged",
    ],
    card: {
      kind: "Action item",
      line: 'Ali: "I\'ll take the Login API."',
      meta: "Due Friday · needs review",
    },
  },
  {
    id: "ledger",
    label: "Promise Ledger",
    icon: IconCircleCheck,
    title: "Every promise, tracked to kept",
    body: "Promises and decisions are matched against later meetings and merged pull requests, each with proof.",
    points: [
      "Kept, open, overdue, reversed",
      "Quote and timestamp as proof",
      "Owner confirms each match",
    ],
    card: {
      kind: "Promise",
      line: "Login API merged in PR #51.",
      meta: "Marked kept · proof attached",
    },
  },
  {
    id: "minutes",
    label: "Verified Minutes",
    icon: IconShieldCheck,
    title: "Minutes everyone has confirmed",
    body: "Each attendee confirms, corrects, or records a dissent on their own lines. Sealed minutes show any later change.",
    points: [
      "Confirm, correct or dissent",
      "Tamper evident seal",
      "Public verify link",
    ],
    card: {
      kind: "Minutes",
      line: "4 of 5 attendees confirmed.",
      meta: "Sealed · signature intact",
    },
  },
];

const TabbedShowcase = () => {
  const [active, setActive] = useState(TABS[0].id);
  const reduce = useReducedMotion();
  const tab = TABS.find((t) => t.id === active) ?? TABS[0];
  const Icon = tab.icon;

  return (
    <section className="px-4 py-16 sm:px-6">
      <Reveal className="mx-auto max-w-6xl">
        <div className="text-center">
          <h2 className="text-3xl font-light tracking-tight text-on-surface md:text-5xl">
            From the call to{" "}
            <span className="text-primary-container">proof</span>
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-body-md text-on-surface-variant">
            One meeting, four things your team can rely on.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Product features"
          className="mt-8 flex flex-wrap justify-center gap-2"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === active}
              onClick={() => setActive(t.id)}
              className={`rounded-full px-5 py-2 text-body-md font-medium transition-colors ${
                t.id === active
                  ? "bg-inverse-surface text-inverse-on-surface"
                  : "bg-surface-container-lowest text-on-surface-variant shadow-card hover:text-on-surface"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-8 rounded-tray bg-surface-container-low p-4 sm:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab.id}
              role="tabpanel"
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="grid gap-8 md:grid-cols-2 md:items-center"
            >
              <div className="rounded-card bg-lilac p-6 sm:p-10">
                <div className="rounded-card bg-lilac-soft p-5 shadow-card">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-lilac text-on-secondary-container">
                      <Icon size={20} stroke={1.5} />
                    </span>
                    <span className="text-label-caps uppercase tracking-wider text-on-surface-variant">
                      {tab.card.kind}
                    </span>
                  </div>
                  <p className="mt-4 text-headline-sm font-semibold text-on-surface">
                    {tab.card.line}
                  </p>
                  <p className="mt-1 text-body-md text-on-surface-variant">
                    {tab.card.meta}
                  </p>
                </div>
              </div>
              <div>
                <h3 className="text-2xl font-light tracking-tight text-on-surface md:text-3xl">
                  {tab.title}
                </h3>
                <p className="mt-3 text-body-md text-on-surface-variant">
                  {tab.body}
                </p>
                <ul className="mt-5 flex flex-wrap gap-2">
                  {tab.points.map((p) => (
                    <li
                      key={p}
                      className="rounded-full bg-surface-container-lowest px-3 py-1 text-body-md text-on-surface shadow-card"
                    >
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </Reveal>
    </section>
  );
};

export default TabbedShowcase;
