import Sidebar_Com from "@/components/Sidebar";
import { UserProfile } from "@clerk/nextjs";
import React from "react";

// Hash routing keeps Clerk's sections on this one path, with no catch all route.
const Profile = () => {
  return (
    <Sidebar_Com type="profile">
      <section className="flex w-full justify-center py-2">
        <UserProfile routing="hash" />
      </section>
    </Sidebar_Com>
  );
};

export default Profile;
