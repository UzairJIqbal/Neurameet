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
        <main className="relative flex flex-col h-full">
            <Navbar />
            <section className="flex-1 min-h-0 flex flex-col px-3 pb-6 pt-20 sm:px-6 sm:pt-24 lg:px-10 overflow-hidden">
                <div className="w-full flex-1 min-h-0">{children}</div>
            </section>
        </main>
    )
}

export default HomeLayout
