"use client";

import React from "react";

export type AdmissionChoice = "open" | "approval";

const OPTIONS: { value: AdmissionChoice; label: string }[] = [
  { value: "approval", label: "Approval required" },
  { value: "open", label: "Anyone can join" },
];

const HINT: Record<AdmissionChoice, string> = {
  approval: "Guests wait until you let them in.",
  open: "Guests with the link enter straight away, without asking you.",
};

export function GuestAdmissionToggle({
  value,
  onChange,
  centered = false,
}: {
  value: AdmissionChoice;
  onChange: (next: AdmissionChoice) => void;
  centered?: boolean;
}) {
  const align = centered ? "items-center text-center" : "items-start";
  return (
    <div className={`flex flex-col gap-2 ${align}`}>
      <span className="text-base font-normal leading-[22.4px] text-on-surface-variant">
        Guest Admission
      </span>
      <div className="flex gap-2" role="group" aria-label="Guest admission">
        {OPTIONS.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={`rounded-lg px-4 py-2 text-body-md font-medium transition-colors ${
                selected
                  ? "bg-primary-container text-on-primary"
                  : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <p
        className={`text-body-sm ${
          value === "open" ? "text-error" : "text-on-surface-variant"
        }`}
      >
        {HINT[value]}
      </p>
    </div>
  );
}
