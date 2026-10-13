/* eslint-disable prettier/prettier */
"use client";

import Sidebar_Com from "@/components/Sidebar";
import React from "react";
import { useParams } from "next/navigation";
import MeetingDetail from "@/components/meeting-intelligence/MeetingDetail";

const MeetingDetailPage = () => {
  const { id } = useParams() as { id: string };

  return (
    <Sidebar_Com type="meetingIntelligence">
      <MeetingDetail meetingId={id} />
    </Sidebar_Com>
  );
};

export default MeetingDetailPage;
