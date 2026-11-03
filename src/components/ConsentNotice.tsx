"use client";

import { useId } from "react";
import { ShieldCheck } from "lucide-react";
import { consentNoticeText } from "@/lib/consent";

type ConsentNoticeProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  // A member sees the project name; a guest is not a member and sees "this project".
  projectName?: string | null;
  disabled?: boolean;
};

/**
 * The recording notice shown before joining a project meeting (W3, AC-26,
 * AC-28, AC-29). The parent owns the tick, so it resets on every visit and the
 * Join button stays disabled until it is ticked. Same component in the member
 * and guest flows.
 */
export function ConsentNotice({
  checked,
  onChange,
  projectName,
  disabled,
}: ConsentNoticeProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-outline-variant bg-surface-container-low p-4 text-left">
      <div className="flex items-start gap-2">
        <ShieldCheck
          className="mt-0.5 h-5 w-5 shrink-0 text-primary"
          aria-hidden
        />
        <p className="text-sm text-on-surface-variant">
          {consentNoticeText(projectName)}
        </p>
      </div>
      <label
        htmlFor={id}
        className="flex items-center gap-2 text-body-md text-on-surface"
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-surface-variant text-primary-container focus:ring-primary-container"
        />
        I understand and want to join
      </label>
    </div>
  );
}
