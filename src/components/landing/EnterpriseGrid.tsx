"use client";

import React from "react";
import {
  IconShield,
  IconCloud,
  IconGlobe,
  IconPuzzle,
  IconCode,
  IconUsers,
} from "@tabler/icons-react";

const items = [
  {
    icon: IconShield,
    title: "Enterprise Security",
    description:
      "SOC2 Type II certified. Data encrypted at rest and in transit.",
  },
  {
    icon: IconCloud,
    title: "99.9% Uptime",
    description: "High availability architecture backed by enterprise SLAs.",
  },
  {
    icon: IconGlobe,
    title: "Global Edge Network",
    description: "Low latency processing nodes deployed worldwide.",
  },
  {
    icon: IconPuzzle,
    title: "Custom Integrations",
    description: "Connect with Slack, Jira, Notion, and 50+ other tools.",
  },
  {
    icon: IconCode,
    title: "Developer APIs",
    description: "Comprehensive REST APIs and webhooks for custom workflows.",
  },
  {
    icon: IconUsers,
    title: "Team Management",
    description: "Granular RBAC, SSO integration, and detailed audit logs.",
  },
];

const EnterpriseGrid = () => {
  return (
    <section className="bg-inverse-surface py-24 border-t border-inverse-on-surface/10">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-inverse-on-surface mb-4">
            Enterprise-grade infrastructure
          </h2>
          <p className="text-inverse-on-surface/70 text-base max-w-2xl mx-auto">
            Built to scale with your organization, securely and reliably.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="bg-inverse-on-surface/5 rounded-xl p-6 border border-inverse-on-surface/10 flex items-start gap-4"
              >
                <Icon
                  size={24}
                  className="text-primary-container flex-shrink-0"
                  stroke={1.5}
                />
                <div>
                  <h4 className="text-inverse-on-surface font-semibold text-base mb-1">
                    {item.title}
                  </h4>
                  <p className="text-inverse-on-surface/70 text-sm">
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
