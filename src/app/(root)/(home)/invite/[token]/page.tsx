/* eslint-disable prettier/prettier */
"use client";

import Sidebar_Com from "@/components/Sidebar";
import React from "react";
import { useParams } from "next/navigation";
import InviteView from "@/components/projects/InviteView";

const InvitePage = () => {
  const { token } = useParams() as { token: string };

  return (
    <Sidebar_Com type="projects">
      <InviteView token={token} />
    </Sidebar_Com>
  );
};

export default InvitePage;
