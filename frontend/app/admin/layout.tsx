"use client"

import { Sidebar } from "@/components/layout/sidebar"
import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const [mounted, setMounted] = useState(false)

    // Load state from localStorage on mount
    useEffect(() => {
        setMounted(true)
    }, [])

    return (
        <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
            <div className="hidden md:flex flex-col fixed inset-y-0 z-50 transition-all duration-300 ease-in-out border-r bg-[#0F172A] w-64">
                <Sidebar />
            </div>
            <main className="flex-1 h-full overflow-y-auto transition-all duration-300 ease-in-out md:pl-64">
                <div className="p-8">
                    {mounted ? children : (
                        <div className="space-y-4 animate-pulse">
                            <div className="h-8 bg-slate-200 rounded w-1/4" />
                            <div className="grid grid-cols-3 gap-4">
                                <div className="h-32 bg-slate-200 rounded" />
                                <div className="h-32 bg-slate-200 rounded" />
                                <div className="h-32 bg-slate-200 rounded" />
                            </div>
                            <div className="h-64 bg-slate-200 rounded" />
                        </div>
                    )}
                </div>
            </main>
        </div>
    )
}
