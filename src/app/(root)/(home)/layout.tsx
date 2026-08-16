/* eslint-disable prettier/prettier */

import { Metadata } from "next";
import React, { ReactNode } from "react";

export const metadata: Metadata = {
  title: "NeuroMeet",
  description: "Video calling app",
  icons: {
    icon: "/icons/logo.png",
  },
};

const HomeLayout = ({ children }: Readonly<{ children: ReactNode }>) => {
  return (
    <main className="relative flex flex-col min-h-screen bg-surface">
      <section className="flex-1 flex flex-col px-3 pb-6 pt-16 sm:px-6 lg:px-10">
        <div className="w-full flex-1">{children}</div>
      </section>
    </main>
  );
};

export default HomeLayout;
