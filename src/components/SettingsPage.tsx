/* eslint-disable prettier/prettier */
"use client";

import React, { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import toast from "react-hot-toast";
import { PREFS_KEY, type UserPrefKey } from "@/lib/user-prefs";

type PrefKey = UserPrefKey;

const PREFERENCES: Array<{
  key: PrefKey;
  label: string;
  hint: string;
}> = [
  {
    key: "emailNotifications",
    label: "Email notifications",
    hint: "Get emailed when a meeting finishes processing.",
  },
  {
    key: "aiAutoSummary",
    label: "AI auto-summary on upload",
    hint: "Generate summary, action items and category after each upload.",
  },
  {
    key: "desktopReminders",
    label: "Desktop reminders",
    hint: "Browser reminders for upcoming scheduled meetings.",
  },
];

const Toggle = ({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
      checked ? "bg-primary-container" : "bg-surface-container"
    }`}
  >
    <span
      className={`inline-block h-5 w-5 transform rounded-full transition-transform ${
        checked ? "translate-x-5 bg-on-primary" : "translate-x-0.5 bg-on-surface-variant"
      }`}
    />
  </button>
);

const SettingsPage = () => {
  const { user } = useUser();
  const [prefs, setPrefs] = useState<Record<PrefKey, boolean>>({
    emailNotifications: true,
    aiAutoSummary: true,
    desktopReminders: false,
  });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PREFS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Record<PrefKey, boolean>>;
        setPrefs((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // ignore malformed storage — fall back to defaults
    } finally {
      setHydrated(true);
    }
  }, []);

  const setPref = (key: PrefKey, value: boolean) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      if (hydrated) {
        try {
          window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
        } catch {
          // ignore storage write failures
        }
      }
      return next;
    });

    // Side-effect scoped to the desktop-reminders toggle only.
    if (key === "desktopReminders" && value) {
      void requestReminderPermission();
    }
  };

  // Requests Notification permission on the user's toggle gesture. The pref is
  // always written regardless (intent is kept even if unsupported/denied);
  // ReminderManager stays silent until permission is granted.
  const requestReminderPermission = async () => {
    if (typeof Notification === "undefined") {
      toast.error("Desktop notifications aren't supported in this browser.");
      return;
    }
    if (Notification.permission === "denied") {
      toast.error(
        "Notifications are blocked for this site. Enable them in your browser's site settings (click the icon in the address bar) to get reminders.",
      );
      return;
    }
    if (Notification.permission === "default") {
      try {
        const res = await Notification.requestPermission();
        if (res === "denied") {
          toast.error(
            "Notifications are blocked for this site. Enable them in your browser's site settings (click the icon in the address bar) to get reminders.",
          );
        } else if (res !== "granted") {
          toast(
            "Reminders need notification permission — enable it in your browser settings.",
          );
        }
      } catch {
        toast("Couldn't request notification permission.");
      }
    }
    // Already "granted" → nothing extra; reminders start immediately.
  };

  const fullName = user?.fullName ?? "NeuraMeet User";
  const email =
    user?.primaryEmailAddress?.emailAddress ?? "no email on file";
  const avatar = user?.imageUrl;

  return (
    <section className="flex w-full flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg">
          Settings
        </h1>
        <p className="text-body-md text-on-surface-variant">
          Manage your account and preferences
        </p>
      </header>

      {/* Account card */}
      <div className="rounded-xl border border-surface-variant bg-surface-container-lowest p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <h2 className="text-headline-sm font-semibold text-on-surface">
          Account
        </h2>
        <div className="mt-4 flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={avatar ?? "/icons/images/Uzair Javaid.png"}
            alt={fullName}
            className="h-12 w-12 shrink-0 rounded-full object-cover"
          />
          <div className="min-w-0">
            <p className="truncate font-body-md font-medium text-on-surface">
              {fullName}
            </p>
            <p className="truncate text-body-md text-on-surface-variant">
              {email}
            </p>
          </div>
        </div>
      </div>

      {/* Preferences card */}
      <div className="overflow-hidden rounded-xl border border-surface-variant bg-surface-container-lowest shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <div className="border-b border-surface-variant px-6 py-4">
          <h2 className="text-headline-sm font-semibold text-on-surface">
            Preferences
          </h2>
        </div>
        <div className="divide-y divide-surface-variant">
          {PREFERENCES.map((p) => (
            <div
              key={p.key}
              className="flex items-center justify-between gap-4 px-6 py-4"
            >
              <div className="min-w-0">
                <p className="font-body-md font-medium text-on-surface">
                  {p.label}
                </p>
                <p className="text-body-md text-on-surface-variant">
                  {p.hint}
                </p>
              </div>
              <Toggle
                label={p.label}
                checked={prefs[p.key]}
                onChange={(next) => setPref(p.key, next)}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default SettingsPage;
