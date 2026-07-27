"use client"

import { useState, useEffect, HTMLAttributes } from "react"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useSettings } from "@/lib/settings-context"
import { useHydrated } from "@/hooks/use-hydrated"
import { ChevronRight, ChevronLeft, X } from "lucide-react"
import { BrandLogo } from "@/components/home/brand-logo"

import { useUIStore } from "@/stores/ui-state"
import { useUserStore } from "@/stores/user-state"
import { useCreditStore } from "@/stores/credit-state"
import { useDashboardStore } from "@/stores/dashboard-store"
import { resetAllStores } from "@/stores/store-reset"
import { SidebarNavigation } from "./sidebar/sidebar-navigation"
import { SidebarProfile } from "./sidebar/sidebar-profile"

interface SidebarProps extends HTMLAttributes<HTMLDivElement> {
    defaultCollapsed?: boolean
}

export function Sidebar({ className, defaultCollapsed = false }: SidebarProps) {
    const pathname = usePathname()
    const { isSidebarCollapsed, toggleSidebarCollapse, setSidebarOpen } = useUIStore()
    const { user } = useUserStore()
    const hydrated = useHydrated()
    const [isMobile, setIsMobile] = useState(false)
    const isCollapsed = isMobile ? false : hydrated ? isSidebarCollapsed : defaultCollapsed
    const safeUser = hydrated ? user : null
    const userRole = safeUser?.role || "user"

    const [isImpersonating, setIsImpersonating] = useState(false)
    const settings = useSettings()
    const siteTitle = settings?.site_title || "EmailJachai Pro"
    const logoUrl = settings?.logo_url || settings?.favicon_url || "/logo.svg"

    useEffect(() => {
        const mq = window.matchMedia("(max-width: 767px)")
        const update = () => setIsMobile(mq.matches)
        update()
        mq.addEventListener("change", update)
        return () => mq.removeEventListener("change", update)
    }, [])

    // Close mobile drawer when a nav link is followed (backup to pathname effect)
    useEffect(() => {
        if (isMobile) setSidebarOpen(false)
    }, [pathname, isMobile, setSidebarOpen])

    const handleLogout = async () => {
        try {
            resetAllStores()
            useUserStore.getState().clearUser()
            localStorage.removeItem("sidebar_user")
            localStorage.removeItem("sidebar_role")
            localStorage.removeItem("sidebar_user_synced_at")

            const response = await fetch("/next-api/auth/logout", { method: "POST" })
            const result = await response.json()

            if (result.returnedToAdmin) {
                window.location.href = "/admin/users"
            } else {
                window.location.href = "/login"
            }
        } catch (error) {
            console.error("Logout failed:", error)
            window.location.href = "/login"
        }
    }

    useEffect(() => {
        const syncAuthMe = async () => {
            try {
                const meResponse = await fetch("/next-api/auth/me")
                if (meResponse.ok) {
                    const meData = await meResponse.json()
                    if (meData.status === "success" && meData.data?.user) {
                        const sessionUser = meData.data.user
                        useUserStore.getState().setUser({
                            id: String(sessionUser.id),
                            email: sessionUser.email,
                            name: sessionUser.name,
                            role: sessionUser.role || "user",
                            avatar: sessionUser.avatar,
                        })

                        // Seed credits immediately from /auth/me (fast) so CreditBadge
                        // does not wait on the heavier /dashboard/stats payload after reload.
                        if (typeof sessionUser.credits === "number") {
                            useCreditStore.getState().setBalance(sessionUser.credits)
                            useCreditStore.getState().setLastFetched(Date.now())
                            const dash = useDashboardStore.getState()
                            if (dash.stats) {
                                dash.setStats({
                                    ...dash.stats,
                                    credits_remaining: sessionUser.credits.toLocaleString(),
                                })
                            }
                        }

                        if (meData.data.isImpersonating) {
                            setIsImpersonating(true)
                        }
                    }
                } else if (meResponse.status === 401) {
                    handleLogout()
                }
            } catch (error) {
                console.error("Failed to sync session:", error)
            }
        }
        syncAuthMe()
    }, [])

    return (
        <div
            suppressHydrationWarning
            className={cn("flex h-screen flex-col bg-transparent text-[#0b1f1c]", className)}
        >
            <div className="relative flex h-16 items-center overflow-hidden border-b border-[#0b1f1c]/12 bg-[#b8cbc3]/90 backdrop-blur-md">
                <div className="group/header relative z-10 flex h-full w-16 flex-shrink-0 items-center justify-center">
                    <div
                        className={cn(
                            "absolute inset-0 flex items-center justify-center transition-opacity duration-200",
                            isCollapsed ? "group-hover/header:opacity-0" : "opacity-100"
                        )}
                    >
                        <BrandLogo
                            logoUrl={logoUrl}
                            siteTitle={siteTitle}
                            size={24}
                            className="h-6 w-6 object-contain"
                        />
                    </div>

                    {isCollapsed && !isMobile && (
                        <button
                            onClick={toggleSidebarCollapse}
                            className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 focus:outline-none group-hover/header:opacity-100"
                            title="Expand Sidebar"
                            aria-label="Expand Sidebar"
                        >
                            <div className="flex h-8 w-8 items-center justify-center rounded-md text-[#5a736c] transition-colors hover:bg-[#0f5c52]/10 hover:text-[#0b1f1c]">
                                <ChevronRight className="h-4 w-4" />
                            </div>
                        </button>
                    )}
                </div>

                <div
                    className={cn(
                        "flex flex-1 items-center justify-between overflow-hidden",
                        isCollapsed ? "hidden" : "w-auto opacity-100 pr-4"
                    )}
                >
                    <span className="truncate text-lg font-semibold tracking-tight text-[#0b1f1c]">
                        {siteTitle}
                    </span>

                    {!isMobile && (
                        <button
                            onClick={toggleSidebarCollapse}
                            className="ml-2 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-[#5a736c] transition-colors hover:bg-[#0f5c52]/10 hover:text-[#0b1f1c] focus:outline-none"
                            title="Collapse Sidebar"
                            aria-label="Collapse Sidebar"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                    )}
                    {isMobile && (
                        <button
                            onClick={() => setSidebarOpen(false)}
                            className="ml-2 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-[#5a736c] transition-colors hover:bg-[#0f5c52]/10 hover:text-[#0b1f1c] focus:outline-none"
                            title="Close menu"
                            aria-label="Close menu"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>

            <SidebarNavigation
                userRole={userRole}
                pathname={pathname || ""}
                isSidebarCollapsed={isCollapsed}
            />

            <SidebarProfile
                isCollapsed={isCollapsed}
                safeUser={safeUser}
                isImpersonating={isImpersonating}
                handleLogout={handleLogout}
            />
        </div>
    )
}
