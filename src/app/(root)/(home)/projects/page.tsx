/* eslint-disable prettier/prettier */
import Sidebar_Com from "@/components/Sidebar";
import ProjectList from "@/components/projects/ProjectList";
import React from "react";

const ProjectsPage = () => {
  return (
    <Sidebar_Com type="projects">
      <ProjectList />
    </Sidebar_Com>
  );
};

export default ProjectsPage;
