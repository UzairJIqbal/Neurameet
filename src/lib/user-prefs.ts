// Shared client-side user preferences backed by localStorage.
// Used by SettingsPage (writes) and UploadTranscriptModal (reads the gate).

export const PREFS_KEY = "neurameet:prefs";

export type UserPrefKey =
  | "emailNotifications"
  | "aiAutoSummary"
  | "desktopReminders";

export type UserPrefs = Record<UserPrefKey, boolean>;

export const DEFAULT_PREFS: UserPrefs = {
  emailNotifications: true,
  aiAutoSummary: true,
  desktopReminders: false,
};

export function readUserPrefs(): UserPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_PREFS };
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<UserPrefs>;
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function writeUserPrefs(prefs: UserPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore storage write failures — preferences are non-critical
  }
}
