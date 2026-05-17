/* eslint-disable prettier/prettier */
import React from "react";
import { HoverEffect } from "./ui/card-hover-effect";
import { meetingCardDetails } from "../../constants";
import { ModalProvider } from "./ui/animated-modal";



const HomeCard = () => {
    return <div className="max-w-5xl mx-auto px-8">
        <ModalProvider>
            <HoverEffect items={meetingCardDetails} />
        </ModalProvider>
    </div>

}
export default HomeCard
