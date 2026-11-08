"use client";

import React from "react";
import Link from "next/link";
import Reveal from "./Reveal";

const LandingCTA = () => {
  return (
    <section className="bg-surface py-16 px-4">
      <Reveal className="max-w-6xl mx-auto">
        <div className="bg-gradient-to-br from-primary to-primary-container rounded-tray px-6 py-20 text-center">
          <h2 className="text-4xl md:text-5xl font-light tracking-tight text-on-primary mb-6">
            Ready to make your meetings work harder?
          </h2>
          <p className="text-on-primary/85 text-lg mb-10 max-w-2xl mx-auto">
            Start for free. Record a meeting, and NeuraMeet handles the notes,
            follow-ups, and search.
          </p>
          <Link
            href="/sign-up"
            className="bg-surface-container-lowest text-primary rounded-full px-10 py-4 font-medium text-base hover:bg-lilac transition-colors inline-flex items-center justify-center"
          >
            Get Started Now
          </Link>
        </div>
      </Reveal>
    </section>
  );
};

export default LandingCTA;
