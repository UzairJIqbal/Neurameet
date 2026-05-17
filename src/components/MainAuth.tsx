"use client";
import { BackgroundLines } from "@/components/ui/background-lines";
import { ContainerTextFlip } from "@/components/ui/container-text-flip";
import { SignIn, SignUp } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import React from "react";

const clerkAppearance = {
  baseTheme: dark,
  variables: {
    colorPrimary: "#0000ff",
    colorForeground: "white",
    borderRadius: "10px",
    colorMutedForeground: "#888888",
    colorBorder: "black",
    colorInputText: "#fff",
    colorSuccess: "blue",
    colorDanger: "red",
  },
  layout: {
    socialButtonsVariant: "blockButton" as const,
    animations: true,
    logoImageUrl: "/icons/logo.png",
  },
  elements: {
    formButtonPrimary: "bg-slate-500 hover:bg-slate-400 text-sm",
  },
};

const MainAuth = ({ type }: { type: "sign-in" | "sign-up" }) => {
  return (
    <div className="flex h-screen w-full items-center justify-center px-6">
      <div className="flex-1 items-center justify-center hidden lg:block">
        <BackgroundLines className="flex items-center justify-center w-full flex-col px-4">
          <h2 className="bg-clip-text text-transparent text-center bg-white text-2xl md:text-4xl lg:text-7xl font-sans py-2 md:py-10 relative z-20 font-bold tracking-tight">
            <ContainerTextFlip words={["Welcome", "to", "Neuromeet"]} />
            , <br /> Redefining How Teams Connect.
          </h2>
          <p className="max-w-xl mx-auto text-sm md:text-lg text-white dark:text-white text-center">
            Built for teams that value clarity and speed. AI helps you stay
            focused on what matters
          </p>
        </BackgroundLines>
      </div>

      <div className="flex-1 flex items-center justify-center">
        {type === "sign-in" ? (
          <SignIn appearance={clerkAppearance} />
        ) : (
          <SignUp appearance={clerkAppearance} />
        )}
      </div>
    </div>
  );
};

export default MainAuth;
