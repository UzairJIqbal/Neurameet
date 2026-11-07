"use client";

import React from "react";
import {
  Brain,
  Code,
  Database,
  Folder,
  Globe,
  Rocket,
  Server,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PROJECT_STATUS_LABELS,
  ROLE_LABELS,
  type ProjectAvatar,
  type ProjectColor,
  type ProjectIcon,
  type ProjectRole,
  type ProjectStatus,
} from "@/lib/project-types";

export const PROJECT_ICON_MAP: Record<ProjectIcon, LucideIcon> = {
  folder: Folder,
  code: Code,
  smartphone: Smartphone,
  brain: Brain,
  server: Server,
  globe: Globe,
  rocket: Rocket,
  database: Database,
};

export const PROJECT_COLOR_CLASSES: Record<ProjectColor, string> = {
  primary: "bg-primary-container text-on-primary",
  secondary: "bg-secondary-container text-on-secondary-container",
  tertiary: "bg-tertiary-container text-on-primary",
  success: "bg-success text-on-success",
  warning: "bg-warning text-on-warning",
};

const STATUS_CHIP: Record<ProjectStatus, string> = {
  active: "bg-success-container text-on-success-container",
  planning: "bg-secondary-container text-on-secondary-container",
  on_hold: "bg-warning-container text-on-warning-container",
  completed: "bg-primary-container text-on-primary",
};

export const CHIP_CLASS =
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";

export const ProjectIconTile = ({
  icon,
  color,
  size = "md",
}: {
  icon: ProjectIcon;
  color: ProjectColor;
  size?: "md" | "lg";
}) => {
  const Icon = PROJECT_ICON_MAP[icon];
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg",
        size === "lg" ? "h-14 w-14" : "h-10 w-10",
        PROJECT_COLOR_CLASSES[color],
      )}
    >
      <Icon className={size === "lg" ? "h-7 w-7" : "h-5 w-5"} aria-hidden />
    </span>
  );
};

export const ProjectStatusChip = ({ status }: { status: ProjectStatus }) => (
  <span className={cn(CHIP_CLASS, STATUS_CHIP[status])}>
    {PROJECT_STATUS_LABELS[status]}
  </span>
);

export const ProjectRoleChip = ({ role }: { role: ProjectRole }) => (
  <span
    className={cn(CHIP_CLASS, "bg-surface-container text-on-surface-variant")}
  >
    {ROLE_LABELS[role]}
  </span>
);

const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");

export const MemberAvatar = ({
  name,
  imageUrl,
  className,
}: ProjectAvatar & { className?: string }) =>
  imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl}
      alt=""
      title={name}
      className={cn(
        "h-7 w-7 shrink-0 rounded-full border-2 border-surface-container-lowest object-cover",
        className,
      )}
    />
  ) : (
    <span
      title={name}
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-surface-container-lowest bg-secondary-container text-xs font-medium text-on-secondary-container",
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );

/** Up to 5 avatars, then +N for the members not shown. */
export const AvatarStack = ({
  avatars,
  total,
}: {
  avatars: ProjectAvatar[];
  total: number;
}) => {
  const extra = total - avatars.length;
  return (
    <div className="flex items-center">
      {avatars.map((avatar, index) => (
        <MemberAvatar
          key={`${avatar.name}-${index}`}
          {...avatar}
          className={index > 0 ? "-ml-2" : undefined}
        />
      ))}
      {extra > 0 && (
        <span className="ml-1 text-xs text-on-surface-variant">+{extra}</span>
      )}
    </div>
  );
};
