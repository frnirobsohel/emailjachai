"use client"

import { useState, useEffect, HTMLAttributes } from "react"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useSettings } from "@/lib/settings-context"
import { useHydrated } from "@/hooks/use-hydrated"
import { ShieldCheck, ChevronRight, ChevronLeft } from "lucide-react"

import { useUIStore } from "@/stores/ui-state"
import { useUserStore } from "@/stores/user-state"
import { resetAllStores } from "@/stores/store-reset"
import { SidebarNavigation } from "./sidebar/sidebar-navigation"
import { SidebarProfile } from "./sidebar/sidebar-profile"

interface SidebarProps extends HTMLAttributes<HTMLDivElement> {
    defaultCollapsed?: boolean
}

export function Sidebar({ className, defaultCollapsed = false }: SidebarProps) {
    const pathname = usePathname()
    const { isSidebarCollapsed, toggleSidebarCollapse } = useUIStore()
    const { user } = useUserStore()
    const hydrated = useHydrated()
    const isCollapsed = hydrated ? isSidebarCollapsed : defaultCollapsed
    const safeUser = hydrated ? user : null
    const userRole = safeUser?.role || 'user'
    
    const [isImpersonating, setIsImpersonating] = useState<boolean>(false)
    const settings = useSettings()
    const siteTitle = settings?.site_title || "EmailJachai Pro"
    const logoUrl = settings?.logo_url

    const handleLogout = async () => {
        try {
            // 1. Reset all in-memory Zustand stores (prevent data leakage between sessions)
            resetAllStores();

            // 2. Clear persisted user state
            useUserStore.getState().clearUser();

            // 3. Clear any legacy localStorage keys
            localStorage.removeItem('sidebar_user');
            localStorage.removeItem('sidebar_role');
            localStorage.removeItem('sidebar_user_synced_at');

            // 4. Invalidate server-side session cookie
            const response = await fetch("/next-api/auth/logout", { method: "POST" });
            const result = await response.json();

            if (result.returnedToAdmin) {
                window.location.href = "/admin/users";
            } else {
                window.location.href = "/login";
            }
        } catch (error) {
            console.error("Logout failed:", error);
            window.location.href = "/login";
        }
    }

    useEffect(() => {
        const syncAuthMe = async () => {
            try {
                const meResponse = await fetch('/next-api/auth/me')
                if (meResponse.ok) {
                    const meData = await meResponse.json()
                    if (meData.status === 'success' && meData.data?.user) {
                        const sessionUser = meData.data.user
                        // Always update the store so role is always accurate
                        useUserStore.getState().setUser(
                            {
                                id: String(sessionUser.id),
                                email: sessionUser.email,
                                name: sessionUser.name,
                                role: sessionUser.role || 'user',
                                avatar: sessionUser.avatar,
                            }
                        )
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
    }, []) // mount-এ একবারই

    return (
        <div suppressHydrationWarning className={cn("flex flex-col h-screen bg-[#0F172A] text-slate-300", className)}>
            {/* Brand Header */}
            <div className="h-16 flex items-center border-b border-slate-800/50 relative overflow-hidden">
                {/* Fixed Logo Container */}
                <div className="w-16 flex-shrink-0 flex items-center justify-center relative z-10 group/header h-full">
                    {/* The Logo (Always visible, but fades out on hover when collapsed) */}
                    <div className={cn("absolute inset-0 flex items-center justify-center transition-opacity duration-200", isCollapsed ? "group-hover/header:opacity-0" : "opacity-100")}>
                        {logoUrl ? (
                            <Image src={logoUrl} alt="Logo" width={24} height={24} className="h-6 w-6 object-contain" />
                        ) : (
                            <ShieldCheck className="h-6 w-6 text-indigo-500" />
                        )}
                    </div>
                    
                    {/* The Expand Button (Visible only on hover in collapsed mode) */}
                    {isCollapsed && (
                        <button
                            onClick={toggleSidebarCollapse}
                            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/header:opacity-100 transition-opacity duration-200 focus:outline-none"
                            title="Expand Sidebar"
                            aria-label="Expand Sidebar"
                        >
                            <div className="h-8 w-8 rounded hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
                                <ChevronRight className="h-4 w-4" />
                            </div>
                        </button>
                    )}
                </div>

                {/* Shrinking Title & Collapse Button Container */}
                <div className={cn(
                    "flex items-center justify-between overflow-hidden flex-1",
                    isCollapsed ? "hidden" : "w-auto opacity-100 pr-4"
                )}>
                    {/* Site Title */}
                    <span className="text-lg font-bold text-white tracking-tight truncate">
                        {siteTitle}
                    </span>
                    
                    {/* Collapse Button */}
                    <button
                        onClick={toggleSidebarCollapse}
                        className="flex-shrink-0 hover:bg-slate-800 text-slate-400 hover:text-white rounded h-7 w-7 flex items-center justify-center transition-colors focus:outline-none ml-2"
                        title="Collapse Sidebar"
                        aria-label="Collapse Sidebar"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* Scrollable Navigation links */}
            <SidebarNavigation
                userRole={userRole}
                pathname={pathname || ""}
                isSidebarCollapsed={isCollapsed}
                toggleSidebarCollapse={toggleSidebarCollapse}
            />

            {/* Footer / User Profile (ChatGPT Style) */}
            <SidebarProfile
                isCollapsed={isCollapsed}
                safeUser={safeUser}
                isImpersonating={isImpersonating}
                handleLogout={handleLogout}
            />
        </div>
    )
}
