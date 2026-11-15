"use client";

import React, { useState } from "react";
import { Check } from "lucide-react";
import toast from "react-hot-toast";
import { FollowUpStatus } from "@/lib/meeting-types";
import { updateFollowUpStatus } from "@/actions/follow-ups";

// Done / not done tick for one follow-up, shared by the Follow-ups page and a
// meeting's Action Items tab. Updates the parent at once and puts the old
// status back if the save fails.
const FollowUpCheck = ({
  id,
  status,
  title,
  onChange,
}: {
  id: string;
  status: FollowUpStatus;
  title: string;
  onChange: (status: FollowUpStatus) => void;
}) => {
  const [saving, setSaving] = useState(false);
  const done = status === "completed";

  const toggle = async () => {
    const previous = status;
    const next: FollowUpStatus = done ? "pending" : "completed";
    onChange(next);
    setSaving(true);
    try {
      const result = await updateFollowUpStatus(id, next);
      if (!result.ok) throw new Error(result.error);
    } catch (err) {
      console.error("Failed to update follow-up:", err);
      onChange(previous);
      toast.error("Couldn't update the follow-up");
    } finally {
      setSaving(false);
    }
  };

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={`${done ? "Mark not done" : "Mark done"}: ${title}`}
      disabled={saving}
      onClick={toggle}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors disabled:opacity-50 ${
        done
          ? "border-success bg-success text-on-success"
          : "border-outline bg-surface-container-lowest hover:border-success"
      }`}
    >
      {done && <Check className="h-4 w-4" />}
    </button>
  );
};

export default FollowUpCheck;
