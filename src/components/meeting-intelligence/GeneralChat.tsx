/* eslint-disable prettier/prettier */
"use client";

import React from "react";
import ChatPanel from "./ChatPanel";

const GeneralChat = () => (
  <div className="flex flex-col gap-3">
    <div className="flex flex-col gap-1">
      <h2 className="text-headline-md font-semibold text-on-surface">
        Ask AI
      </h2>
      <p className="text-body-md text-on-surface-variant">
        Ask about meetings, productivity, or how to use NeuraMeet. This chat is
        not scoped to a single meeting.
      </p>
    </div>
    <ChatPanel />
  </div>
);

export default GeneralChat;
