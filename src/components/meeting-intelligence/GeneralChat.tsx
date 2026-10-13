/* eslint-disable prettier/prettier */
"use client";

import React from "react";
import ChatPanel from "./ChatPanel";

const GeneralChat = () => (
  <section className="flex w-full flex-col gap-6 px-6 py-8">
    <header className="flex flex-col gap-1">
      <h1 className="text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg">
        Ask AI
      </h1>
      <p className="text-body-md text-on-surface-variant">
        Ask about meetings, productivity, or how to use NeuraMeet. This chat is
        not scoped to a single meeting.
      </p>
    </header>
    <ChatPanel />
  </section>
);

export default GeneralChat;
