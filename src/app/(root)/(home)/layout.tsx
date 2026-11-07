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
    <main className="relative flex flex-col h-screen min-h-0 bg-surface">
      <section className="flex-1 flex flex-col min-h-0">
        <div className="flex w-full flex-1 flex-col min-h-0">{children}</div>
      </section>
    </main>
  );
};

export default HomeLayout;
