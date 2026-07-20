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
    CreditCard
} from "lucide-react"

interface SidebarNavigationProps {
    userRole: string
    pathname: string
    isSidebarCollapsed: boolean
    toggleSidebarCollapse: () => void
}

// Portal-based lightweight tooltip wrapper that never gets clipped by sidebar overflow
function NavTooltip({ label, show, children }: { label: string; show: boolean; children: React.ReactNode }) {
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
            {visible && typeof document !== "undefined" && createPortal(
                <div 
                    style={{ top: `${coords.top}px`, left: `${coords.left}px` }}
                    className="pointer-events-none fixed -translate-y-1/2 z-[999999]"
                >
                    <div className="bg-slate-900 border border-slate-700/80 text-slate-100 text-xs font-semibold px-3 py-1.5 rounded-md shadow-2xl whitespace-nowrap flex items-center gap-1.5 animate-in fade-in-0 duration-150">
                        {label}
                        <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-700/80" />
                    </div>
                </div>,
                document.body
            )}
        </div>
    )
}

export function SidebarNavigation({
    userRole,
    pathname,
    isSidebarCollapsed,
    toggleSidebarCollapse
}: SidebarNavigationProps) {
    const [openSection, setOpenSection] = useState<"user" | "admin" | "system" | "reseller" | null>(null)

    useEffect(() => {
        if (pathname?.startsWith("/admin")) {
            const systemPaths = ["/admin/logs", "/admin/server", "/admin/monitoring", "/admin/job-control", "/admin/cache-control", "/admin/public-verifier"]
            if (systemPaths.includes(pathname)) {
                setOpenSection("system")
            } else {
                setOpenSection("admin")
            }
        } else if (pathname?.startsWith("/dashboard")) {
            setOpenSection("user")
        }
    }, [pathname])

    const toggleSection = (section: "user" | "admin" | "system" | "reseller") => {
        setOpenSection(prev => prev === section ? null : section)
    }

    const userRoutes = [
        { label: "Dashboard",       icon: LayoutDashboard, href: "/dashboard",                  active: pathname === "/dashboard" },
        { label: "Single Verify",   icon: MailCheck,       href: "/dashboard/single-verify",     active: pathname === "/dashboard/single-verify" },
        { label: "Bulk Upload",     icon: UploadCloud,     href: "/dashboard/bulk-upload",       active: pathname === "/dashboard/bulk-upload" },
        { label: "Jobs",            icon: ListTodo,        href: "/dashboard/jobs",              active: pathname === "/dashboard/jobs" },
        { label: "Buy Credits",     icon: CreditCard,      href: "/dashboard/credits",           active: pathname === "/dashboard/credits" },
        { label: "Credits History", icon: History,         href: "/dashboard/credits/history",   active: pathname === "/dashboard/credits/history" },
        { label: "API Keys",        icon: Key,             href: "/dashboard/api-keys",          active: pathname === "/dashboard/api-keys" },
    ]

    const adminRoutes = [
        { label: "Dashboard",         icon: LayoutDashboard, href: "/admin",                    active: pathname === "/admin" },
        { label: "Manage Users",      icon: Users,           href: "/admin/users",              active: pathname === "/admin/users" },
        { label: "Domain List",       icon: Globe,           href: "/admin/domains",            active: pathname === "/admin/domains" },
        { label: "Brand Settings",    icon: Palette,         href: "/admin/brand-build",        active: pathname === "/admin/brand-build" },
        { label: "SMTP Settings",     icon: Server,          href: "/admin/smtp",               active: pathname === "/admin/smtp" },
        { label: "Package Manage",    icon: Package,         href: "/admin/packages",           active: pathname === "/admin/packages" },
        { label: "Payment Settings",  icon: Wallet,          href: "/admin/settings/payment",   active: pathname === "/admin/settings/payment" },
        { label: "Update & Licence",  icon: RefreshCw,       href: "/admin/license",            active: pathname === "/admin/license" },
    ]

    const systemRoutes = [
        { label: "Log View",         icon: FileText,    href: "/admin/logs",              active: pathname === "/admin/logs" },
        { label: "Backend Server",   icon: Terminal,    href: "/admin/server",            active: pathname === "/admin/server" },
        { label: "Server Monitoring",icon: Gauge,       href: "/admin/monitoring",        active: pathname === "/admin/monitoring" },
        { label: "Job Control",      icon: Cpu,         href: "/admin/job-control",       active: pathname === "/admin/job-control" },
        { label: "Cache Control",    icon: Database,    href: "/admin/cache-control",     active: pathname === "/admin/cache-control" },
        { label: "Public Verifier",  icon: ShieldCheck, href: "/admin/public-verifier",  active: pathname === "/admin/public-verifier" },
    ]

    const resellerRoutes = [
        { label: "Transfer Credits", icon: ArrowRightLeft, href: "/dashboard/reseller/transfer", active: pathname === "/dashboard/reseller/transfer" },
    ]

    // Reusable nav link component
    const NavLink = ({ route }: { route: typeof userRoutes[0] }) => (
        <NavTooltip label={route.label} show={isSidebarCollapsed}>
            <Link
                href={route.href}
                className={cn(
                    "relative flex items-center h-9 rounded-md transition-colors group overflow-hidden w-full",
                    route.active
                        ? "bg-indigo-500/10 text-indigo-400"
                        : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
                )}
            >
                {/* Left accent border for active item */}
                {route.active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-indigo-400" />
                )}

                {/* Fixed icon box that never moves or shifts */}
                <div className="w-11 h-full flex-shrink-0 flex items-center justify-center">
                    <route.icon className={cn(
                        "h-4 w-4 transition-colors",
                        route.active ? "text-indigo-400" : "text-slate-500 group-hover:text-slate-300"
                    )} />
                </div>

                <span className={cn(
                    "text-sm font-medium whitespace-nowrap overflow-hidden pr-2",
                    isSidebarCollapsed ? "hidden" : "flex-1"
                )}>
                    {route.label}
                </span>
            </Link>
        </NavTooltip>
    )

    // Reusable section header
    const SectionHeader = ({
        section,
        label,
        Icon,
        accentColor = "text-slate-400",
    }: {
        section: "user" | "admin" | "system" | "reseller"
        label: string
        Icon: React.ElementType
        accentColor?: string
    }) => (
        <NavTooltip label={label} show={isSidebarCollapsed}>
            <button
                onClick={() => {
                    toggleSection(section)
                }}
                className="flex items-center w-full h-8 mb-1 focus:outline-none group overflow-hidden rounded-md hover:bg-slate-800/30 transition-colors"
            >
                {/* Fixed icon */}
                <div className="w-11 h-full flex-shrink-0 flex items-center justify-center">
                    <div className="h-6 w-6 rounded flex items-center justify-center transition-colors bg-slate-800/40 border border-slate-700/50 shadow-sm group-hover:bg-slate-700/50">
                        <Icon className={cn("h-3.5 w-3.5 transition-colors group-hover:text-slate-200", accentColor)} />
                    </div>
                </div>

                {/* Label + chevron — hidden when collapsed */}
                <div className={cn(
                    "flex items-center justify-between overflow-hidden flex-1 pr-2",
                    isSidebarCollapsed ? "hidden" : "w-auto opacity-100"
                )}>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider group-hover:text-slate-300 transition-colors whitespace-nowrap">
                        {label}
                    </span>
                    {openSection === section
                        ? <ChevronDown className="h-3 w-3 text-slate-500 flex-shrink-0" />
                        : <ChevronRight className="h-3 w-3 text-slate-500 flex-shrink-0" />
                    }
                </div>
            </button>
        </NavTooltip>
    )

    // Animated section list
    const SectionList = ({ routes, isOpen }: { routes: typeof userRoutes; isOpen: boolean }) => (
        <div
            className={cn(
                "overflow-hidden transition-all duration-300 ease-in-out",
                isOpen ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
            )}
        >
            <div className="space-y-0.5 mt-1 pb-1">
                {routes.map(route => <NavLink key={route.href} route={route} />)}
            </div>
        </div>
    )

    return (
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-2.5 custom-scrollbar space-y-1">

            {/* ── My Workspace (User) ─────────────────────── */}
            <div className="mb-1">
                <SectionHeader section="user" label="My Workspace" Icon={User} />
                <SectionList routes={userRoutes} isOpen={openSection === "user"} />
            </div>

            {/* ── Reseller Portal — reseller role only ─────── */}
            {userRole === 'reseller' && (
                <div className="mb-1">
                    <SectionHeader section="reseller" label="Reseller Portal" Icon={Package} accentColor="text-amber-400" />
                    <SectionList routes={resellerRoutes} isOpen={openSection === "reseller"} />
                </div>
            )}

            {/* ── Administration — admin only ───────────────── */}
            {userRole === 'admin' && (
                <div className="mb-1">
                    <SectionHeader section="admin" label="Administration" Icon={ShieldCheck} accentColor="text-rose-400" />
                    <SectionList routes={adminRoutes} isOpen={openSection === "admin"} />
                </div>
            )}

            {/* ── System & Worker — admin only ──────────────── */}
            {userRole === 'admin' && (
                <div className="mb-1">
                    <SectionHeader section="system" label="System" Icon={Activity} accentColor="text-emerald-400" />
                    <SectionList routes={systemRoutes} isOpen={openSection === "system"} />
                </div>
            )}
        </div>
    )
}
