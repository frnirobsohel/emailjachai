"use client"

import { useState, useEffect } from "react"
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
            const adminTopPaths = ["/admin", "/admin/users", "/admin/domains", "/admin/brand-build", "/admin/smtp", "/admin/packages", "/admin/settings/payment", "/admin/license"]

            if (systemPaths.includes(pathname)) {
                setOpenSection("system")
            } else if (adminTopPaths.some(p => pathname === p)) {
                setOpenSection("admin")
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
        {
            label: "Dashboard",
            icon: LayoutDashboard,
            href: "/dashboard",
            active: pathname === "/dashboard",
        },
        {
            label: "Single Verify",
            icon: MailCheck,
            href: "/dashboard/single-verify",
            active: pathname === "/dashboard/single-verify",
        },
        {
            label: "Bulk Upload",
            icon: UploadCloud,
            href: "/dashboard/bulk-upload",
            active: pathname === "/dashboard/bulk-upload",
        },
        {
            label: "Jobs",
            icon: ListTodo,
            href: "/dashboard/jobs",
            active: pathname === "/dashboard/jobs",
        },
        {
            label: "Buy Credits",
            icon: CreditCard,
            href: "/dashboard/credits",
            active: pathname === "/dashboard/credits",
        },
        {
            label: "Credits History",
            icon: History,
            href: "/dashboard/credits/history",
            active: pathname === "/dashboard/credits/history",
        },
        {
            label: "API Keys",
            icon: Key,
            href: "/dashboard/api-keys",
            active: pathname === "/dashboard/api-keys",
        },
    ]

    const adminRoutes = [
        {
            label: "Dashboard",
            icon: LayoutDashboard,
            href: "/admin",
            active: pathname === "/admin",
        },
        {
            label: "Manage Users",
            icon: Users,
            href: "/admin/users",
            active: pathname === "/admin/users",
        },
        {
            label: "Domain List",
            icon: Globe,
            href: "/admin/domains",
            active: pathname === "/admin/domains",
        },
        {
            label: "Brand Settings",
            icon: Palette,
            href: "/admin/brand-build",
            active: pathname === "/admin/brand-build",
        },
        {
            label: "SMTP Settings",
            icon: Server,
            href: "/admin/smtp",
            active: pathname === "/admin/smtp",
        },
        {
            label: "Package Manage",
            icon: Package,
            href: "/admin/packages",
            active: pathname === "/admin/packages",
        },
        {
            label: "Payment Settings",
            icon: Wallet,
            href: "/admin/settings/payment",
            active: pathname === "/admin/settings/payment",
        },
        {
            label: "Update and Licence",
            icon: RefreshCw,
            href: "/admin/license",
            active: pathname === "/admin/license",
        },
    ]

    const systemRoutes = [
        {
            label: "Log View",
            icon: FileText,
            href: "/admin/logs",
            active: pathname === "/admin/logs",
        },
        {
            label: "Backend Server",
            icon: Terminal,
            href: "/admin/server",
            active: pathname === "/admin/server",
        },
        {
            label: "Server Monitoring",
            icon: Gauge,
            href: "/admin/monitoring",
            active: pathname === "/admin/monitoring",
        },
        {
            label: "Job Control",
            icon: Cpu,
            href: "/admin/job-control",
            active: pathname === "/admin/job-control",
        },
        {
            label: "Cache Control",
            icon: Database,
            href: "/admin/cache-control",
            active: pathname === "/admin/cache-control",
        },
        {
            label: "Public Verifier",
            icon: ShieldCheck,
            href: "/admin/public-verifier",
            active: pathname === "/admin/public-verifier",
        },
    ]

    const resellerRoutes = [
        {
            label: "Transfer Credits",
            icon: ArrowRightLeft,
            href: "/dashboard/reseller/transfer",
            active: pathname === "/dashboard/reseller/transfer",
        },
    ]

    return (
        <div className="flex-1 overflow-y-auto py-6 px-3 custom-scrollbar">
            {/* User Area Group */}
            <div className="mb-2">
                <button
                    onClick={() => {
                        if (isSidebarCollapsed) toggleSidebarCollapse()
                        toggleSection("user")
                    }}
                    className="flex items-center w-full h-8 mb-1 focus:outline-none group overflow-hidden rounded-md hover:bg-slate-800/30 transition-colors"
                    title={isSidebarCollapsed ? "User Area" : undefined}
                >
                    {/* Fixed Icon Container */}
                    <div className="w-10 flex-shrink-0 flex items-center justify-center">
                        <div className="h-6 w-6 rounded flex items-center justify-center transition-colors bg-slate-800/40 border border-slate-700/50 shadow-sm group-hover:bg-slate-700/50">
                            <User className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-300 transition-colors" />
                        </div>
                    </div>
                    
                    {/* Shrinking Text Container */}
                    <div className={cn(
                        "flex items-center justify-between overflow-hidden transition-all duration-300 flex-1",
                        isSidebarCollapsed ? "w-0 opacity-0 pr-0" : "w-auto opacity-100 pr-2"
                    )}>
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider group-hover:text-slate-300 transition-colors">User Area</span>
                        {openSection === "user" ? <ChevronDown className="h-3 w-3 text-slate-500" /> : <ChevronRight className="h-3 w-3 text-slate-500" />}
                    </div>
                </button>

                {openSection === "user" && (
                    <div className="space-y-0.5 mt-1">
                        {userRoutes.map((route) => (
                            <Link
                                key={route.href}
                                href={route.href}
                                className={cn(
                                    "flex items-center px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 group relative",
                                    route.active
                                        ? "bg-[#0f172b] text-white shadow-sm"
                                        : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                                )}
                                title={isSidebarCollapsed ? route.label : undefined}
                            >
                                <route.icon className={cn(
                                    "mr-3 h-4 w-4 flex-shrink-0 transition-colors",
                                    route.active ? "text-white" : "text-slate-500 group-hover:text-slate-300"
                                )} />
                                <span className={cn(
                                    "overflow-hidden whitespace-nowrap transition-all duration-300",
                                    isSidebarCollapsed ? "w-0 opacity-0" : "w-[150px] opacity-100"
                                )}>
                                    {route.label}
                                </span>
                            </Link>
                        ))}
                    </div>
                )}
            </div>

            {/* Reseller Area Group — শুধু reseller role হলে দেখাবে */}
            {userRole === 'reseller' && (
                <div className="mb-2">
                    <button
                        onClick={() => {
                            if (isSidebarCollapsed) toggleSidebarCollapse()
                            toggleSection("reseller")
                        }}
                        className="flex items-center w-full h-8 mb-1 focus:outline-none group overflow-hidden rounded-md hover:bg-slate-800/30 transition-colors"
                        title={isSidebarCollapsed ? "Reseller Area" : undefined}
                    >
                        {/* Fixed Icon Container */}
                        <div className="w-10 flex-shrink-0 flex items-center justify-center">
                            <div className="h-6 w-6 rounded flex items-center justify-center transition-colors bg-slate-800/40 border border-slate-700/50 shadow-sm group-hover:bg-slate-700/50">
                                <Package className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-300 transition-colors" />
                            </div>
                        </div>
                        
                        {/* Shrinking Text Container */}
                        <div className={cn(
                            "flex items-center justify-between overflow-hidden transition-all duration-300 flex-1",
                            isSidebarCollapsed ? "w-0 opacity-0 pr-0" : "w-auto opacity-100 pr-2"
                        )}>
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider group-hover:text-slate-300 transition-colors">Reseller Area</span>
                            {openSection === "reseller" ? <ChevronDown className="h-3 w-3 text-slate-500" /> : <ChevronRight className="h-3 w-3 text-slate-500" />}
                        </div>
                    </button>

                    {openSection === "reseller" && (
                        <div className="space-y-0.5 mt-1">
                            {resellerRoutes.map((route) => (
                                <Link
                                    key={route.href}
                                    href={route.href}
                                    className={cn(
                                        "flex items-center px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 group relative",
                                        route.active
                                            ? "bg-[#0f172b] text-white shadow-sm"
                                            : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                                    )}
                                    title={isSidebarCollapsed ? route.label : undefined}
                                >
                                    <route.icon className={cn(
                                        "mr-3 h-4 w-4 flex-shrink-0 transition-colors",
                                        route.active ? "text-white" : "text-slate-500 group-hover:text-slate-300"
                                    )} />
                                    <span className={cn(
                                        "overflow-hidden whitespace-nowrap transition-all duration-300",
                                        isSidebarCollapsed ? "w-0 opacity-0" : "w-[150px] opacity-100"
                                    )}>
                                        {route.label}
                                    </span>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Admin Area Group — শুধু admin role হলে দেখাবে */}
            {userRole === 'admin' && (
                <div className="mb-2">
                    <button
                        onClick={() => {
                            if (isSidebarCollapsed) toggleSidebarCollapse()
                            toggleSection("admin")
                        }}
                        className="flex items-center w-full h-8 mb-1 focus:outline-none group overflow-hidden rounded-md hover:bg-slate-800/30 transition-colors"
                        title={isSidebarCollapsed ? "Admin Area" : undefined}
                    >
                        {/* Fixed Icon Container */}
                        <div className="w-10 flex-shrink-0 flex items-center justify-center">
                            <div className="h-6 w-6 rounded flex items-center justify-center transition-colors bg-slate-800/40 border border-slate-700/50 shadow-sm group-hover:bg-slate-700/50">
                                <ShieldCheck className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-300 transition-colors" />
                            </div>
                        </div>
                        
                        {/* Shrinking Text Container */}
                        <div className={cn(
                            "flex items-center justify-between overflow-hidden transition-all duration-300 flex-1",
                            isSidebarCollapsed ? "w-0 opacity-0 pr-0" : "w-auto opacity-100 pr-2"
                        )}>
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider group-hover:text-slate-300 transition-colors">Admin Area</span>
                            {openSection === "admin" ? <ChevronDown className="h-3 w-3 text-slate-500" /> : <ChevronRight className="h-3 w-3 text-slate-500" />}
                        </div>
                    </button>

                    {openSection === "admin" && (
                        <div className="space-y-0.5 mt-1">
                            {adminRoutes.map((route) => (
                                <Link
                                    key={route.href}
                                    href={route.href}
                                    className={cn(
                                        "flex items-center px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 group relative",
                                        route.active
                                            ? "bg-[#0f172b] text-white shadow-sm"
                                            : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                                    )}
                                    title={isSidebarCollapsed ? route.label : undefined}
                                >
                                    <route.icon className={cn(
                                        "mr-3 h-4 w-4 flex-shrink-0 transition-colors",
                                        route.active ? "text-white" : "text-slate-500 group-hover:text-slate-300"
                                    )} />
                                    <span className={cn(
                                        "overflow-hidden whitespace-nowrap transition-all duration-300",
                                        isSidebarCollapsed ? "w-0 opacity-0" : "w-[150px] opacity-100"
                                    )}>
                                        {route.label}
                                    </span>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Worker Area Group — শুধু admin role হলে দেখাবে */}
            {userRole === 'admin' && (
                <div className="mb-2">
                    <button
                        onClick={() => {
                            if (isSidebarCollapsed) toggleSidebarCollapse()
                            toggleSection("system")
                        }}
                        className="flex items-center w-full h-8 mb-1 focus:outline-none group overflow-hidden rounded-md hover:bg-slate-800/30 transition-colors"
                        title={isSidebarCollapsed ? "Worker Area" : undefined}
                    >
                        {/* Fixed Icon Container */}
                        <div className="w-10 flex-shrink-0 flex items-center justify-center">
                            <div className="h-6 w-6 rounded flex items-center justify-center transition-colors bg-slate-800/40 border border-slate-700/50 shadow-sm group-hover:bg-slate-700/50">
                                <Activity className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-300 transition-colors" />
                            </div>
                        </div>
                        
                        {/* Shrinking Text Container */}
                        <div className={cn(
                            "flex items-center justify-between overflow-hidden transition-all duration-300 flex-1",
                            isSidebarCollapsed ? "w-0 opacity-0 pr-0" : "w-auto opacity-100 pr-2"
                        )}>
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider group-hover:text-slate-300 transition-colors">Worker Area</span>
                            {openSection === "system" ? <ChevronDown className="h-3 w-3 text-slate-500" /> : <ChevronRight className="h-3 w-3 text-slate-500" />}
                        </div>
                    </button>

                    {openSection === "system" && (
                        <div className="space-y-0.5 mt-1">
                            {systemRoutes.map((route) => (
                                <Link
                                    key={route.href}
                                    href={route.href}
                                    className={cn(
                                        "flex items-center px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 group relative",
                                        route.active
                                            ? "bg-[#0f172b] text-white shadow-sm"
                                            : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                                    )}
                                    title={isSidebarCollapsed ? route.label : undefined}
                                >
                                    <route.icon className={cn(
                                        "mr-3 h-4 w-4 flex-shrink-0 transition-colors",
                                        route.active ? "text-white" : "text-slate-500 group-hover:text-slate-300"
                                    )} />
                                    <span className={cn(
                                        "overflow-hidden whitespace-nowrap transition-all duration-300",
                                        isSidebarCollapsed ? "w-0 opacity-0" : "w-[150px] opacity-100"
                                    )}>
                                        {route.label}
                                    </span>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
