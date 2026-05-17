/* eslint-disable prettier/prettier */

import Navbar from '@/components/Navbar'
import { Metadata } from 'next'
import React, { ReactNode } from 'react'


export const metadata: Metadata = {
    title: "NeuroMeet",
    description: "Video calling app",
    icons: {
        icon: '/icons/logo.png'
    }
}


const HomeLayout = ({ children }: Readonly<{ children: ReactNode }>) => {
    return (
        <main className="relative">
            <Navbar />
            <section className="flex-1 flex flex-col min-h-screen px-6 pb-6 pt-28 max-md:pb-14 sm:px-14">
                <div className="w-full">{children}</div>
            </section>
        </main >
    )
}

export default HomeLayout
