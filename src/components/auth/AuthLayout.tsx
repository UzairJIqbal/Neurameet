"use client";

import Image from "next/image";
import React from "react";

interface AuthLayoutProps {
  children: React.ReactNode;
  variant: "sign-in" | "sign-up";
}

const variantContent = {
  "sign-in": {
    testimonial: {
      quote:
        "NeuraMeet has completely transformed how our team handles meeting intelligence. The AI summaries are a game-changer.",
      name: "Sarah Jenkins",
      role: "CTO at TechFlow",
      avatar:
        "https://lh3.googleusercontent.com/aida-public/AB6AXuBd9LseWQtaP9gjxdjY1jh3GUPOyAnLdkkIkFQAM5wr87pIeogDJIvSZ11HylP3pUYPUgzWPMjOBu1Ztsoc5jfEPrCnnCJv7sqwDpFwiPe9ektuGZMqPAMbm68sRAQNuGZokCbnDenvZvwrQsRzfIh2Xz7Y9eXFdOieAcIOWjBLszi_Wbsvg9lJRzjG_nVGo76-NAx7vD9NuZBGDjtB4SXIf-AkzGwbG8DhR5vTbySEcYskhUTOPgNq-Q",
    },
  },
  "sign-up": {
    testimonial: {
      quote:
        "The automated action items are incredibly accurate. It feels like having a dedicated project manager in every call.",
      name: "David Chen",
      role: "VP Engineering at ScaleUp",
      avatar:
        "https://lh3.googleusercontent.com/aida-public/AB6AXuC1oLTOHTOXFnsez_UXTrta583MyRIZCCYynwRq6buRvk2DsH9YeOKT2vehnTNHn0Vw8aISEMfhIfX6k2-ri5w5YZzJhXdSiKs2vOMAvs9KkVf7KBl8XAIhzXmeZji_fXqvpFWiwpNzt-Fi-iyS9u61i4in8UcVQcvtKb4drzvyaAdAMYr36M6HV_xzKLx6TWgtmiK_JKqE0WAzRXBn8MhWVXRUGrzkaHUuY8jcjoSoDj8hMyioQ9Z0pQ",
    },
  },
} as const;

const AuthLayout = ({ children, variant }: AuthLayoutProps) => {
  const content = variantContent[variant];

  return (
    <div className="flex h-full w-full flex-col md:flex-row">
      {/* Left Panel: Form — bg-surface-container-lowest, 40% on desktop */}
      <div className="flex-1 md:flex-none md:w-[40%] bg-surface-container-lowest flex flex-col justify-center px-6 py-8 sm:px-10 md:px-10 md:py-8 relative z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div className="mx-auto w-full max-w-[400px]">{children}</div>
      </div>

      {/* Right Panel: Testimonial — bg-inverse-surface, 60% on desktop, hidden on mobile */}
      <div className="hidden md:flex flex-1 md:w-[60%] bg-inverse-surface relative items-center justify-center p-8 lg:p-10 overflow-hidden">
        {/* Abstract background blurs */}
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-20 pointer-events-none"
        >
          <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-primary-container rounded-full mix-blend-screen filter blur-[100px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-secondary rounded-full mix-blend-screen filter blur-[120px]" />
        </div>

        {/* Grid overlay */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />

        {/* Content */}
        <div className="relative z-10 max-w-2xl mx-auto flex flex-col items-start">
          {/* Quote icon */}
          <div className="mb-6 opacity-40">
            <svg
              aria-hidden="true"
              className="h-12 w-12 text-on-primary"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
            </svg>
          </div>

          {/* Quote text */}
          <blockquote className="mb-8">
            <p className="text-on-primary leading-tight font-semibold text-2xl md:text-3xl">
              &ldquo;{content.testimonial.quote}&rdquo;
            </p>
          </blockquote>

          {/* Attribution */}
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full overflow-hidden border border-outline-variant/30 bg-surface-variant/10 relative">
              <Image
                src={content.testimonial.avatar}
                alt={content.testimonial.name}
                fill
                sizes="48px"
                className="object-cover"
              />
            </div>
            <div>
              <div className="text-on-primary font-semibold">
                {content.testimonial.name}
              </div>
              <div className="text-secondary-fixed-dim text-sm">
                {content.testimonial.role}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
