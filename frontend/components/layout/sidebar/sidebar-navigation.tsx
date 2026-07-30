"use client"

import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { cn } from "@/lib/utils"
import {
    LayoutDashboard,
    MailCheck,
    UploadCloud,
    History,
    Key,
    ChevronDown,
    ChevronRight,
    ShieldCheck,
    Users,
    Server,
    Palette,
    Package,
    User,
    FileText,
    Terminal,
    Activity,
    Globe,
    Database,
    Wallet,
    RefreshCw,
    Gauge,
    Cpu,
    ArrowRightLeft,
    ListTodo,
    CreditCard,
} from "lucide-react"

interface SidebarNavigationProps {
    userRole: string
    pathname: string
    isSidebarCollapsed: boolean
}

type NavRoute = {
    label: string
    icon: React.ElementType
    href: string
}

function isRouteActive(pathname: string, href: string, allHrefs: string[]) {
    if (pathname === href) return true
    if (href === "/dashboard" || href === "/admin") return false
    if (!pathname.startsWith(`${href}/`)) return false
    return !allHrefs.some(
        (other) =>
            other !== href &&
            other.startsWith(`${href}/`) &&
            (pathname === other || pathname.startsWith(`${other}/`))
    )
}

type SectionKey = "user" | "admin" | "system" | "reseller"

const SYSTEM_PATHS = [
    "/admin/logs",
    "/admin/server",
    "/admin/monitoring",
    "/admin/job-control",
    "/admin/cache-control",
    "/admin/public-verifier",
]

function getOpenSectionFromPathname(pathname: string | null | undefined): SectionKey | null {
    if (pathname?.startsWith("/admin")) {
        return SYSTEM_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ? "system" : "admin"
    }
    if (pathname?.startsWith("/dashboard")) {
        return pathname.startsWith("/dashboard/reseller") ? "reseller" : "user"
    }
    return null
}

function NavTooltip({
    label,
    show,
    children,
}: {
    label: string
    show: boolean
    children: React.ReactNode
}) {
    const [visible, setVisible] = useState(false)
    const [coords, setCoords] = useState({ top: 0, left: 0 })
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const wrapperRef = useRef<HTMLDivElement>(null)

    const handleMouseEnter = () => {
        if (!show) return
        if (wrapperRef.current) {
            const rect = wrapperRef.current.getBoundingClientRect()
            setCoords({
                top: rect.top + rect.height / 2,
                left: rect.right + 12,
            })
        }
        timerRef.current = setTimeout(() => setVisible(true), 150)
    }

    const handleMouseLeave = () => {
        if (timerRef.current) clearTimeout(timerRef.current)
        setVisible(false)
    }

    if (!show) return <>{children}</>

    return (
        <div
            ref={wrapperRef}
            className="relative"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {children}
            {visible &&
                typeof document !== "undefined" &&
                createPortal(
                    <div
                        style={{ top: `${coords.top}px`, left: `${coords.left}px` }}
                        className="pointer-events-none fixed z-[999999] -translate-y-1/2"
                    >
                        <div className="flex animate-in fade-in-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-[#0b1f1c]/10 bg-white/90 px-3 py-1.5 text-xs font-semibold text-[#0b1f1c] shadow-lg backdrop-blur-md duration-150">
                            {label}
                            <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-white/90" />
                        </div>
                    </div>,
                    document.body
                )}
        </div>
    )
}

