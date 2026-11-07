import Sidebar_Com from "@/components/Sidebar";
import MyTasksPage from "@/components/shell/MyTasksPage";
import React from "react";

const MyTasks = () => (
  <Sidebar_Com type="myTasks">
    <MyTasksPage />
  </Sidebar_Com>
);

export default MyTasks;
