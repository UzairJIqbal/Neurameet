"use client";

import React from "react";
import TabEmptyState from "./EmptyState";

// AC-70v: the route leaves this text out for a Viewer, who never sees the tab.
const TranscriptTab = ({ text }: { text: string | null | undefined }) =>
  text ? (
    <div className="whitespace-pre-wrap break-words rounded-card bg-surface-container-lowest p-6 text-body-md text-on-surface shadow-card">
      {text}
    </div>
  ) : (
    <TabEmptyState message="No transcript yet." />
  );

export default TranscriptTab;
