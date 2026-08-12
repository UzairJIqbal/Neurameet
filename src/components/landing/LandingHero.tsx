"use client";

import React from "react";
import Link from "next/link";
import { IconArrowForward, IconPlayerPlay } from "@tabler/icons-react";

const LandingHero = () => {
  return (
    <section className="relative bg-inverse-surface pt-32 pb-24 overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-primary-container/15 rounded-full pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-6 text-center">
        {/* Headline */}
        <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-inverse-on-surface leading-tight max-w-4xl mx-auto mb-6">
          Revolutionize Your Meetings
          <br />
          <span className="bg-gradient-to-r from-primary-container to-primary bg-clip-text text-transparent">
            With AI Intelligence
          </span>
        </h1>

        {/* Subtitle */}
        <p className="text-inverse-on-surface/70 text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
          Automate summaries, action items, and follow-ups in real-time. Turn
          every conversation into actionable data with enterprise-grade
          security.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/sign-up"
            className="bg-primary-container text-inverse-on-surface rounded-xl px-8 py-3.5 font-medium text-base hover:bg-primary transition-colors flex items-center gap-2 w-full sm:w-auto justify-center"
          >
            Get Started
            <IconArrowForward size={18} />
          </Link>
          <button className="border border-inverse-on-surface/20 text-inverse-on-surface rounded-xl px-8 py-3.5 font-medium text-base hover:bg-inverse-on-surface/5 hover:border-inverse-on-surface/40 transition-colors flex items-center gap-2 w-full sm:w-auto justify-center">
            <IconPlayerPlay size={18} />
            Watch Demo
          </button>
        </div>

        {/* Dashboard Mockup */}
        <div className="mt-20 relative mx-auto max-w-5xl">
          <div className="absolute inset-0 bg-gradient-to-t from-inverse-surface to-transparent z-10 top-1/2" />
          <div className="bg-inverse-surface/80 rounded-xl p-2 relative z-0 border border-inverse-on-surface/10">
            {/* Browser chrome */}
            <div className="h-10 bg-inverse-surface rounded-t-lg border-b border-inverse-on-surface/5 flex items-center px-4 gap-2">
              <div className="w-3 h-3 rounded-full bg-error/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
            </div>
            {/* Dashboard content */}
            <div className="h-[400px] bg-inverse-surface/50 rounded-b-lg overflow-hidden relative">
              {/* Abstract dashboard representation */}
              <div className="absolute inset-0 p-6 flex gap-4">
                {/* Sidebar */}
                <div className="w-48 bg-inverse-on-surface/5 rounded-lg p-4 space-y-3 flex-shrink-0">
                  <div className="w-8 h-8 rounded-lg bg-primary-container/20" />
                  <div className="h-2 rounded bg-inverse-on-surface/10 w-full" />
                  <div className="h-2 rounded bg-inverse-on-surface/10 w-3/4" />
                  <div className="h-2 rounded bg-primary-container/30 w-full" />
                  <div className="h-2 rounded bg-inverse-on-surface/10 w-5/6" />
                  <div className="h-2 rounded bg-inverse-on-surface/10 w-2/3" />
                </div>
                {/* Main area */}
                <div className="flex-1 space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-inverse-on-surface/5 rounded-lg p-4">
                      <div className="w-8 h-8 rounded-lg bg-primary-container/20 mb-3" />
                      <div className="h-2 rounded bg-inverse-on-surface/10 w-16 mb-2" />
                      <div className="h-3 rounded bg-primary-container/30 w-10" />
                    </div>
                    <div className="bg-inverse-on-surface/5 rounded-lg p-4">
                      <div className="w-8 h-8 rounded-lg bg-primary-container/20 mb-3" />
                      <div className="h-2 rounded bg-inverse-on-surface/10 w-20 mb-2" />
                      <div className="h-3 rounded bg-primary-container/30 w-12" />
                    </div>
                    <div className="bg-inverse-on-surface/5 rounded-lg p-4">
                      <div className="w-8 h-8 rounded-lg bg-primary-container/20 mb-3" />
                      <div className="h-2 rounded bg-inverse-on-surface/10 w-14 mb-2" />
                      <div className="h-3 rounded bg-primary-container/30 w-8" />
                    </div>
                  </div>
                  <div className="bg-inverse-on-surface/5 rounded-lg p-4 flex-1">
                    <div className="flex items-center justify-between mb-4">
                      <div className="h-2 rounded bg-inverse-on-surface/10 w-24" />
                      <div className="h-2 rounded bg-primary-container/30 w-16" />
                    </div>
                    <div className="space-y-2">
                      <div className="h-1.5 rounded bg-inverse-on-surface/8 w-full" />
                      <div className="h-1.5 rounded bg-inverse-on-surface/8 w-4/5" />
                      <div className="h-1.5 rounded bg-inverse-on-surface/8 w-3/5" />
                      <div className="h-1.5 rounded bg-inverse-on-surface/8 w-full" />
                      <div className="h-1.5 rounded bg-inverse-on-surface/8 w-2/3" />
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
