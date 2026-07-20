"use client"

import { useEffect } from "react"
import { useUIStore } from "@/stores/ui-state"
import { useHydrated } from "@/hooks/use-hydrated"
import { cn } from "@/lib/utils"
import { useSettings } from "@/lib/settings-context"
import { AlertTriangle } from "lucide-react"

export function LayoutWrapper({ 
    children, 
    sidebar,
    defaultCollapsed = false
}: { 
    children: React.ReactNode
    sidebar: React.ReactNode
    defaultCollapsed?: boolean
}) {
    const { isSidebarCollapsed } = useUIStore()
    const hydrated = useHydrated()
    const isCollapsed = hydrated ? isSidebarCollapsed : defaultCollapsed
    const settings = useSettings()
    const isMaintenance = settings?.maintenance_mode === "1"

    useEffect(() => {
        try {
            const item = localStorage.getItem('ui-state-storage')
            if (item) {
                const parsed = JSON.parse(item)
                if (parsed?.state && typeof parsed.state.isSidebarCollapsed === 'boolean') {
                    document.cookie = `sidebar_collapsed=${parsed.state.isSidebarCollapsed}; path=/; max-age=31536000; SameSite=Lax`
                }
            }
        } catch (e) {}
    }, [isCollapsed])

    return (
        <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
            <div 
                suppressHydrationWarning
                className={cn(
                    "hidden md:flex flex-col fixed inset-y-0 z-50 border-r bg-[#0F172A] transition-[width] duration-300 ease-in-out",
                    isCollapsed ? "w-16" : "w-64"
                )}
            >
                {sidebar}
            </div>
            <main 
                suppressHydrationWarning
                className={cn(
                    "flex-1 h-full overflow-y-auto transition-[padding-left] duration-300 ease-in-out",
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
