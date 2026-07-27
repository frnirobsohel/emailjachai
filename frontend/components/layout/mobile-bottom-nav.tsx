"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
    LayoutDashboard,
    MailCheck,
    UploadCloud,
    ListTodo,
    MoreHorizontal,
    Users,
    Globe,
    Activity,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useUIStore } from "@/stores/ui-state"

type Tab = {
    label: string
    href: string
    icon: React.ElementType
    match: (path: string) => boolean
}

const userTabs: Tab[] = [
    {
        label: "Home",
        href: "/dashboard",
        icon: LayoutDashboard,
        match: (path) => path === "/dashboard",
    },
    {
        label: "Verify",
        href: "/dashboard/single-verify",
        icon: MailCheck,
        match: (path) => path.startsWith("/dashboard/single-verify"),
    },
    {
        label: "Bulk",
        href: "/dashboard/bulk-upload",
        icon: UploadCloud,
        match: (path) => path.startsWith("/dashboard/bulk-upload"),
    },
    {
        label: "Jobs",
        href: "/dashboard/jobs",
        icon: ListTodo,
        match: (path) => path.startsWith("/dashboard/jobs"),
    },
]

const adminTabs: Tab[] = [
    {
        label: "Home",
        href: "/admin",
        icon: LayoutDashboard,
        match: (path) => path === "/admin",
    },
    {
        label: "Users",
        href: "/admin/users",
        icon: Users,
        match: (path) => path.startsWith("/admin/users"),
    },
    {
        label: "Domains",
        href: "/admin/domains",
        icon: Globe,
        match: (path) => path.startsWith("/admin/domains"),
    },
    {
        label: "System",
        href: "/admin/monitoring",
        icon: Activity,
        match: (path) =>
            ["/admin/logs", "/admin/server", "/admin/monitoring", "/admin/job-control", "/admin/cache-control", "/admin/public-verifier"].some(
                (p) => path === p || path.startsWith(`${p}/`)
            ),
    },
]

function isMoreRoute(path: string, tabs: Tab[], base: "/dashboard" | "/admin") {
    if (!path.startsWith(base)) return false
    return !tabs.some((tab) => tab.match(path))
}

export function MobileBottomNav() {
    const pathname = usePathname() || ""
    const { isSidebarOpen, setSidebarOpen, toggleSidebar } = useUIStore()

    const isAdmin = pathname.startsWith("/admin")
    const tabs = isAdmin ? adminTabs : userTabs
    const base = isAdmin ? "/admin" : "/dashboard"
    const moreActive = isMoreRoute(pathname, tabs, base) || isSidebarOpen

    return (
        <nav
            className="fixed inset-x-0 bottom-0 z-30 border-t border-[#0b1f1c]/10 bg-[#e8efec]/95 backdrop-blur-md md:hidden"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
            aria-label="Primary"
        >
            <div className="grid h-16 grid-cols-5">
                {tabs.map((tab) => {
                    const active = tab.match(pathname) && !isSidebarOpen
                    const Icon = tab.icon
                    return (
                        <Link
                            key={tab.href}
                            href={tab.href}
                            onClick={() => setSidebarOpen(false)}
                            className={cn(
                                "flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
                                active ? "text-[#0f5c52]" : "text-[#5a736c] hover:text-[#0b1f1c]"
                            )}
                        >
                            <Icon className={cn("h-5 w-5", active && "stroke-[2.25]")} />
                            <span>{tab.label}</span>
                        </Link>
                    )
                })}

                <button
                    type="button"
                    onClick={toggleSidebar}
                    className={cn(
                        "flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
                        moreActive ? "text-[#0f5c52]" : "text-[#5a736c] hover:text-[#0b1f1c]"
                    )}
                    aria-label="More menu"
                    aria-expanded={isSidebarOpen}
                >
                    <MoreHorizontal className={cn("h-5 w-5", moreActive && "stroke-[2.25]")} />
                    <span>More</span>
                </button>
            </div>
        </nav>
    )
}
