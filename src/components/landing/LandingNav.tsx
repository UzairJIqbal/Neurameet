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
    <nav className="fixed top-0 left-0 right-0 z-50 bg-surface-container-lowest border-b border-outline-variant">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <IconWorld
            size={28}
            className="text-primary-container"
            stroke={1.5}
          />
          <span className="text-on-surface font-bold text-lg tracking-tight">
            NeuraMeet
          </span>
        </Link>

        {/* Desktop Nav */}
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

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-4">
          <Link
            href="/sign-in"
            className="text-on-surface-variant hover:text-on-surface transition-colors text-sm font-medium"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="bg-primary-container text-on-primary rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-primary transition-colors"
          >
            Get Started
          </Link>
        </div>

        {/* Mobile Toggle */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden text-on-surface p-2"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <IconX size={24} /> : <IconMenu2 size={24} />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="md:hidden bg-surface-container-lowest border-t border-outline-variant">
          <div className="px-6 py-4 flex flex-col gap-4">
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
              className="bg-primary-container text-on-primary rounded-xl px-5 py-2.5 text-sm font-medium text-center hover:bg-primary transition-colors"
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