function NavLink({
    route,
    allHrefs,
    pathname,
    isSidebarCollapsed,
}: {
    route: NavRoute
    allHrefs: string[]
    pathname: string
    isSidebarCollapsed: boolean
}) {
    const active = isRouteActive(pathname, route.href, allHrefs)

    return (
        <NavTooltip label={route.label} show={isSidebarCollapsed}>
            <Link
                href={route.href}
                className={cn(
                    "group relative flex h-9 w-full items-center overflow-hidden rounded-md transition-colors",
                    active
                        ? "bg-[#0f5c52]/22 text-[#08352f]"
                        : "text-[#2f4741] hover:bg-[#0b1f1c]/10 hover:text-[#0b1f1c]"
                )}
            >
                {active && (
                    <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-[#0f5c52]" />
                )}

                <div className="flex h-full w-11 flex-shrink-0 items-center justify-center">
                    <route.icon
                        className={cn(
                            "h-4 w-4 transition-colors",
                            active ? "text-[#0f5c52]" : "text-[#6b857c] group-hover:text-[#0b1f1c]"
                        )}
                    />
                </div>

                <span
                    className={cn(
                        "overflow-hidden whitespace-nowrap pr-2 text-sm font-medium",
                        isSidebarCollapsed ? "hidden" : "flex-1"
                    )}
                >
                    {route.label}
                </span>
            </Link>
        </NavTooltip>
    )
}

function SectionHeader({
    section,
    label,
    Icon,
    accentColor = "text-[#5a736c]",
    isSidebarCollapsed,
    openSection,
    onToggle,
}: {
    section: SectionKey
    label: string
    Icon: React.ElementType
    accentColor?: string
    isSidebarCollapsed: boolean
    openSection: SectionKey | null
    onToggle: (section: SectionKey) => void
}) {
    return (
        <NavTooltip label={label} show={isSidebarCollapsed}>
            <button
                onClick={() => onToggle(section)}
                className="group mb-1 flex h-8 w-full items-center overflow-hidden rounded-md transition-colors hover:bg-[#0b1f1c]/5 focus:outline-none"
            >
                <div className="flex h-full w-11 flex-shrink-0 items-center justify-center">
                    <div className="flex h-6 w-6 items-center justify-center rounded-md border border-[#0b1f1c]/12 bg-white/75 shadow-sm backdrop-blur-sm transition-colors group-hover:bg-white">
                        <Icon className={cn("h-3.5 w-3.5 transition-colors group-hover:text-[#0b1f1c]", accentColor)} />
                    </div>
                </div>

                <div
                    className={cn(
                        "flex flex-1 items-center justify-between overflow-hidden pr-2",
                        isSidebarCollapsed ? "hidden" : "w-auto opacity-100"
                    )}
                >
                    <span className="whitespace-nowrap text-xs font-semibold uppercase tracking-wider text-[#6b857c] transition-colors group-hover:text-[#3d564f]">
                        {label}
                    </span>
                    {openSection === section ? (
                        <ChevronDown className="h-3 w-3 flex-shrink-0 text-[#6b857c]" />
                    ) : (
                        <ChevronRight className="h-3 w-3 flex-shrink-0 text-[#6b857c]" />
                    )}
                </div>
            </button>
        </NavTooltip>
    )
}

function SectionList({
    routes,
    isOpen,
    pathname,
    isSidebarCollapsed,
}: {
    routes: NavRoute[]
    isOpen: boolean
    pathname: string
    isSidebarCollapsed: boolean
}) {
    const allHrefs = routes.map((r) => r.href)
    return (
        <div
            className={cn(
                "overflow-hidden transition-all duration-300 ease-in-out",
                isOpen ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
            )}
        >
            <div className="mt-1 space-y-0.5 pb-1">
                {routes.map((route) => (
                    <NavLink
                        key={route.href}
                        route={route}
                        allHrefs={allHrefs}
                        pathname={pathname}
                        isSidebarCollapsed={isSidebarCollapsed}
                    />
                ))}
            </div>
        </div>
    )
}

export function SidebarNavigation({
    userRole,
    pathname,
    isSidebarCollapsed,
}: SidebarNavigationProps) {
    const [openSection, setOpenSection] = useState<SectionKey | null>(() => getOpenSectionFromPathname(pathname))

    useEffect(() => {
        // Sync expanded section when navigating between dashboard/admin routes
        setOpenSection(getOpenSectionFromPathname(pathname))
    }, [pathname])

    const toggleSection = (section: SectionKey) => {
        setOpenSection((prev) => (prev === section ? null : section))
    }

    const userRoutes: NavRoute[] = [
        { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
        { label: "Single Verify", icon: MailCheck, href: "/dashboard/single-verify" },
        { label: "Bulk Upload", icon: UploadCloud, href: "/dashboard/bulk-upload" },
        { label: "Jobs", icon: ListTodo, href: "/dashboard/jobs" },
        { label: "Buy Credits", icon: CreditCard, href: "/dashboard/credits" },
        { label: "Credits History", icon: History, href: "/dashboard/credits/history" },
        { label: "API Keys", icon: Key, href: "/dashboard/api-keys" },
    ]

    const adminRoutes: NavRoute[] = [
        { label: "Dashboard", icon: LayoutDashboard, href: "/admin" },
        { label: "Manage Users", icon: Users, href: "/admin/users" },
        { label: "Domain List", icon: Globe, href: "/admin/domains" },
        { label: "Brand Settings", icon: Palette, href: "/admin/brand-build" },
        { label: "SMTP Settings", icon: Server, href: "/admin/smtp" },
        { label: "Package Manage", icon: Package, href: "/admin/packages" },
        { label: "Payment Settings", icon: Wallet, href: "/admin/settings/payment" },
        { label: "Update & Licence", icon: RefreshCw, href: "/admin/license" },
    ]

    const systemRoutes: NavRoute[] = [
        { label: "Log View", icon: FileText, href: "/admin/logs" },
        { label: "Backend Server", icon: Terminal, href: "/admin/server" },
        { label: "Server Monitoring", icon: Gauge, href: "/admin/monitoring" },
        { label: "Job Control", icon: Cpu, href: "/admin/job-control" },
        { label: "Cache Control", icon: Database, href: "/admin/cache-control" },
        { label: "Public Verifier", icon: ShieldCheck, href: "/admin/public-verifier" },
    ]

    const resellerRoutes: NavRoute[] = [
        { label: "Transfer Credits", icon: ArrowRightLeft, href: "/dashboard/reseller/transfer" },
    ]

    return (
        <div className="custom-scrollbar flex-1 space-y-1 overflow-x-hidden overflow-y-auto px-2.5 py-4">
            <div className="mb-1">
                <SectionHeader
                    section="user"
                    label="My Workspace"
                    Icon={User}
                    isSidebarCollapsed={isSidebarCollapsed}
                    openSection={openSection}
                    onToggle={toggleSection}
                />
                <SectionList
                    routes={userRoutes}
                    isOpen={openSection === "user"}
                    pathname={pathname}
                    isSidebarCollapsed={isSidebarCollapsed}
                />
            </div>

            {(userRole === "reseller" || userRole === "admin") && (
                <div className="mb-1">
                    <SectionHeader
                        section="reseller"
                        label="Reseller Portal"
                        Icon={Package}
                        accentColor="text-amber-600"
                        isSidebarCollapsed={isSidebarCollapsed}
                        openSection={openSection}
                        onToggle={toggleSection}
                    />
                    <SectionList
                        routes={resellerRoutes}
                        isOpen={openSection === "reseller"}
                        pathname={pathname}
                        isSidebarCollapsed={isSidebarCollapsed}
                    />
                </div>
            )}

            {userRole === "admin" && (
                <div className="mb-1">
                    <SectionHeader
                        section="admin"
                        label="Administration"
                        Icon={ShieldCheck}
                        accentColor="text-rose-600"
                        isSidebarCollapsed={isSidebarCollapsed}
                        openSection={openSection}
                        onToggle={toggleSection}
                    />
                    <SectionList
                        routes={adminRoutes}
                        isOpen={openSection === "admin"}
                        pathname={pathname}
                        isSidebarCollapsed={isSidebarCollapsed}
                    />
                </div>
            )}

            {userRole === "admin" && (
                <div className="mb-1">
                    <SectionHeader
                        section="system"
                        label="System"
                        Icon={Activity}
                        accentColor="text-emerald-600"
                        isSidebarCollapsed={isSidebarCollapsed}
                        openSection={openSection}
                        onToggle={toggleSection}
                    />
                    <SectionList
                        routes={systemRoutes}
                        isOpen={openSection === "system"}
                        pathname={pathname}
                        isSidebarCollapsed={isSidebarCollapsed}
                    />
                </div>
            )}
        </div>
    )
}
