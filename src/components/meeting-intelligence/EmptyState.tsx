/* eslint-disable prettier/prettier */
import React from "react";
import { Inbox } from "lucide-react";

const TabEmptyState = ({ message }: { message: string }) => (
  <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-surface-variant bg-surface-container-lowest px-6 py-16 text-center">
    <Inbox className="h-10 w-10 text-on-surface-variant" />
    <p className="text-body-lg text-on-surface-variant">{message}</p>
  </div>
);

export default TabEmptyState;
