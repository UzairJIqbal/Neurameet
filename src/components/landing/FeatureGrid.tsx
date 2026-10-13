"use client";

import React from "react";
import {
  IconFileText,
  IconSparkles,
  IconListCheck,
  IconUsers,
  IconMessageChatbot,
  IconSearch,
} from "@tabler/icons-react";

const features = [
  {
    icon: IconFileText,
    title: "AI Transcript Generation",
    description:
      "Recordings are transcribed automatically in English and Urdu, with speaker labels and timestamps.",
  },
  {
    icon: IconSparkles,
    title: "Meeting Intelligence",
    description:
      "Every meeting gets an AI summary, the key decisions, and a category, generated the moment it ends.",
  },
  {
    icon: IconListCheck,
    title: "Action Items & Follow-ups",
    description:
      "Action items are pulled out and turned into follow-ups you can track and mark complete.",
  },
  {
    icon: IconUsers,
    title: "Attendance Reports",
    description:
      "Download a per-participant attendance PDF with join, leave, mic, and camera activity in one clean report.",
  },
  {
    icon: IconMessageChatbot,
    title: "Meeting-Aware RAG Chat",
    description:
      "Ask questions about any meeting and get answers grounded in its transcript, not generic guesses.",
  },
  {
    icon: IconSearch,
    title: "Cross-Meeting Search & Prep",
    description:
      "Search across every meeting at once, and get prep briefings drawn from your past conversations.",
  },
];

const FeatureGrid = () => {
  return (
    <section id="features" className="bg-surface py-24">
      <div className="max-w-7xl mx-auto px-6">
        {/* Heading */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-on-surface mb-4">
            Everything you need to run smarter meetings
          </h2>
          <p className="text-on-surface-variant text-base max-w-2xl mx-auto">
            Real AI working behind every call, from the first word to the
            follow-up.
          </p>
        </div>

        {/* Grid — 6 cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="bg-surface-container-lowest rounded-xl p-8 border border-outline-variant hover:-translate-y-1 transition-transform duration-300"
              >
                <div className="w-12 h-12 rounded-lg bg-primary-container/10 flex items-center justify-center mb-6 border border-primary-container/20">
                  <Icon
                    size={24}
                    className="text-primary-container"
                    stroke={1.5}
                  />
                </div>
                <h3 className="text-on-surface font-semibold text-lg mb-3">
                  {feature.title}
                </h3>
                <p className="text-on-surface-variant text-sm leading-relaxed">
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
