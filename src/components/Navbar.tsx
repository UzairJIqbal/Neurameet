/* eslint-disable prettier/prettier */
import { SignedIn, UserButton } from "@clerk/nextjs";
import React from "react";

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

const Navbar = () => {
  return (
    <nav className="flex-between sticky top-0 z-50 w-full border-b border-outline-variant bg-surface px-6 py-3 lg:px-10">
      <span className="text-on-surface font-semibold text-lg">
        {getGreeting()}, Uzair Iqbal
      </span>

      <div className="flex-between gap-5">
        <SignedIn>
          <UserButton afterSignOutUrl="/sign-in" />
        </SignedIn>
      </div>
    </nav>
  );
};

export default Navbar;
