"use client";

import React from "react";
import Link from "next/link";

const LandingCTA = () => {
  return (
    <section className="bg-surface py-32 relative text-center border-t border-outline-variant overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-primary-container/10 rounded-full pointer-events-none" />

      <div className="max-w-4xl mx-auto px-6 relative z-10">
        <h2 className="text-4xl md:text-5xl font-bold text-on-surface mb-6">
          Ready to make your meetings work harder?
        </h2>
        <p className="text-on-surface-variant text-lg mb-10 max-w-2xl mx-auto">
          Start for free. Record a meeting, and NeuraMeet handles the notes,
          follow-ups, and search.
        </p>
        <Link
          href="/sign-up"
          className="bg-primary-container text-on-primary rounded-xl px-10 py-4 font-bold text-lg hover:bg-primary transition-colors inline-flex items-center justify-center gap-2"
        >
          Get Started Now
        </Link>
      </div>
    </section>
  );
};

export default LandingCTA;
