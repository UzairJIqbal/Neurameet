"use client";

import React, { useState } from "react";
import Link from "next/link";
import { IconMenu2, IconX, IconWorld } from "@tabler/icons-react";

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Stack", href: "#stack" },
];

const LandingNav = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="fixed top-4 left-0 right-0 z-50 px-4">
      <div className="max-w-6xl mx-auto bg-surface-container-lowest/90 backdrop-blur rounded-full shadow-card px-5 py-2.5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <IconWorld
            size={26}
            className="text-primary-container"
            stroke={1.5}
          />
          <span className="text-on-surface font-semibold text-lg tracking-tight">
            NeuraMeet
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-on-surface-variant hover:text-on-surface transition-colors text-sm font-medium"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-4">
          <Link
            href="/sign-in"
            className="text-on-surface-variant hover:text-on-surface transition-colors text-sm font-medium"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="bg-inverse-surface text-inverse-on-surface rounded-full px-5 py-2 text-sm font-medium hover:bg-primary-container transition-colors"
          >
            Get Started
          </Link>
        </div>

        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden text-on-surface p-2"
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <IconX size={24} /> : <IconMenu2 size={24} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden max-w-6xl mx-auto mt-2 bg-surface-container-lowest rounded-card shadow-card">
          <div className="px-6 py-5 flex flex-col gap-4">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="text-on-surface-variant hover:text-on-surface transition-colors text-sm font-medium"
              >
                {link.label}
              </a>
            ))}
            <hr className="border-outline-variant" />
            <Link
              href="/sign-in"
              className="text-on-surface-variant hover:text-on-surface transition-colors text-sm font-medium"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="bg-inverse-surface text-inverse-on-surface rounded-full px-5 py-2.5 text-sm font-medium text-center"
            >
              Get Started
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
};

export default LandingNav;
