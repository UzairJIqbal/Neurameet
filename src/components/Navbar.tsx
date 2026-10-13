/* eslint-disable prettier/prettier */
import { SignedIn, UserButton, useUser } from "@clerk/nextjs";
import React from "react";
import { Menu } from "lucide-react";

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

const Navbar = ({ onMenu }: { onMenu?: () => void }) => {
  const { user } = useUser();
  const displayName = user?.firstName ?? user?.username ?? "Guest";

  return (
    <nav className="flex-between sticky top-0 z-40 w-full border-b border-outline-variant bg-surface px-6 py-3 lg:px-10">
      <div className="flex items-center gap-3">
        {onMenu && (
          <button
            type="button"
            onClick={onMenu}
            aria-label="Open menu"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-on-surface transition-colors hover:bg-surface-container-low lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <span className="text-on-surface font-semibold text-lg">
          {getGreeting()}, {displayName}
        </span>
      </div>

      <div className="flex-between gap-5">
        <SignedIn>
          <UserButton afterSignOutUrl="/sign-in" />
        </SignedIn>
      </div>
    </nav>
  );
};

export default Navbar;
