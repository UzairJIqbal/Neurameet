"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { LoaderOne } from "@/components/ui/loader";

/** Dark on the meeting routes (the room is dark), light everywhere else. */
export default function Loader() {
  const pathname = usePathname();
  const tone = pathname?.startsWith("/meeting") ? "dark" : "light";
  return <LoaderOne tone={tone} />;
}
