/* eslint-disable prettier/prettier */
"use client";

import Sidebar_Com from "@/components/Sidebar";
import React from "react";
import { useParams } from "next/navigation";
import FollowUpDetails from "@/components/follow-ups/FollowUpDetails";

const FollowUpDetailPage = () => {
  const { id } = useParams() as { id: string };

  return (
    <Sidebar_Com type="followUps">
      <FollowUpDetails id={id} />
    </Sidebar_Com>
  );
};

export default FollowUpDetailPage;
