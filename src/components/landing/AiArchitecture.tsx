"use client";

import React from "react";

const stack = ["Stream", "Clerk", "Supabase", "Gemini", "Groq", "GitHub"];

// "Built with" marquee of the real stack. Pure CSS, pauses on hover, stops under reduced motion.
const AiArchitecture = () => {
  const items = [...stack, ...stack];
  return (
    <section className="bg-surface py-12">
      <div className="max-w-7xl mx-auto px-6">
        <div className="bg-surface-container-low rounded-tray py-8 overflow-hidden">
          <p className="text-center text-sm text-on-surface-variant mb-6">
            Built with free tier infrastructure you can trust
          </p>
          <div className="group relative overflow-hidden">
            <div className="flex w-max gap-12 motion-safe:animate-marquee group-hover:[animation-play-state:paused]">
              {items.map((name, i) => (
                <span
                  key={`${name}-${i}`}
                  aria-hidden={i >= stack.length}
                  className="text-2xl font-semibold tracking-tight text-on-surface-variant/70"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AiArchitecture;
