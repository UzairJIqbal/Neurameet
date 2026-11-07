import Sidebar_Com from "@/components/Sidebar";
import NotificationsPage from "@/components/shell/NotificationsPage";
import React from "react";

const Notifications = async ({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string | string[] }>;
}) => {
  const { filter } = await searchParams;
  return (
    <Sidebar_Com type="notifications">
      <NotificationsPage
        initialFilter={typeof filter === "string" ? filter : undefined}
      />
    </Sidebar_Com>
  );
};

export default Notifications;
