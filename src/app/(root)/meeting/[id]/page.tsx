/* eslint-disable prettier/prettier */
"use client";
import MeetingRoom from "@/components/MeetingRoom";
import MeetingSetup from "@/components/MeetingSetup";
import { LoaderOne } from "@/components/ui/loader";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import { LoadError } from "@/components/ui/load-error";
import useGetCallbyId from "@/hooks/useGetCallbyId";
import { useUser } from "@clerk/nextjs";
import { StreamCall, StreamTheme } from "@stream-io/video-react-sdk";
import { useParams, useRouter } from "next/navigation";
import React, { useState } from "react";

export default function Meeting() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [isSetupCompleted, setisSetupCompleted] = useState(false);
  const { isLoaded } = useUser();
  const { call, callLoading, error } = useGetCallbyId(id, {
    allowLinkAccess: true,
  });

  const stillLoading = !isLoaded || callLoading;
  const { timedOut } = useLoadingTimeout(stillLoading, { timeoutMs: 12000 });

  if (timedOut) {
    return (
      <LoadError
        message="We couldn't load this meeting."
        onRetry={() => router.refresh()}
      />
    );
  }

  if (!isLoaded || callLoading) return <LoaderOne />;
  if (error || !call) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-inverse-surface px-4 text-center text-inverse-on-surface">
        <div>
          <h1 className="text-2xl font-bold">Meeting not available</h1>
          <p className="mt-3 text-sm text-inverse-on-surface/70">
            Check that the meeting link is correct and that the meeting still
            exists.
          </p>
        </div>
      </div>
    );
  }
  return (
    <StreamCall call={call}>
      <StreamTheme>
        {!isSetupCompleted ? (
          <MeetingSetup setisSetupCompleted={setisSetupCompleted} />
        ) : (
          <MeetingRoom />
        )}
      </StreamTheme>
    </StreamCall>
  );
}
