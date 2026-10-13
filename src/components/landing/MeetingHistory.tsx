"use client";

import React from "react";
import { IconSearch, IconFilter, IconBulb } from "@tabler/icons-react";

const bullets = [
  {
    icon: IconSearch,
    title: "Universal Search",
    description:
      "Find specific decisions, quotes, or action items across all your meetings instantly.",
  },
  {
    icon: IconFilter,
    title: "Smart Filtering",
    description:
      "Filter by date, participants, project tags, or meeting type (e.g., standup, client call).",
  },
  {
    icon: IconBulb,
    title: "Instant Insights",
    description:
      "Jump straight to the AI-generated summaries and decisions without watching the whole recording.",
  },
];

const MeetingHistory = () => {
  return (
    <section className="bg-surface py-24 border-t border-outline-variant">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col-reverse lg:flex-row items-center gap-16">
          {/* Left — text */}
          <div className="lg:w-1/3">
            <h2 className="text-3xl font-bold text-on-surface mb-6">
              Your meeting history, organized and searchable
            </h2>
            <p className="text-on-surface-variant text-lg mb-8 leading-relaxed">
              Never lose context again. NeuraMeet automatically organizes all
              your meeting intelligence into a central, secure repository.
            </p>
            <ul className="space-y-6">
              {bullets.map((b) => {
                const Icon = b.icon;
                return (
                  <li key={b.title}>
                    <h4 className="text-on-surface font-semibold mb-2 flex items-center gap-2">
                      <Icon
                        size={16}
                        className="text-primary-container"
                        stroke={2}
                      />
                      {b.title}
                    </h4>
                    <p className="text-on-surface-variant text-sm">
                      {b.description}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Right — light-themed browser mockup */}
          <div className="lg:w-2/3 w-full">
            <div className="bg-surface-container-low rounded-xl p-2 relative border border-outline-variant">
              {/* Browser chrome */}
              <div className="h-8 bg-surface-container rounded-t-lg border-b border-outline-variant flex items-center px-4 gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-error/80" />
                <div className="w-2.5 h-2.5 rounded-full bg-outline-variant" />
                <div className="w-2.5 h-2.5 rounded-full bg-secondary-container" />
              </div>
              {/* Light content area */}
              <div className="bg-surface-container-lowest text-on-surface rounded-b-lg overflow-hidden shadow-lg border border-outline-variant">
                <div className="p-6">
                  <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
                    <h3 className="text-xl font-bold text-on-surface">
                      Meeting Intelligence
                    </h3>
                    <div className="flex gap-2">
                      <div className="bg-surface-container-low px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm text-on-surface-variant border border-outline-variant">
                        <IconSearch size={14} />
                        Search meetings...
                      </div>
                      <div className="bg-surface-container-low px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm text-on-surface-variant border border-outline-variant">
                        <IconFilter size={14} />
                        Filter
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    {[
                      {
                        label: "Sprint Planning",
                        date: "Jul 29, 2024",
                        color: "bg-primary-container/20 text-primary-container",
                      },
                      {
                        label: "Client Discussion",
                        date: "Jul 28, 2024",
                        color: "bg-secondary-container text-on-secondary-container",
                      },
                      {
                        label: "Weekly Standup",
                        date: "Jul 26, 2024",
                        color: "bg-primary-container/15 text-primary-container",
                      },
                    ].map((row) => (
                      <div
                        key={row.label}
                        className="flex justify-between items-center p-4 border border-outline-variant rounded-lg hover:bg-surface-container-low"
                      >
                        <div className="flex items-center gap-4">
                          <div
                            className={`w-8 h-8 rounded ${row.color} flex items-center justify-center`}
                          >
                            <IconSearch size={14} />
                          </div>
                          <span className="font-medium text-on-surface">
                            {row.label}
                          </span>
                        </div>
                        <div className="text-on-surface-variant text-sm">
                          {row.date}
                        </div>
                        <div className="text-primary-container text-sm font-medium flex items-center gap-1">
                          Open Insights
                          <IconSearch size={12} />
                        </div>
                      </div>
                    ))}
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

export default MeetingHistory;
