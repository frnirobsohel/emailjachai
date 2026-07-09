"use client"

import { useUIStore } from "@/stores/ui-state"
import { useHydrated } from "@/hooks/use-hydrated"
import { cn } from "@/lib/utils"
import { useSettings } from "@/lib/settings-context"
import { AlertTriangle } from "lucide-react"

export function LayoutWrapper({ children, sidebar }: { children: React.ReactNode, sidebar: React.ReactNode }) {
    const { isSidebarCollapsed } = useUIStore()
    const hydrated = useHydrated()
    const isCollapsed = hydrated ? isSidebarCollapsed : false
    const settings = useSettings()
    const isMaintenance = settings?.maintenance_mode === "1"

    return (
        <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
            <div 
                className={cn(
                    "hidden md:flex flex-col fixed inset-y-0 z-50 transition-all duration-300 ease-in-out border-r bg-[#0F172A]",
                    isCollapsed ? "w-16" : "w-64"
                )}
            >
                {sidebar}
            </div>
            <main 
                className={cn(
                    "flex-1 h-full overflow-y-auto transition-all duration-300 ease-in-out",
                    isCollapsed ? "md:pl-16" : "md:pl-64"
                )}
            >
                {isMaintenance && (
                    <div className="bg-amber-500 text-white px-6 py-3.5 flex items-center gap-3 shadow-sm border-b border-amber-600/20 sticky top-0 z-50">
                        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-50 animate-pulse" />
                        <span className="text-sm font-semibold">
                            {settings?.maintenance_message || "System is undergoing scheduled maintenance. New verifications are temporarily paused."}
                        </span>
                    </div>
                )}
                <div className="p-8">
                    {children}
                </div>
            </main>
        </div>
    )
}
