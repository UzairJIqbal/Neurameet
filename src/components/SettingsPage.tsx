/* eslint-disable prettier/prettier */
"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import toast from "react-hot-toast";
import ConnectedAccounts from "@/components/settings/ConnectedAccounts";
import {
  PREFS_KEY,
  readSidebarCollapsed,
  SIDEBAR_COLLAPSED_EVENT,
  writeSidebarCollapsed,
  type UserPrefKey,
} from "@/lib/user-prefs";

type PrefKey = UserPrefKey;

const TABS = [
  { key: "account", label: "Account" },
  { key: "notifications", label: "Notifications" },
  { key: "appearance", label: "Appearance" },
  { key: "connected", label: "Connected Accounts" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const tabFrom = (value: string | null): TabKey =>
  TABS.find((t) => t.key === value)?.key ?? "account";

const CARD =
  "rounded-xl border border-surface-variant bg-surface-container-lowest shadow-card";

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
        checked
          ? "translate-x-5 bg-on-primary"
          : "translate-x-0.5 bg-on-surface-variant"
      }`}
    />
  </button>
);

const SettingRow = ({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) => (
  <div className="flex items-center justify-between gap-4 px-6 py-4">
    <div className="min-w-0">
      <p className="font-body-md font-medium text-on-surface">{label}</p>
      <p className="text-body-md text-on-surface-variant">{hint}</p>
    </div>
    {children}
  </div>
);

const AppearancePanel = () => {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const sync = () => setCollapsed(readSidebarCollapsed());
    sync();
    window.addEventListener(SIDEBAR_COLLAPSED_EVENT, sync);
    return () => window.removeEventListener(SIDEBAR_COLLAPSED_EVENT, sync);
  }, []);

  return (
    <div className={CARD}>
      <SettingRow
        label="Start with the sidebar collapsed"
        hint="Saved in this browser."
      >
        <Toggle
          label="Start with the sidebar collapsed"
          checked={collapsed}
          onChange={writeSidebarCollapsed}
        />
      </SettingRow>
    </div>
  );
};

const SettingsContent = () => {
  const { user } = useUser();
  const router = useRouter();
  const tab = tabFrom(useSearchParams().get("tab"));
  const [digestEmails, setDigestEmails] = useState(true);
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

  // AC-75: the server value wins once loaded; a failed read keeps the local one.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/settings/notifications");
        if (!res.ok || cancelled) return;
        const { emailNotifications, digestEmails: digest } =
          (await res.json()) as {
            emailNotifications: boolean;
            digestEmails: boolean;
          };
        if (!cancelled) {
          setPrefs((prev) => ({ ...prev, emailNotifications }));
          setDigestEmails(digest);
        }
      } catch {
        // keep the local value
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveEmailPref = async (value: boolean) => {
    try {
      const res = await fetch("/api/settings/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailNotifications: value }),
      });
      if (!res.ok) throw new Error("save failed");
    } catch {
      toast.error("Couldn't save that setting. Try again.");
    }
  };

  // The digest has no local copy, so a failed save goes back to what it was.
  const saveDigest = async (value: boolean) => {
    setDigestEmails(value);
    try {
      const res = await fetch("/api/settings/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ digestEmails: value }),
      });
      if (!res.ok) throw new Error("save failed");
    } catch {
      setDigestEmails(!value);
      toast.error("Couldn't save that setting. Try again.");
    }
  };

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

    if (key === "emailNotifications") void saveEmailPref(value);

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
  const email = user?.primaryEmailAddress?.emailAddress ?? "no email on file";
  const avatar = user?.imageUrl;

  return (
    <section className="flex w-full flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg">
          Settings
        </h1>
        <p className="text-body-md text-on-surface-variant">
          Manage your account, notifications and connected services.
        </p>
      </header>

      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <div
          role="tablist"
          aria-label="Settings sections"
          className="flex shrink-0 gap-1 overflow-x-auto md:w-56 md:flex-col"
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`settings-tab-${t.key}`}
              aria-selected={tab === t.key}
              aria-controls="settings-panel"
              onClick={() =>
                router.replace(`/settings?tab=${t.key}`, { scroll: false })
              }
              className={`shrink-0 rounded-lg px-3 py-2 text-left text-body-md font-medium transition-colors ${
                tab === t.key
                  ? "bg-primary-container text-on-primary"
                  : "text-on-surface-variant hover:bg-surface-container-low"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div
          id="settings-panel"
          role="tabpanel"
          aria-labelledby={`settings-tab-${tab}`}
          className="flex min-w-0 flex-1 flex-col gap-6"
        >
          {tab === "account" && (
            <>
              <div className={`${CARD} p-6`}>
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
              <div className={`${CARD} divide-y divide-surface-variant`}>
                <SettingRow
                  label="Password"
                  hint="Change your password or sign in options."
                >
                  <Link
                    href="/profile#/security"
                    className="shrink-0 text-body-md font-medium text-primary-container hover:underline"
                  >
                    Manage password
                  </Link>
                </SettingRow>
                <SettingRow
                  label="Daily digest"
                  hint="A daily email with your due tasks and unread notices."
                >
                  <Toggle
                    label="Daily digest"
                    checked={digestEmails}
                    onChange={(next) => void saveDigest(next)}
                  />
                </SettingRow>
              </div>
            </>
          )}

          {tab === "notifications" && (
            <div className={`${CARD} divide-y divide-surface-variant`}>
              {PREFERENCES.map((p) => (
                <SettingRow key={p.key} label={p.label} hint={p.hint}>
                  <Toggle
                    label={p.label}
                    checked={prefs[p.key]}
                    onChange={(next) => setPref(p.key, next)}
                  />
                </SettingRow>
              ))}
            </div>
          )}

          {tab === "appearance" && <AppearancePanel />}
          {tab === "connected" && <ConnectedAccounts />}
        </div>
      </div>
    </section>
  );
};

// useSearchParams needs a boundary, and the tab must follow the header menu
// while you are already on this page.
const SettingsPage = () => (
  <Suspense fallback={null}>
    <SettingsContent />
  </Suspense>
);

export default SettingsPage;
