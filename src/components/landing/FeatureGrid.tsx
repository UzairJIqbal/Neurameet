"use client";

import React from "react";
import { IconVideo, IconBrain, IconClipboard } from "@tabler/icons-react";

const features = [
  {
    icon: IconVideo,
    title: "Real-Time Meetings",
    description:
      "Transcribe and analyze conversations as they happen with sub-second latency across all major platforms.",
  },
  {
    icon: IconBrain,
    title: "AI Meeting Intelligence",
    description:
      "Extract key insights, detect sentiment, and automatically generate executive summaries without human intervention.",
  },
  {
    icon: IconClipboard,
    title: "Smart Follow-ups",
    description:
      "Auto-generate action items, assign them to team members, and push them directly to your project management tools.",
  },
];

const FeatureGrid = () => {
  return (
    <section id="features" className="bg-inverse-surface py-24">
      <div className="max-w-7xl mx-auto px-6">
        {/* Heading */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-inverse-on-surface mb-4">
            Everything you need for perfect meetings
          </h2>
          <p className="text-inverse-on-surface/70 text-base max-w-2xl mx-auto">
            Powerful AI models working in the background to capture every
            detail.
          </p>
        </div>

        {/* Grid — 3 cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="bg-inverse-on-surface/5 rounded-xl p-8 border border-inverse-on-surface/10 hover:-translate-y-1 transition-transform duration-300"
              >
                <div className="w-12 h-12 rounded-lg bg-primary-container/10 flex items-center justify-center mb-6 border border-primary-container/20">
                  <Icon
                    size={24}
                    className="text-primary-container"
                    stroke={1.5}
                  />
                </div>
                <h3 className="text-inverse-on-surface font-semibold text-lg mb-3">
                  {feature.title}
                </h3>
                <p className="text-inverse-on-surface/70 text-sm leading-relaxed">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default FeatureGrid;
