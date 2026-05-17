/* eslint-disable prettier/prettier */
import React from "react";
import { HoverEffect } from "./ui/card-hover-effect";
import { meetingCardDetails } from "../../constants";
import { ModalProvider } from "./ui/animated-modal";



const HomeCard = () => {
    return <div className="mx-auto w-full max-w-5xl px-2 sm:px-4 lg:px-8">
        <ModalProvider>
            <HoverEffect items={meetingCardDetails} />
        </ModalProvider>
    </div>

}
export default HomeCard
