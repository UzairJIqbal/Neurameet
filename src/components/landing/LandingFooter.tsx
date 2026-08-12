"use client";

import React from "react";
import Link from "next/link";
import {
  IconWorld,
  IconBrandTwitter,
  IconBrandLinkedin,
  IconBrandGithub,
} from "@tabler/icons-react";

const footerColumns = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "Integrations", href: "#" },
      { label: "Pricing", href: "#pricing" },
      { label: "Changelog", href: "#" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Documentation", href: "#" },
      { label: "API Reference", href: "#" },
      { label: "Blog", href: "#" },
      { label: "Community", href: "#" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Contact", href: "#" },
      { label: "Partners", href: "#" },
    ],
  },
];

const LandingFooter = () => {
  return (
    <footer className="bg-inverse-surface pt-20 pb-10 border-t border-inverse-on-surface/10">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-16">
          {/* Logo + description */}
          <div className="col-span-2">
            <div className="flex items-center gap-2 mb-6">
              <IconWorld
                size={28}
                className="text-primary-container"
                stroke={1.5}
              />
              <span className="text-inverse-on-surface font-bold text-lg tracking-tight">
                NeuraMeet
              </span>
            </div>
            <p className="text-inverse-on-surface/70 text-sm max-w-sm mb-6">
              AI-powered meeting intelligence for modern teams. Capture,
              analyze, and act on every conversation.
            </p>
            <div className="flex gap-4">
              <a
                href="#"
                className="text-inverse-on-surface/70 hover:text-inverse-on-surface transition-colors"
                aria-label="Twitter"
              >
                <IconBrandTwitter size={18} />
              </a>
              <a
                href="#"
                className="text-inverse-on-surface/70 hover:text-inverse-on-surface transition-colors"
                aria-label="LinkedIn"
              >
                <IconBrandLinkedin size={18} />
              </a>
              <a
                href="#"
                className="text-inverse-on-surface/70 hover:text-inverse-on-surface transition-colors"
                aria-label="GitHub"
              >
                <IconBrandGithub size={18} />
              </a>
            </div>
          </div>

          {/* Link columns */}
          {footerColumns.map((col) => (
            <div key={col.title}>
              <h4 className="text-inverse-on-surface text-sm font-semibold mb-4">
                {col.title}
              </h4>
              <ul className="space-y-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-inverse-on-surface/70 hover:text-inverse-on-surface transition-colors text-sm"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom row */}
        <div className="flex flex-col md:flex-row justify-between items-center text-inverse-on-surface/70 text-sm border-t border-inverse-on-surface/10 pt-8">
          <p>&copy; 2024 NeuraMeet Inc. All rights reserved.</p>
          <div className="flex gap-6 mt-4 md:mt-0">
            <a
              href="#"
              className="hover:text-inverse-on-surface transition-colors"
            >
              Privacy Policy
            </a>
            <a
              href="#"
              className="hover:text-inverse-on-surface transition-colors"
            >
              Terms of Service
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default LandingFooter;
