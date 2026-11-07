// AC-77e: the header's trail, worked out from the path alone. A page deeper than
// its section can name itself through `detail`, such as a project's name.

export type Crumb = { label: string; href?: string };

const SECTIONS: Record<string, string> = {
  dashboard: "My Dashboard",
  "my-tasks": "My Tasks",
  "meeting-intelligence": "My Meetings",
  projects: "My Projects",
  notifications: "Notifications",
  "ai-chat": "AI Assistant",
  "follow-ups": "Follow-ups",
  "personal-room": "Personal Room",
  settings: "Settings",
  profile: "My Profile",
  recording: "Recordings",
  previous: "Previous Meetings",
  upcoming: "Upcoming Meetings",
  prep: "Prep",
  search: "Search",
  "join-meeting": "Join Meeting",
  invite: "Invitation",
};

export function breadcrumbsFor(
  pathname: string,
  detail?: string | null,
): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  const first = segments[0];
  if (!first) return [{ label: "My Dashboard" }];
  const section = SECTIONS[first] ?? "NeuraMeet";
  if (segments.length === 1 || first === "invite") return [{ label: section }];
  return [
    { label: section, href: `/${first}` },
    { label: detail || "Details" },
  ];
}
