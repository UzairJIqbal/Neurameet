"use client";

import React from "react";
import { IconVideo, IconSparkles, IconSearch } from "@tabler/icons-react";

const steps = [
  {
    icon: IconVideo,
    title: "Host or join a meeting",
    description:
      "Start a call in NeuraMeet or join with a link. Video runs on Stream's real-time infrastructure.",
  },
  {
    icon: IconSparkles,
    title: "We process it automatically",
    description:
      "Groq Whisper transcribes the audio in English and Urdu; Gemini and Groq generate the summary, action items, and category.",
  },
  {
    icon: IconSearch,
    title: "Explore and act",
    description:
      "Browse a searchable history, download attendance, track follow-ups, and chat with any meeting's content.",
  },
];

const SocialProof = () => {
  return (
    <section id="how-it-works" className="scroll-mt-20 bg-surface py-24 border-t border-outline-variant">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-on-surface mb-4">
            From call to clarity in three steps
          </h2>
          <p className="text-on-surface-variant text-base max-w-2xl mx-auto">
            No manual note taking. NeuraMeet does the work the moment the call
            ends.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <div
                key={step.title}
                className="bg-surface-container-lowest rounded-xl p-8 border border-outline-variant"
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-lg bg-primary-container/10 flex items-center justify-center border border-primary-container/20">
                    <Icon
                      size={24}
                      className="text-primary-container"
                      stroke={1.5}
                    />
                  </div>
                  <span className="text-primary-container font-bold text-lg">
                    0{i + 1}
                  </span>
                </div>
                <h3 className="text-on-surface font-semibold text-lg mb-3">
                  {step.title}
                </h3>
                <p className="text-on-surface-variant text-sm leading-relaxed">
                  {step.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default SocialProof;
