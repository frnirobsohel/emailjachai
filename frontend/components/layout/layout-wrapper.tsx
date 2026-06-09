"use client"

import { useUIStore } from "@/lib/store/ui-state"
import { cn } from "@/lib/utils"

export function LayoutWrapper({ children, sidebar }: { children: React.ReactNode, sidebar: React.ReactNode }) {
    const { isSidebarCollapsed } = useUIStore()

    return (
        <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
            <div 
                className={cn(
                    "hidden md:flex flex-col fixed inset-y-0 z-50 transition-all duration-300 ease-in-out border-r bg-[#0F172A]",
                    isSidebarCollapsed ? "w-16" : "w-64"
                )}
            >
                {sidebar}
            </div>
            <main 
                className={cn(
                    "flex-1 h-full overflow-y-auto transition-all duration-300 ease-in-out",
                    isSidebarCollapsed ? "md:pl-16" : "md:pl-64"
                )}
            >
                <div className="p-8">
                    {children}
                </div>
            </main>
        </div>
    )
}
