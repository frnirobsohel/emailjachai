"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { useUIStore } from "@/stores/ui-state"
import { useHydrated } from "@/hooks/use-hydrated"
import { cn } from "@/lib/utils"
import { useSettings } from "@/lib/settings-context"
import { AlertTriangle } from "lucide-react"
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav"

export function LayoutWrapper({
    children,
    sidebar,
    defaultCollapsed = false,
}: {
    children: React.ReactNode
    sidebar: React.ReactNode
    defaultCollapsed?: boolean
}) {
    const pathname = usePathname() || ""
    const { isSidebarCollapsed, isSidebarOpen, setSidebarOpen } = useUIStore()
    const hydrated = useHydrated()
    const [mobileReady, setMobileReady] = useState(false)
    const isCollapsed = hydrated ? isSidebarCollapsed : defaultCollapsed
    const settings = useSettings()
    const isMaintenance = settings?.maintenance_mode === "1"

    const showBottomNav = pathname.startsWith("/dashboard") || pathname.startsWith("/admin")

    // Mount mobile-only chrome after hydration so SSR HTML matches the first client paint
    useEffect(() => {
        setMobileReady(true)
    }, [])

    useEffect(() => {
        try {
            const item = localStorage.getItem("ui-state-storage")
            if (item) {
                const parsed = JSON.parse(item)
                if (parsed?.state && typeof parsed.state.isSidebarCollapsed === "boolean") {
                    document.cookie = `sidebar_collapsed=${parsed.state.isSidebarCollapsed}; path=/; max-age=31536000; SameSite=Lax`
                }
            }
        } catch {}
    }, [isCollapsed])

    useEffect(() => {
        setSidebarOpen(false)
    }, [pathname, setSidebarOpen])

    useEffect(() => {
        if (!mobileReady) return
        const mq = window.matchMedia("(max-width: 767px)")
        if (isSidebarOpen && mq.matches) {
            const prev = document.body.style.overflow
            document.body.style.overflow = "hidden"
            return () => {
                document.body.style.overflow = prev
            }
        }
    }, [isSidebarOpen, mobileReady])

    return (
        <div className="flex h-screen overflow-hidden bg-[#e8efec]">
            <button
                type="button"
                aria-label="Close menu"
                className={cn(
                    "fixed inset-0 z-40 bg-[#0b1f1c]/40 transition-opacity md:hidden",
                    isSidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
                )}
                onClick={() => setSidebarOpen(false)}
            />

            <div
                suppressHydrationWarning
                className={cn(
                    "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[#0b1f1c]/15 bg-[#c9d6d0]/95 backdrop-blur-xl transition-transform duration-300 ease-in-out",
                    isSidebarOpen ? "translate-x-0" : "-translate-x-full",
                    "md:translate-x-0",
                    isCollapsed ? "md:w-16" : "md:w-64"
                )}
            >
                {sidebar}
            </div>

            <div
                suppressHydrationWarning
                className={cn(
                    "flex h-full min-w-0 flex-1 flex-col transition-[padding-left] duration-300 ease-in-out",
                    isCollapsed ? "md:pl-16" : "md:pl-64"
                )}
            >
                <main
                    className={cn(
                        "min-h-0 flex-1 overflow-y-auto",
                        mobileReady && showBottomNav && "pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pb-0"
                    )}
                >
                    {isMaintenance && (
                        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-amber-600/20 bg-amber-500 px-4 py-3 text-white shadow-sm sm:px-6">
                            <AlertTriangle className="h-5 w-5 shrink-0 animate-pulse text-amber-50" />
                            <span className="text-sm font-semibold">
                                {settings?.maintenance_message ||
                                    "System is undergoing scheduled maintenance. New verifications are temporarily paused."}
                            </span>
                        </div>
                    )}
                    <div className="p-4 sm:p-6 md:p-8">{children}</div>
                </main>

                {mobileReady && showBottomNav && <MobileBottomNav />}
            </div>
        </div>
    )
}
