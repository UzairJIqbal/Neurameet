"use client";

import Sidebar_Com from "@/components/Sidebar";
import React, { Suspense } from "react";
import { useParams } from "next/navigation";
import ProjectDetailView from "@/components/projects/ProjectDetailView";
import { LoaderOne } from "@/components/ui/loader";

const ProjectDetailPage = () => {
  const { id } = useParams() as { id: string };

  return (
    <Sidebar_Com type="projects">
      <Suspense fallback={<LoaderOne />}>
        <ProjectDetailView id={id} />
      </Suspense>
    </Sidebar_Com>
  );
};

export default ProjectDetailPage;
