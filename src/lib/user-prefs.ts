// Shared client-side user preferences backed by localStorage.
// Used by SettingsPage (writes) and UploadTranscriptModal (reads the gate).

export const PREFS_KEY = "neurameet:prefs";

export type UserPrefKey =
  "emailNotifications" | "aiAutoSummary" | "desktopReminders";

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

const SIDEBAR_COLLAPSED_KEY = "neurameet:sidebar-collapsed";
export const SIDEBAR_COLLAPSED_EVENT = "neurameet:sidebar-collapsed-changed";

/** AC-77a: the collapsed sidebar is one browser's choice, so a read can fail. */
export function readSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // ignore storage write failures
  }
  // The sidebar and the Settings toggle stay in step in this tab.
  window.dispatchEvent(new Event(SIDEBAR_COLLAPSED_EVENT));
}

export type ListView = "grid" | "list";

/** AC-77d, AC-70p: a Grid, Board, or List choice is one browser's, so a read can fail. */
export function readStoredView<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  try {
    const raw = window.localStorage.getItem(key);
    return allowed.includes(raw as T) ? (raw as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStoredView(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage write failures
  }
}
