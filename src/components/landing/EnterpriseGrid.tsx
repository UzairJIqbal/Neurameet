"use client";

import React from "react";
import { IconVideo, IconSparkles, IconDatabase, IconShieldCheck } from "@tabler/icons-react";

const items = [
  {
    icon: IconVideo,
    title: "Stream",
    description: "Real-time video meetings, recording, and reactions.",
  },
  {
    icon: IconSparkles,
    title: "Gemini + Groq",
    description: "Speech-to-text and AI summarization on the free tier.",
  },
  {
    icon: IconDatabase,
    title: "Supabase + pgvector",
    description: "Your meeting data and vector search, in Postgres.",
  },
  {
    icon: IconShieldCheck,
    title: "Clerk",
    description: "Secure authentication and user management.",
  },
];

const EnterpriseGrid = () => {
  return (
    <section id="stack" className="bg-surface py-24 border-t border-outline-variant">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-on-surface mb-4">
            A modern stack you can trust
          </h2>
          <p className="text-on-surface-variant text-base max-w-2xl mx-auto">
            Every part of NeuraMeet is built on proven, free-tier infrastructure.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="bg-surface-container-lowest rounded-xl p-6 border border-outline-variant flex items-start gap-4"
              >
                <Icon
                  size={24}
                  className="text-primary-container flex-shrink-0"
                  stroke={1.5}
                />
                <div>
                  <h4 className="text-on-surface font-semibold text-base mb-1">
                    {item.title}
                  </h4>
                  <p className="text-on-surface-variant text-sm">
                    {item.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default EnterpriseGrid;
