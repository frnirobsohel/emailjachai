"use client"

import { Sidebar } from "@/components/layout/sidebar"

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
            <div className="hidden md:flex flex-col fixed inset-y-0 z-50 transition-all duration-300 ease-in-out border-r bg-[#0F172A] w-64">
                <Sidebar />
            </div>
            <main className="flex-1 h-full overflow-y-auto transition-all duration-300 ease-in-out md:pl-64">
                <div className="p-8">
                    {children}
                </div>
            </main>
        </div>
    )
}
