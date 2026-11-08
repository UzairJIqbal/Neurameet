"use client";

import React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { IconArrowRight, IconCheck, IconListCheck } from "@tabler/icons-react";

const stats = [
  { value: "EN + UR", label: "Transcripts in English and Urdu" },
  { value: "100%", label: "Decisions linked to a quote" },
  { value: "SHA-256", label: "Tamper evident sealed minutes" },
];

const LandingHero = () => {
  const reduce = useReducedMotion();
  const rise = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 24 },
          animate: { opacity: 1, y: 0 },
          transition: {
            duration: 0.6,
            delay,
            ease: [0.22, 1, 0.36, 1] as const,
          },
        };

  return (
    <section className="relative bg-surface pt-32 pb-20 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center">
        {/* Copy */}
        <div>
          <motion.span
            {...rise(0)}
            className="inline-flex items-center gap-2 bg-lilac text-on-secondary-container rounded-full px-4 py-1.5 text-xs font-medium mb-6"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-primary-container" />
            Meetings that keep their promises
          </motion.span>
          <motion.h1
            {...rise(0.08)}
            className="text-5xl md:text-6xl font-light text-on-surface leading-[1.08] tracking-tight mb-6"
          >
            Turn every meeting into{" "}
            <span className="text-primary-container">kept promises</span>
          </motion.h1>
          <motion.p
            {...rise(0.16)}
            className="text-on-surface-variant text-base md:text-lg max-w-xl mb-8 leading-relaxed"
          >
            NeuraMeet records your calls, transcribes them in English and Urdu,
            and turns each conversation into summaries, action items, and a
            searchable history, automatically.
          </motion.p>
          <motion.div
            {...rise(0.24)}
            className="flex flex-col sm:flex-row gap-3 mb-10"
          >
            <Link
              href="/sign-up"
              className="bg-primary-container text-on-primary rounded-full px-7 py-3.5 font-medium text-sm hover:bg-primary transition-colors inline-flex items-center justify-center gap-2"
            >
              Get Started
              <IconArrowRight size={18} />
            </Link>
            <Link
              href="/sign-in"
              className="bg-surface-container text-on-surface rounded-full px-7 py-3.5 font-medium text-sm hover:bg-surface-container-high transition-colors inline-flex items-center justify-center"
            >
              Sign in
            </Link>
          </motion.div>

          {/* Stat cards in a tray */}
          <motion.div
            {...rise(0.32)}
            className="bg-surface-container-low rounded-tray p-3 grid grid-cols-3 gap-3"
          >
            {stats.map((s, i) => (
              <div
                key={s.value}
                className={`rounded-card p-4 ${
                  i === 1
                    ? "bg-gradient-to-br from-coral to-tertiary-container text-on-primary"
                    : "bg-surface-container-lowest shadow-card text-on-surface"
                }`}
              >
                <div className="text-lg sm:text-xl font-semibold leading-tight">
                  {s.value}
                </div>
                <div
                  className={`text-xs mt-1 ${
                    i === 1 ? "text-on-primary/90" : "text-on-surface-variant"
                  }`}
                >
                  {s.label}
                </div>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Bento mockup */}
        <motion.div {...rise(0.2)} className="relative">
          <div className="bg-lilac rounded-tray p-4 sm:p-6 relative">
            <div className="bg-surface-container-lowest rounded-card shadow-card overflow-hidden">
              <div className="h-9 bg-surface-container-low flex items-center px-4 gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-error/70" />
                <div className="w-2.5 h-2.5 rounded-full bg-outline-variant" />
                <div className="w-2.5 h-2.5 rounded-full bg-outline-variant" />
              </div>
              <div className="flex gap-4 p-4 h-[320px]">
                {/* Sidebar */}
                <div className="hidden sm:block w-48 bg-surface-container-low rounded-card p-4 space-y-3 flex-shrink-0">
                  <div className="w-8 h-8 rounded-lg bg-primary-container/15" />
                  <div className="h-2 rounded bg-surface-container-high w-full" />
                  <div className="h-2 rounded bg-surface-container-high w-3/4" />
                  <div className="h-2 rounded bg-primary-container/20 w-full" />
                  <div className="h-2 rounded bg-surface-container-high w-5/6" />
                  <div className="h-2 rounded bg-surface-container-high w-2/3" />
                </div>
                {/* Main */}
                <div className="flex-1 space-y-4 min-w-0">
                  <div className="h-3 rounded bg-surface-container-high w-1/3" />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-lilac-soft rounded-card p-3">
                      <div className="w-7 h-7 rounded-lg bg-primary-container/20 mb-3" />
                      <div className="h-2 rounded bg-surface-container-high w-16 mb-2" />
                      <div className="h-3 rounded bg-primary-container/25 w-10" />
                    </div>
                    <div className="bg-lilac-soft rounded-card p-3">
                      <div className="w-7 h-7 rounded-lg bg-primary-container/20 mb-3" />
                      <div className="h-2 rounded bg-surface-container-high w-20 mb-2" />
                      <div className="h-3 rounded bg-primary-container/25 w-12" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-1.5 rounded bg-surface-container-high w-full" />
                    <div className="h-1.5 rounded bg-surface-container-high w-4/5" />
                    <div className="h-1.5 rounded bg-surface-container-high w-3/5" />
                    <div className="h-1.5 rounded bg-surface-container-high w-2/3" />
                  </div>
                </div>
              </div>
            </div>

            {/* Floating cards */}
            <div className="hidden sm:flex absolute -left-6 bottom-10 bg-surface-container-lowest rounded-card shadow-float p-3 items-center gap-3 motion-safe:animate-float-slow">
              <span className="w-9 h-9 rounded-full bg-lilac text-primary-container flex items-center justify-center">
                <IconListCheck size={18} />
              </span>
              <div>
                <div className="text-xs font-semibold text-on-surface">
                  3 action items
                </div>
                <div className="text-xs text-on-surface-variant">
                  Extracted from the call
                </div>
              </div>
            </div>
            <div className="hidden sm:flex absolute -right-4 top-10 bg-surface-container-lowest rounded-card shadow-float p-3 items-center gap-3 motion-safe:animate-float-slow [animation-delay:-3s]">
              <span className="w-9 h-9 rounded-full bg-lilac text-primary-container flex items-center justify-center">
                <IconCheck size={18} />
              </span>
              <div>
                <div className="text-xs font-semibold text-on-surface">
                  Promise kept
                </div>
                <div className="text-xs text-on-surface-variant">
                  Quote and timestamp as proof
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default LandingHero;
