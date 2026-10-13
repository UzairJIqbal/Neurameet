"use client";

import React from "react";
import Link from "next/link";
import { IconArrowForward } from "@tabler/icons-react";

const LandingHero = () => {
  return (
    <section className="relative bg-surface pt-32 pb-24 overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-primary-container/15 rounded-full pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-6 text-center">
        {/* Headline */}
        <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-on-surface leading-tight max-w-4xl mx-auto mb-6">
          Capture, understand, and act on every meeting
          <br />
          <span className="bg-gradient-to-r from-primary-container to-primary bg-clip-text text-transparent">
            with NeuraMeet AI
          </span>
        </h1>

        {/* Subtitle */}
        <p className="text-on-surface-variant text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
          NeuraMeet records your calls, transcribes them in English and Urdu,
          and turns each conversation into summaries, action items, attendance,
          and a searchable history automatically.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/sign-up"
            className="bg-primary-container text-on-primary rounded-xl px-8 py-3.5 font-medium text-base hover:bg-primary transition-colors flex items-center gap-2 w-full sm:w-auto justify-center"
          >
            Get Started
            <IconArrowForward size={18} />
          </Link>
          <Link
            href="/sign-in"
            className="border border-outline-variant text-on-surface rounded-xl px-8 py-3.5 font-medium text-base hover:bg-surface-container-low transition-colors flex items-center gap-2 w-full sm:w-auto justify-center"
          >
            Sign in
          </Link>
        </div>

        {/* Dashboard Mockup */}
        <div className="mt-20 relative mx-auto max-w-5xl">
          <div className="absolute inset-0 bg-gradient-to-t from-surface to-transparent z-10 top-1/2" />
          <div className="bg-surface-container-low rounded-xl p-2 relative z-0 border border-outline-variant">
            {/* Browser chrome */}
            <div className="h-10 bg-surface-container rounded-t-lg border-b border-outline-variant flex items-center px-4 gap-2">
              <div className="w-3 h-3 rounded-full bg-error/80" />
              <div className="w-3 h-3 rounded-full bg-outline-variant" />
              <div className="w-3 h-3 rounded-full bg-secondary-container" />
            </div>
            {/* Dashboard content */}
            <div className="h-[400px] bg-surface-container-low rounded-b-lg overflow-hidden relative">
              {/* Abstract dashboard representation */}
              <div className="absolute inset-0 p-6 flex gap-4">
                {/* Sidebar */}
                <div className="hidden sm:block w-48 bg-surface-container-low rounded-lg p-4 space-y-3 flex-shrink-0">
                  <div className="w-8 h-8 rounded-lg bg-primary-container/15" />
                  <div className="h-2 rounded bg-surface-container-high w-full" />
                  <div className="h-2 rounded bg-surface-container-high w-3/4" />
                  <div className="h-2 rounded bg-primary-container/15 w-full" />
                  <div className="h-2 rounded bg-surface-container-high w-5/6" />
                  <div className="h-2 rounded bg-surface-container-high w-2/3" />
                </div>
                {/* Main area */}
                <div className="flex-1 space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-surface-container-low rounded-lg p-4">
                      <div className="w-8 h-8 rounded-lg bg-primary-container/15 mb-3" />
                      <div className="h-2 rounded bg-surface-container-high w-16 mb-2" />
                      <div className="h-3 rounded bg-primary-container/15 w-10" />
                    </div>
                    <div className="bg-surface-container-low rounded-lg p-4">
                      <div className="w-8 h-8 rounded-lg bg-primary-container/15 mb-3" />
                      <div className="h-2 rounded bg-surface-container-high w-20 mb-2" />
                      <div className="h-3 rounded bg-primary-container/15 w-12" />
                    </div>
                    <div className="bg-surface-container-low rounded-lg p-4">
                      <div className="w-8 h-8 rounded-lg bg-primary-container/15 mb-3" />
                      <div className="h-2 rounded bg-surface-container-high w-14 mb-2" />
                      <div className="h-3 rounded bg-primary-container/15 w-8" />
                    </div>
                  </div>
                  <div className="bg-surface-container-low rounded-lg p-4 flex-1">
                    <div className="flex items-center justify-between mb-4">
                      <div className="h-2 rounded bg-surface-container-high w-24" />
                      <div className="h-2 rounded bg-primary-container/15 w-16" />
                    </div>
                    <div className="space-y-2">
                      <div className="h-1.5 rounded bg-surface-container-high w-full" />
                      <div className="h-1.5 rounded bg-surface-container-high w-4/5" />
                      <div className="h-1.5 rounded bg-surface-container-high w-3/5" />
                      <div className="h-1.5 rounded bg-surface-container-high w-full" />
                      <div className="h-1.5 rounded bg-surface-container-high w-2/3" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default LandingHero;
