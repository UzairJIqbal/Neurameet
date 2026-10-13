"use client";

import React from "react";
import {
  IconWorld,
  IconBrandTwitter,
  IconBrandLinkedin,
  IconBrandGithub,
} from "@tabler/icons-react";

type FooterLink = {
  label: string;
  /** Present only when the destination exists in the app (real route or landing section). */
  href?: string;
  /** True when `href` resolves to a real destination. When false, the item renders as muted, non-clickable text. */
  active?: boolean;
};

const footerColumns: { title: string; links: FooterLink[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#features", active: true },
      { label: "How it works", href: "#how-it-works", active: true },
      { label: "Stack", href: "#stack", active: true },
      { label: "Pricing", active: false },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Documentation", active: false },
      { label: "API Reference", active: false },
      { label: "Blog", active: false },
      { label: "Community", active: false },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", active: false },
      { label: "Careers", active: false },
      { label: "Contact", active: false },
      { label: "Partners", active: false },
    ],
  },
];

const socialLinks: { label: string; Icon: typeof IconWorld }[] = [
  { label: "Twitter", Icon: IconBrandTwitter },
  { label: "LinkedIn", Icon: IconBrandLinkedin },
  { label: "GitHub", Icon: IconBrandGithub },
];

const legalLinks: FooterLink[] = [
  { label: "Privacy Policy", active: false },
  { label: "Terms of Service", active: false },
];

const LandingFooter = () => {
  return (
    <footer className="bg-surface pt-20 pb-10 border-t border-outline-variant">
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
              <span className="text-on-surface font-bold text-lg tracking-tight">
                NeuraMeet
              </span>
            </div>
            <p className="text-on-surface-variant text-sm max-w-sm mb-6">
              AI-powered meeting intelligence for modern teams. Capture,
              analyze, and act on every conversation.
            </p>
            <div className="flex gap-4">
              {socialLinks.map(({ label, Icon }) => (
                <span
                  key={label}
                  role="img"
                  aria-label={label}
                  title="Coming soon"
                  className="text-on-surface-variant cursor-default"
                >
                  <Icon size={18} />
                </span>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {footerColumns.map((col) => (
            <div key={col.title}>
              <h4 className="text-on-surface text-sm font-semibold mb-4">
                {col.title}
              </h4>
              <ul className="space-y-3">
                {col.links.map((link) =>
                  link.active && link.href ? (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-on-surface-variant hover:text-on-surface transition-colors text-sm"
                      >
                        {link.label}
                      </a>
                    </li>
                  ) : (
                    <li key={link.label}>
                      <span
                        aria-disabled="true"
                        title="Coming soon"
                        className="text-on-surface-variant text-sm cursor-default inline-flex items-center gap-1.5"
                      >
                        {link.label}
                        <span className="text-[10px] uppercase tracking-wide text-on-surface-variant/60">
                          Soon
                        </span>
                      </span>
                    </li>
                  )
                )}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom row */}
        <div className="flex flex-col md:flex-row justify-between items-center text-on-surface-variant text-sm border-t border-outline-variant pt-8">
          <p>&copy; 2026 NeuraMeet Inc. All rights reserved.</p>
          <div className="flex gap-6 mt-4 md:mt-0">
            {legalLinks.map((link) =>
              link.active && link.href ? (
                <a
                  key={link.label}
                  href={link.href}
                  className="hover:text-on-surface transition-colors"
                >
                  {link.label}
                </a>
              ) : (
                <span
                  key={link.label}
                  aria-disabled="true"
                  title="Coming soon"
                  className="text-on-surface-variant cursor-default inline-flex items-center gap-1.5"
                >
                  {link.label}
                  <span className="text-[10px] uppercase tracking-wide text-on-surface-variant/60">
                    Soon
                  </span>
                </span>
              )
            )}
          </div>
        </div>
      </div>
    </footer>
  );
};

export default LandingFooter;
