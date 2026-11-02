/* eslint-disable prettier/prettier */
"use client";

import Sidebar_Com from "@/components/Sidebar";
import React from "react";
import { useParams } from "next/navigation";
import ProjectDetailView from "@/components/projects/ProjectDetailView";

const ProjectDetailPage = () => {
  const { id } = useParams() as { id: string };

  return (
    <Sidebar_Com type="projects">
      <ProjectDetailView id={id} />
    </Sidebar_Com>
  );
};

export default ProjectDetailPage;
