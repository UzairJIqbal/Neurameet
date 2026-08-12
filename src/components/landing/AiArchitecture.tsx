"use client";

import React from "react";
import { IconCheck } from "@tabler/icons-react";

const checks = [
  "Real-time processing with sub-500ms latency.",
  "Customizable vocabulary for industry-specific terms.",
  "Continuous learning loop improves accuracy over time.",
];

const AiArchitecture = () => {
  return (
    <section className="bg-inverse-surface py-24 border-t border-inverse-on-surface/10">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col lg:flex-row items-center gap-12">
          {/* Left — text */}
          <div className="lg:w-1/2">
            <h2 className="text-3xl md:text-4xl font-bold text-inverse-on-surface mb-6">
              Built on modern AI architecture
            </h2>
            <p className="text-inverse-on-surface/70 text-lg mb-6 leading-relaxed">
              NeuraMeet leverages advanced Large Language Models (LLMs) to
              understand context, nuance, and domain-specific terminology. Our
              proprietary models are fine-tuned for conversational dynamics,
              ensuring high accuracy even with multiple speakers, technical
              jargon, or heavy accents.
            </p>
            <ul className="space-y-4">
              {checks.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <IconCheck
                    size={20}
                    className="text-primary-container mt-0.5 flex-shrink-0"
                    stroke={2}
                  />
                  <span className="text-inverse-on-surface/70 text-sm">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right — stat card */}
          <div className="lg:w-1/2 w-full">
            <div className="bg-inverse-on-surface/5 rounded-xl p-8 border border-inverse-on-surface/10 h-80 flex flex-col justify-center items-center relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary-container/15 rounded-full" />
              <div className="text-center z-10">
                <div className="text-6xl font-bold text-inverse-on-surface mb-2">
                  +45%
                </div>
                <div className="text-inverse-on-surface/70 text-sm">
                  Meeting Efficiency
                </div>
                <div className="mt-6 w-full max-w-xs mx-auto h-2 bg-inverse-surface rounded-full overflow-hidden">
                  <div className="h-full bg-primary-container w-[75%] rounded-full" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AiArchitecture;
