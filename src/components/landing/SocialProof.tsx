"use client";

import React from "react";

const testimonials = [
  {
    quote:
      "NeuraMeet completely changed how we handle remote standups. We save hours every week.",
    name: "Sarah Jenkins",
    role: "CTO, TechFlow",
  },
  {
    quote:
      "The automated action items are incredibly accurate. It feels like having a dedicated project manager in every call.",
    name: "David Chen",
    role: "VP Engineering, ScaleUp",
  },
  {
    quote:
      "Security was our main concern, but their enterprise features and on-prem options gave us total peace of mind.",
    name: "Elena Rodriguez",
    role: "CISO, GlobalData",
  },
  {
    quote:
      "Integrating it into our existing workflow took minutes. The API is beautifully designed and documented.",
    name: "Michael Chang",
    role: "Lead Developer, Nexus",
  },
];

const SocialProof = () => {
  return (
    <section className="bg-inverse-surface py-24 border-t border-inverse-on-surface/10">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-inverse-on-surface mb-4">
            Trusted by innovative teams
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {testimonials.map((t) => (
            <div
              key={t.name}
              className="bg-inverse-on-surface/5 rounded-xl p-6 border border-inverse-on-surface/10 flex flex-col justify-between"
            >
              <p className="text-inverse-on-surface/70 text-sm leading-relaxed mb-6">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-container/20" />
                <div>
                  <div className="text-inverse-on-surface text-sm font-semibold">
                    {t.name}
                  </div>
                  <div className="text-inverse-on-surface/70 text-xs">
                    {t.role}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default SocialProof;
