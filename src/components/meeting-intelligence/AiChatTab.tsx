/* eslint-disable prettier/prettier */
"use client";

import React from "react";
import ChatPanel from "./ChatPanel";

const AiChatTab = ({ meetingId }: { meetingId: string }) => (
  <div className="flex flex-col gap-3">
    <div className="flex flex-col gap-1">
      <h2 className="text-headline-md font-semibold text-on-surface">
        AI Chat
      </h2>
      <p className="text-body-md text-on-surface-variant">
        Ask questions grounded in this meeting&apos;s transcript.
      </p>
    </div>
    <ChatPanel meetingId={meetingId} />
  </div>
);

export default AiChatTab;
