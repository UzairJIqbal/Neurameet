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
            <section className="flex min-h-screen flex-1 flex-col px-3 pb-6 pt-20 sm:px-6 sm:pt-24 lg:px-10">
                <div className="w-full">{children}</div>
            </section>
        </main >
    )
}

export default HomeLayout
