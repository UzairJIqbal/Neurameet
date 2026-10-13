"use client";

import React from "react";
import {
  IconVideo,
  IconSparkles,
  IconSearch,
} from "@tabler/icons-react";

interface AuthLayoutProps {
  children: React.ReactNode;
  variant: "sign-in" | "sign-up";
}

interface WalkthroughStep {
  icon: typeof IconVideo;
  title: string;
  description: string;
}

interface AuthVariantContent {
  heading: string;
  sub: string;
  steps: WalkthroughStep[];
}

const steps: WalkthroughStep[] = [
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

const variantContent: Record<"sign-in" | "sign-up", AuthVariantContent> = {
  "sign-up": {
    heading: "From call to clarity in three steps",
    sub: "No manual note taking. NeuraMeet does the work the moment the call ends.",
    steps,
  },
  "sign-in": {
    heading: "Welcome back",
    sub: "Your meetings, notes, and follow-ups are right where you left them.",
    steps,
  },
};

const AuthLayout = ({ children, variant }: AuthLayoutProps) => {
  const content = variantContent[variant];

  return (
    <div className="flex min-h-screen w-full flex-col md:flex-row">
      {/* Left Panel: Form — bg-surface-container-lowest, 40% on desktop */}
      <div className="flex-1 md:flex-none md:w-[40%] bg-surface-container-lowest flex flex-col justify-center px-6 py-8 sm:px-10 md:px-10 md:py-8 relative z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div className="mx-auto w-full max-w-[400px]">{children}</div>
      </div>

      {/* Right Panel: Walkthrough — bg-inverse-surface, 60% on desktop, hidden on mobile */}
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
          {/* Heading + sub */}
          <h2 className="text-on-primary font-semibold text-2xl md:text-3xl leading-tight">
            {content.heading}
          </h2>
          <p className="text-inverse-on-surface/70 text-base mt-3 max-w-xl">
            {content.sub}
          </p>

          {/* Three-step visual walkthrough */}
          <div className="flex flex-col gap-8 mt-10 w-full">
            {content.steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="flex gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary-container/10 border border-primary-container/20 flex items-center justify-center shrink-0">
                    <Icon
                      size={24}
                      className="text-primary-container"
                      stroke={1.5}
                    />
                  </div>
                  <div className="flex-1">
                    <div className="text-primary-container font-bold text-sm">
                      0{i + 1}
                    </div>
                    <h3 className="text-on-primary font-semibold text-lg leading-snug">
                      {step.title}
                    </h3>
                    <p className="text-inverse-on-surface/70 text-sm leading-relaxed mt-1">
                      {step.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
